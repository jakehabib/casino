import type { CrashRound } from '@prisma/client';
import { prisma } from '@/server/db';
import { logger } from '@/server/logger';
import { crashTimeMs, isBeforeCrash, multiplierX100At } from '@/engines/crash/crash-math';
import type { CrashTick } from '@/engines/crash/types';
import {
  INTERMISSION_MS,
  LOCK_MS,
  SETTLE_GRACE_MS,
  VOID_AFTER_MS,
  activeRounds,
  autoCashout,
  buildSnapshot,
  createRound,
  dueAutoCashouts,
  latestRound,
  lockBetting,
  markCrashed,
  settleRound,
  startRound,
  voidRound,
} from './crash-service';

/** Injectable clock + timers (tests drive the controller manually). */
export interface CrashClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export const systemClock: CrashClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => {
    const t = setTimeout(fn, ms);
    t.unref?.();
    return t;
  },
  clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
  setInterval: (fn, ms) => {
    const t = setInterval(fn, ms);
    t.unref?.();
    return t;
  },
  clearInterval: (h) => clearInterval(h as NodeJS.Timeout),
};

export type CrashEmit = (event: string, data: unknown) => void | Promise<void>;

export interface CrashControllerOptions {
  clock?: CrashClock;
  /** Broadcast to every viewer of the crash room (all processes). */
  emit?: CrashEmit;
  tickMs?: number;
  /** Override the countdown (tests). Defaults to settings / dev override. */
  countdownMs?: number;
}

const RETRY_MS = 1_000;

/**
 * CrashController — the single round loop (only ever run by the Redis
 * leader). It is fully state-driven: every step re-reads the current round
 * from the database and performs the transition that is due, so starting a
 * controller IS the recovery procedure:
 *
 *   no round      → (after the intermission) create WAITING round
 *   WAITING       → at bettingEndsAt lock betting → BETTING_LOCKED
 *   BETTING_LOCKED→ after LOCK_MS launch → RUNNING (100ms ticks, auto cash-outs)
 *   RUNNING       → at startedAt + t(crashPoint) → CRASHED (seed revealed)
 *                   (if found long after its crash time — an outage — void it)
 *   CRASHED       → after a short grace for in-flight cash-outs → SETTLED
 *
 * All transitions are conditional updates, so two controllers racing (e.g.
 * during a leader hand-over) can never apply a step twice.
 */
export class CrashController {
  private readonly clock: CrashClock;
  private readonly emit: CrashEmit;
  private readonly tickMs: number;
  private readonly countdownOverride?: number;
  private running = false;
  private timer: unknown = null;
  private ticker: unknown = null;
  private tickRound: CrashRound | null = null;
  private autoQueue: { id: string; target: number }[] = [];
  private autoChain: Promise<unknown> = Promise.resolve();
  private stepping: Promise<void> | null = null;
  private lastEmitted = '';

  constructor(opts: CrashControllerOptions = {}) {
    this.clock = opts.clock ?? systemClock;
    this.emit = opts.emit ?? (() => undefined);
    this.tickMs = opts.tickMs ?? 100;
    this.countdownOverride = opts.countdownMs;
  }

  get isRunning() {
    return this.running;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastEmitted = '';
    logger.info('crash loop started');
    void this.step();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.timer) this.clock.clearTimeout(this.timer);
    this.timer = null;
    this.stopTicker();
    logger.info('crash loop stopped');
  }

  /** Run one state-machine step now (serialised). Returns once it finished. */
  step(): Promise<void> {
    if (this.stepping) return this.stepping;
    this.stepping = (async () => {
      let delay: number;
      try {
        delay = await this.advance();
      } catch (err) {
        logger.error({ err }, 'crash loop step failed');
        delay = RETRY_MS;
      } finally {
        this.stepping = null;
      }
      this.schedule(delay);
    })();
    return this.stepping;
  }

  private schedule(ms: number) {
    if (!this.running) return;
    if (this.timer) this.clock.clearTimeout(this.timer);
    this.timer = this.clock.setTimeout(() => {
      this.timer = null;
      void this.step();
    }, Math.max(0, Math.ceil(ms)));
  }

  private async broadcast(round: CrashRound, force = false) {
    const sig = `${round.id}:${round.status}`;
    if (!force && sig === this.lastEmitted) return;
    this.lastEmitted = sig;
    const snap = await buildSnapshot(null, this.clock.now(), round);
    await this.emit('crash:state', snap);
  }

  /** Perform whatever transition is due; returns ms until the next check. */
  async advance(): Promise<number> {
    const now = this.clock.now();
    const rounds = await activeRounds();
    // Only the newest unsettled round can be live; anything older is stale.
    for (const stale of rounds.slice(0, -1)) {
      await voidRound(stale.id, now, 'superseded');
    }
    const round = rounds.at(-1);

    if (!round) {
      this.stopTicker();
      const last = await latestRound();
      if (last && last.status === 'SETTLED') {
        const shownSince = (last.crashedAt ?? last.settledAt ?? last.createdAt).getTime();
        const wait = shownSince + INTERMISSION_MS - now;
        if (wait > 0) {
          await this.broadcast(last);
          return wait;
        }
      }
      const created = await createRound(now, { countdownMs: this.countdownOverride });
      await this.broadcast(created);
      return created.bettingEndsAt.getTime() - now;
    }

    switch (round.status) {
      case 'WAITING': {
        const left = round.bettingEndsAt.getTime() - now;
        if (left > 0) {
          await this.broadcast(round);
          return left;
        }
        await lockBetting(round.id, now);
        await this.broadcast({ ...round, status: 'BETTING_LOCKED' });
        return LOCK_MS;
      }
      case 'BETTING_LOCKED': {
        await startRound(round.id, now);
        const started = await this.reload(round.id);
        if (started.status !== 'RUNNING' || !started.startedAt) return 0;
        await this.beginRunning(started);
        await this.broadcast(started);
        return crashTimeMs(started.startedAt.getTime(), started.crashPoint) - now;
      }
      case 'RUNNING': {
        if (!round.startedAt) {
          await voidRound(round.id, now, 'missing start time');
          return 0;
        }
        const crashAt = crashTimeMs(round.startedAt.getTime(), round.crashPoint);
        if (now < crashAt) {
          if (this.tickRound?.id !== round.id) await this.beginRunning(round);
          await this.broadcast(round);
          return crashAt - now;
        }
        this.stopTicker();
        if (now - crashAt > VOID_AFTER_MS) {
          // Players could not act during the outage: honour reached auto
          // targets, refund everything else.
          await voidRound(round.id, now, 'loop interrupted');
          await this.broadcast(await this.reload(round.id), true);
          return 0;
        }
        await markCrashed(round);
        await this.broadcast(await this.reload(round.id));
        return SETTLE_GRACE_MS;
      }
      case 'CRASHED': {
        this.stopTicker();
        const crashedAt = round.crashedAt?.getTime() ?? now;
        if (now < crashedAt + SETTLE_GRACE_MS) return crashedAt + SETTLE_GRACE_MS - now;
        await this.autoChain.catch(() => undefined);
        await settleRound(round.id, now);
        await this.broadcast(await this.reload(round.id));
        return 0;
      }
      default:
        return RETRY_MS;
    }
  }

  private reload(id: string) {
    return prisma.crashRound.findUniqueOrThrow({ where: { id } });
  }

  private async beginRunning(round: CrashRound) {
    this.stopTicker();
    this.tickRound = round;
    const autos = await dueAutoCashouts(round.id, Number.MAX_SAFE_INTEGER, round.crashPoint);
    this.autoQueue = autos.map((a) => ({ id: a.id, target: a.autoCashout! })).sort((a, b) => a.target - b.target);
    this.ticker = this.clock.setInterval(() => this.tick(), this.tickMs);
    this.tick();
  }

  private stopTicker() {
    if (this.ticker) this.clock.clearInterval(this.ticker);
    this.ticker = null;
    this.tickRound = null;
    this.autoQueue = [];
  }

  /** 100ms broadcast + auto cash-out at exact targets. */
  tick() {
    const round = this.tickRound;
    if (!round?.startedAt) return;
    const now = this.clock.now();
    const elapsed = now - round.startedAt.getTime();
    if (!isBeforeCrash(elapsed, round.crashPoint)) return; // the crash step takes over
    const m = multiplierX100At(elapsed);
    const tick: CrashTick = { m, t: now };
    void Promise.resolve(this.emit('crash:tick', tick)).catch(() => undefined);
    while (this.autoQueue.length && this.autoQueue[0].target <= m) {
      const { id } = this.autoQueue.shift()!;
      this.autoChain = this.autoChain
        .then(() => autoCashout(id))
        .catch((err) => logger.error({ err, betId: id }, 'crash auto cash-out failed'));
    }
  }

  /** Wait for queued auto cash-outs (tests). */
  drain() {
    return this.autoChain;
  }
}
