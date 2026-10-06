import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { CrashBet, CrashRound } from '@prisma/client';
import { prisma, transaction, isUniqueViolation, type Tx } from '@/server/db';
import { redis } from '@/server/redis';
import { AppError } from '@/lib/errors';
import { toBig, toNum } from '@/lib/money';
import { logger } from '@/server/logger';
import { devToolsEnabled } from '@/server/env';
import { PostCommit } from '@/server/realtime/events';
import { lockWallet } from '@/server/services/wallet/wallet-service';
import { placeWager, creditPayout, refundWager } from '@/server/services/wagering';
import { recordRound, bumpMax, bumpMaxInt } from '@/server/services/progression/stats';
import { getSetting } from '@/server/services/settings/settings-service';
import { consumeForcedOutcome } from '@/server/services/dev/forced-outcomes';
import {
  CRASH_SALT,
  crashPayout,
  crashPointFromHash,
  crashTimeMs,
  isBeforeCrash,
  multiplierX100At,
} from '@/engines/crash/crash-math';
import type {
  CrashBetPublic,
  CrashRoundDetailData,
  CrashHistoryItem,
  CrashMyBet,
  CrashPublicUser,
  CrashRoundInfo,
  CrashRoundPublic,
  CrashSnapshot,
  CrashStatePayload,
} from '@/engines/crash/types';
import type { RoundDetail } from '@/lib/round-detail';

/**
 * Launch (crash) — authoritative round + bet service.
 *
 * Every function takes an explicit `now` (epoch ms) so the round controller
 * and tests can inject a clock. All balance movement goes through
 * placeWager / creditPayout / refundWager with deterministic ledger keys:
 *
 *   crash:<betId>:bet       stake
 *   crash:<betId>:cashout   gross payout (floor(amount · m / 100))
 *   crash:<betId>:refund    stake returned when a round is voided
 *
 * Bet status transitions are conditional (`updateMany … where status=ACTIVE`)
 * so a cash-out, an auto cash-out and settlement can never both apply.
 *
 * Voided rounds are marked SETTLED with `crashedAt = null` (no schema change
 * needed); their ACTIVE bets are REFUNDED.
 */

export const CRASH_ROOM = 'crash';
/** Betting closes → this pause → launch. */
export const LOCK_MS = 400;
/** After the crash, wait this long for in-flight cash-outs before settling. */
export const SETTLE_GRACE_MS = 350;
/** Result is shown for this long (from the crash) before the next round opens. */
export const INTERMISSION_MS = 3_000;
/** A RUNNING round discovered this long after its crash time is voided (outage). */
export const VOID_AFTER_MS = 30_000;
const DEV_COUNTDOWN_KEY = 'dev:crash:countdownMs';

export const nodeCrashPoint = (seed: string, salt: string) =>
  crashPointFromHash(createHmac('sha256', seed).update(salt).digest('hex'));

const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex');

// ─────────────────────────────────────────────────────────────
// Serialisation
// ─────────────────────────────────────────────────────────────

type UserPick = { username: string; displayName: string; level: number; avatarUrl: string | null; privacy: string };
const USER_SELECT = { username: true, displayName: true, level: true, avatarUrl: true, privacy: true } as const;
type BetWithUser = CrashBet & { user: UserPick };

export function publicUser(u: UserPick): CrashPublicUser {
  if (u.privacy === 'PRIVATE') return { username: 'hidden', displayName: 'Hidden player', level: 0, avatarUrl: null, hidden: true };
  return { username: u.username, displayName: u.displayName, level: u.level, avatarUrl: u.avatarUrl };
}

export function publicBet(b: BetWithUser): CrashBetPublic {
  return {
    id: b.id,
    user: publicUser(b.user),
    slot: (b.slot === 1 ? 1 : 0) as 0 | 1,
    amount: toNum(b.amount),
    cashoutAt: b.cashoutAt,
    payout: b.status === 'CASHED_OUT' || b.status === 'REFUNDED' ? toNum(b.payout) : null,
    status: b.status,
  };
}

export function myBet(b: BetWithUser): CrashMyBet {
  return { ...publicBet(b), roundId: b.roundId, autoCashout: b.autoCashout, clientRequestId: b.clientRequestId };
}

const revealed = (r: CrashRound) => r.status === 'CRASHED' || r.status === 'SETTLED';
const isVoided = (r: CrashRound) => r.status === 'SETTLED' && r.crashedAt === null;
const isForced = (r: CrashRound) => nodeCrashPoint(r.seed, r.salt) !== r.crashPoint;

export function publicRound(r: CrashRound, now: number): CrashRoundPublic {
  const out: CrashRoundPublic = {
    id: r.id,
    number: r.roundNumber,
    status: r.status,
    seedHash: r.seedHash,
    salt: r.salt,
    openedAt: r.createdAt.getTime(),
    bettingEndsAt: r.bettingEndsAt.getTime(),
    startedAt: r.startedAt?.getTime() ?? null,
    crashedAt: r.crashedAt?.getTime() ?? null,
    serverTime: now,
  };
  // The seed (and therefore the crash point) is secret until the round crashes.
  if (revealed(r)) {
    out.crashPoint = r.crashPoint;
    out.seed = r.seed;
    if (isForced(r)) out.forced = true;
    if (isVoided(r)) out.voided = true;
  }
  return out;
}

const betOrder = (a: CrashBetPublic, b: CrashBetPublic) => b.amount - a.amount || a.id.localeCompare(b.id);

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

export async function countdownMs(tx?: Tx): Promise<number> {
  if (devToolsEnabled()) {
    const raw = await redis.get(DEV_COUNTDOWN_KEY).catch(() => null);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n) && n >= 500 && n <= 120_000) return Math.floor(n);
  }
  return (await getSetting('game.crash', tx)).countdownMs;
}

// ─────────────────────────────────────────────────────────────
// Round lifecycle (driven by the leader's controller)
// ─────────────────────────────────────────────────────────────

/** Latest round that is not yet SETTLED (oldest first if several). */
export function activeRounds() {
  return prisma.crashRound.findMany({ where: { status: { not: 'SETTLED' } }, orderBy: { roundNumber: 'asc' } });
}

export function latestRound() {
  return prisma.crashRound.findFirst({ orderBy: { roundNumber: 'desc' } });
}

export async function createRound(now: number, opts: { countdownMs?: number } = {}): Promise<CrashRound> {
  const ms = opts.countdownMs ?? (await countdownMs());
  const seed = randomBytes(32).toString('hex');
  const forced = await consumeForcedOutcome<{ crashPointX100: number }>('crash', 'global');
  const forcedPoint = forced && Number.isInteger(forced.crashPointX100) && forced.crashPointX100 >= 100 ? forced.crashPointX100 : null;
  // Forced rounds keep a random seed: crashPoint(seed, salt) ≠ stored point, so
  // they are detectably unverifiable (see isForced).
  const crashPoint = forcedPoint ?? nodeCrashPoint(seed, CRASH_SALT);
  return prisma.crashRound.create({
    data: {
      status: 'WAITING',
      seed,
      seedHash: sha256Hex(seed),
      salt: CRASH_SALT,
      crashPoint,
      bettingEndsAt: new Date(now + ms),
    },
  });
}

/** WAITING → BETTING_LOCKED (conditional; waits for in-flight bet transactions). */
export async function lockBetting(roundId: string, _now: number) {
  const res = await prisma.crashRound.updateMany({ where: { id: roundId, status: 'WAITING' }, data: { status: 'BETTING_LOCKED' } });
  return res.count === 1;
}

/** BETTING_LOCKED → RUNNING. */
export async function startRound(roundId: string, now: number) {
  const res = await prisma.crashRound.updateMany({
    where: { id: roundId, status: 'BETTING_LOCKED' },
    data: { status: 'RUNNING', startedAt: new Date(now) },
  });
  return res.count === 1;
}

/** RUNNING → CRASHED; crashedAt is the exact crash instant. */
export async function markCrashed(round: CrashRound) {
  if (!round.startedAt) throw new Error('round has not started');
  const at = new Date(Math.ceil(crashTimeMs(round.startedAt.getTime(), round.crashPoint)));
  const res = await prisma.crashRound.updateMany({ where: { id: round.id, status: 'RUNNING' }, data: { status: 'CRASHED', crashedAt: at } });
  return res.count === 1;
}

/** ACTIVE auto-cash-out bets whose target beats the crash point (the loop pays them as m reaches the target). */
export async function pendingAutoCashouts(roundId: string, crashPoint: number) {
  return prisma.crashBet.findMany({
    where: { roundId, status: 'ACTIVE', autoCashout: { not: null, lt: crashPoint } },
    select: { id: true, autoCashout: true },
  });
}

/**
 * Cash a bet out at an exact multiplier inside `tx`. Conditional on ACTIVE;
 * returns the updated bet, or null if it was no longer ACTIVE.
 */
async function applyCashout(tx: Tx, bet: CrashBet, atX100: number, post: PostCommit, source: 'manual' | 'auto') {
  const payout = crashPayout(bet.amount, atX100);
  const res = await tx.crashBet.updateMany({
    where: { id: bet.id, status: 'ACTIVE' },
    data: { status: 'CASHED_OUT', cashoutAt: atX100, payout },
  });
  if (res.count !== 1) return null;
  await creditPayout(
    tx,
    {
      userId: bet.userId,
      game: 'CRASH',
      amount: payout,
      referenceType: 'CRASH_BET',
      referenceId: bet.id,
      idempotencyKey: `crash:${bet.id}:cashout`,
      metadata: { roundId: bet.roundId, cashoutAt: atX100, source },
    },
    post,
  );
  const updated = await tx.crashBet.findUniqueOrThrow({ where: { id: bet.id }, include: { user: { select: USER_SELECT } } });
  const pub = publicBet(updated);
  post.push({
    scope: 'room',
    room: CRASH_ROOM,
    event: 'crash:cashout',
    data: { roundId: bet.roundId, betId: bet.id, username: pub.user.username, slot: pub.slot, cashoutAt: atX100, payout: toNum(payout) },
  });
  post.user(bet.userId, 'crash:mybet', myBet(updated));
  return updated;
}

/** Process one auto cash-out at its exact target. Idempotent. */
export async function autoCashout(betId: string) {
  const post = new PostCommit();
  const done = await transaction(async (tx) => {
    const bet = await tx.crashBet.findUnique({ where: { id: betId }, include: { round: true } });
    if (!bet || bet.status !== 'ACTIVE' || bet.autoCashout === null) return null;
    if (bet.autoCashout >= bet.round.crashPoint) return null; // ties at the crash point lose
    if (bet.round.status !== 'RUNNING' && bet.round.status !== 'CRASHED') return null;
    return applyCashout(tx, bet, bet.autoCashout, post, 'auto');
  });
  await post.flush();
  return done;
}

/**
 * Settle a CRASHED round: pay any auto cash-outs that beat the crash (at
 * their targets), mark remaining ACTIVE bets LOST, write history/stats per
 * bet, then CRASHED → SETTLED. Safe to run any number of times.
 */
export async function settleRound(roundId: string, now: number) {
  const post = new PostCommit();
  const settled = await transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<CrashRound[]>`SELECT * FROM "CrashRound" WHERE id = ${roundId} FOR UPDATE`;
      const round = rows[0];
      if (!round || round.status === 'SETTLED') return false;
      if (round.status !== 'CRASHED') throw new Error(`cannot settle round in status ${round.status}`);

      const autos = await tx.crashBet.findMany({
        where: { roundId, status: 'ACTIVE', autoCashout: { not: null, lt: round.crashPoint } },
        orderBy: { id: 'asc' },
      });
      for (const b of autos) await applyCashout(tx, b, b.autoCashout!, post, 'auto');

      const at = new Date(now);
      await tx.crashBet.updateMany({ where: { roundId, status: 'ACTIVE' }, data: { status: 'LOST', payout: 0n, settledAt: at } });
      await tx.crashBet.updateMany({ where: { roundId, status: 'CASHED_OUT', settledAt: null }, data: { settledAt: at } });

      const bets = await tx.crashBet.findMany({ where: { roundId }, orderBy: { id: 'asc' } });
      for (const b of bets) await recordBet(tx, b, round.crashPoint);

      const res = await tx.crashRound.updateMany({ where: { id: roundId, status: 'CRASHED' }, data: { status: 'SETTLED', settledAt: at } });
      return res.count === 1;
    },
    { timeout: 30_000 },
  );
  await post.flush();
  return settled;
}

async function recordBet(tx: Tx, b: CrashBet, crashPoint: number) {
  if (b.status !== 'CASHED_OUT' && b.status !== 'LOST') return;
  const won = b.status === 'CASHED_OUT';
  const recorded = await recordRound(tx, {
    userId: b.userId,
    game: 'CRASH',
    referenceId: b.id,
    wager: b.amount,
    payout: won ? b.payout : 0n,
    multiplierX100: won ? b.cashoutAt : null,
    summary: won ? `Cashed out ${(b.cashoutAt! / 100).toFixed(2)}×` : `Crashed at ${(crashPoint / 100).toFixed(2)}×`,
    extraStats: { crashRounds: { increment: 1 } },
  });
  if (recorded && won) {
    await bumpMaxInt(tx, b.userId, 'crashHighestCashout', b.cashoutAt!);
    await bumpMax(tx, b.userId, 'crashLargestWin', b.payout);
  }
}

/**
 * Void a round that cannot be resumed. Auto cash-outs that had provably been
 * reached (target < crash point, round started) are honoured; every other
 * ACTIVE bet is refunded. Marks the round SETTLED with crashedAt = null.
 */
export async function voidRound(roundId: string, now: number, reason: string) {
  const post = new PostCommit();
  const done = await transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<CrashRound[]>`SELECT * FROM "CrashRound" WHERE id = ${roundId} FOR UPDATE`;
      const round = rows[0];
      if (!round || round.status === 'SETTLED') return false;
      if (round.startedAt && (round.status === 'RUNNING' || round.status === 'CRASHED')) {
        const autos = await tx.crashBet.findMany({
          where: { roundId, status: 'ACTIVE', autoCashout: { not: null, lt: round.crashPoint } },
          orderBy: { id: 'asc' },
        });
        for (const b of autos) await applyCashout(tx, b, b.autoCashout!, post, 'auto');
      }
      const active = await tx.crashBet.findMany({ where: { roundId, status: 'ACTIVE' }, orderBy: { id: 'asc' } });
      const at = new Date(now);
      for (const b of active) {
        const res = await tx.crashBet.updateMany({ where: { id: b.id, status: 'ACTIVE' }, data: { status: 'REFUNDED', payout: b.amount, settledAt: at } });
        if (res.count !== 1) continue;
        await refundWager(
          tx,
          { userId: b.userId, amount: b.amount, referenceType: 'CRASH_BET', referenceId: b.id, idempotencyKey: `crash:${b.id}:refund`, reason },
          post,
        );
      }
      const cashed = await tx.crashBet.findMany({ where: { roundId, status: 'CASHED_OUT' } });
      for (const b of cashed) {
        if (!b.settledAt) await tx.crashBet.update({ where: { id: b.id }, data: { settledAt: at } });
        await recordBet(tx, b, round.crashPoint);
      }
      await tx.crashRound.update({ where: { id: roundId }, data: { status: 'SETTLED', settledAt: at, crashedAt: null } });
      return true;
    },
    { timeout: 30_000 },
  );
  await post.flush();
  if (done) logger.warn({ roundId, reason }, 'crash round voided');
  return done;
}

// ─────────────────────────────────────────────────────────────
// Player actions
// ─────────────────────────────────────────────────────────────

export interface PlaceBetInput {
  slot: 0 | 1;
  amount: number;
  autoCashout?: number | null;
  requestId: string;
}

/**
 * Place a bet on the open round. Only while WAITING and before bettingEndsAt.
 * Replaying the same requestId returns the original bet.
 */
export async function placeBet(userId: string, input: PlaceBetInput, now: number): Promise<{ bet: CrashMyBet; replay: boolean }> {
  const post = new PostCommit();
  try {
    const out = await transaction(async (tx) => {
      await lockWallet(tx, userId);
      const existing = await tx.crashBet.findUnique({
        where: { userId_clientRequestId: { userId, clientRequestId: input.requestId } },
        include: { user: { select: USER_SELECT } },
      });
      if (existing) return { bet: myBet(existing), replay: true };

      // FOR SHARE: concurrent bets proceed; the leader's WAITING → LOCKED
      // update waits for them, so no bet can land after betting closes.
      const rows = await tx.$queryRaw<CrashRound[]>`
        SELECT * FROM "CrashRound" WHERE status = 'WAITING' ORDER BY "roundNumber" DESC LIMIT 1 FOR SHARE`;
      const round = rows[0];
      if (!round || now >= round.bettingEndsAt.getTime()) {
        throw new AppError('ROUND_CLOSED', 'Betting for this round has closed. Bet on the next launch.');
      }

      const cfg = await getSetting('game.crash', tx);
      const auto = input.autoCashout ?? null;
      if (auto !== null && (auto < 101 || auto > cfg.maxAutoCashoutX100)) {
        throw new AppError('VALIDATION', `Auto cash-out must be between 1.01× and ${(cfg.maxAutoCashoutX100 / 100).toFixed(2)}×.`);
      }
      const dup = await tx.crashBet.findUnique({ where: { roundId_userId_slot: { roundId: round.id, userId, slot: input.slot } }, select: { id: true } });
      if (dup) throw new AppError('CONFLICT', `You already have Bet ${input.slot === 0 ? 'A' : 'B'} in this round.`);

      const betId = `cb${randomBytes(12).toString('hex')}`;
      const amount = toBig(input.amount);
      await placeWager(
        tx,
        {
          userId,
          game: 'CRASH',
          amount,
          referenceType: 'CRASH_BET',
          referenceId: betId,
          idempotencyKey: `crash:${betId}:bet`,
          metadata: { roundId: round.id, slot: input.slot },
        },
        post,
      );
      const bet = await tx.crashBet.create({
        data: { id: betId, roundId: round.id, userId, slot: input.slot, amount, autoCashout: auto, clientRequestId: input.requestId },
        include: { user: { select: USER_SELECT } },
      });
      post.push({ scope: 'room', room: CRASH_ROOM, event: 'crash:bet', data: { roundId: round.id, bet: publicBet(bet) } });
      post.user(userId, 'crash:mybet', myBet(bet));
      return { bet: myBet(bet), replay: false };
    });
    await post.flush();
    return out;
  } catch (err) {
    if (isUniqueViolation(err)) {
      // Concurrent duplicate (same requestId or same slot) — return the winner if it is ours.
      const again = await prisma.crashBet.findUnique({
        where: { userId_clientRequestId: { userId, clientRequestId: input.requestId } },
        include: { user: { select: USER_SELECT } },
      });
      if (again) return { bet: myBet(again), replay: true };
      throw new AppError('CONFLICT', `You already have Bet ${input.slot === 0 ? 'A' : 'B'} in this round.`);
    }
    throw err;
  }
}

/**
 * Manual cash-out. `now` must be the instant the request was RECEIVED; the
 * multiplier is derived from the server clock (elapsed since startedAt), never
 * from the client. Duplicate requests return the existing result.
 */
export async function cashout(userId: string, input: { slot: 0 | 1 }, now: number): Promise<{ bet: CrashMyBet; duplicate: boolean }> {
  const post = new PostCommit();
  const out = await transaction(async (tx) => {
    const bet = await tx.crashBet.findFirst({
      where: { userId, slot: input.slot },
      orderBy: { createdAt: 'desc' },
      include: { round: true, user: { select: USER_SELECT } },
    });
    // A bet from a long-finished round is not "this round" any more.
    const stale = bet && bet.round.status === 'SETTLED' && now - (bet.round.settledAt?.getTime() ?? 0) > INTERMISSION_MS * 2;
    if (!bet || stale) throw new AppError('ACTION_UNAVAILABLE', 'You have no active bet in this slot.');
    if (bet.status === 'CASHED_OUT') return { bet: myBet(bet), duplicate: true };
    if (bet.status === 'LOST') throw new AppError('ROUND_CLOSED', `Too late — crashed at ${(bet.round.crashPoint / 100).toFixed(2)}×.`);
    if (bet.status !== 'ACTIVE') throw new AppError('ACTION_UNAVAILABLE', 'This bet is no longer active.');
    const round = bet.round;
    if (!round.startedAt || round.status === 'WAITING' || round.status === 'BETTING_LOCKED') {
      throw new AppError('ACTION_UNAVAILABLE', 'The rocket hasn’t launched yet.');
    }
    const elapsed = now - round.startedAt.getTime();
    if (!isBeforeCrash(elapsed, round.crashPoint)) {
      throw new AppError('ROUND_CLOSED', `Too late — crashed at ${(round.crashPoint / 100).toFixed(2)}×.`);
    }
    let at = Math.max(100, multiplierX100At(elapsed));
    // An auto target that was already passed wins: cash out at exactly the target.
    if (bet.autoCashout !== null && bet.autoCashout <= at) at = bet.autoCashout;
    const updated = await applyCashout(tx, bet, at, post, 'manual');
    if (!updated) {
      const cur = await tx.crashBet.findUniqueOrThrow({ where: { id: bet.id }, include: { user: { select: USER_SELECT } } });
      if (cur.status === 'CASHED_OUT') return { bet: myBet(cur), duplicate: true };
      throw new AppError('ROUND_CLOSED', `Too late — crashed at ${(round.crashPoint / 100).toFixed(2)}×.`);
    }
    return { bet: myBet(updated), duplicate: false };
  });
  await post.flush();
  return out;
}

// ─────────────────────────────────────────────────────────────
// Read models
// ─────────────────────────────────────────────────────────────

export async function buildSnapshot(userId: string | null, now: number, round?: CrashRound | null): Promise<CrashSnapshot> {
  const r = round === undefined ? await latestRound() : round;
  if (!r) return { round: null, bets: [], ...(userId ? { me: [] } : {}) };
  const bets = await prisma.crashBet.findMany({ where: { roundId: r.id }, include: { user: { select: USER_SELECT } } });
  const snap: CrashSnapshot = { round: publicRound(r, now), bets: bets.map(publicBet).sort(betOrder) };
  if (userId) snap.me = bets.filter((b) => b.userId === userId).map(myBet);
  return snap;
}

export async function recentHistory(take = 30): Promise<CrashHistoryItem[]> {
  const rows = await prisma.crashRound.findMany({
    where: { status: { in: ['CRASHED', 'SETTLED'] }, crashedAt: { not: null } },
    orderBy: { roundNumber: 'desc' },
    take,
    select: { id: true, roundNumber: true, crashPoint: true },
  });
  return rows.map((r) => ({ id: r.id, number: r.roundNumber, crashPoint: r.crashPoint }));
}

export async function myRecentBets(userId: string, take = 20): Promise<CrashStatePayload['myRecent']> {
  const rows = await prisma.crashBet.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take,
    include: { round: { select: { roundNumber: true, crashPoint: true, status: true, crashedAt: true } } },
  });
  return rows.map((b) => ({
    id: b.id,
    roundNumber: b.round.roundNumber,
    slot: (b.slot === 1 ? 1 : 0) as 0 | 1,
    amount: toNum(b.amount),
    cashoutAt: b.cashoutAt,
    payout: toNum(b.payout),
    status: b.status,
    crashPoint: b.round.status === 'CRASHED' || b.round.status === 'SETTLED' ? b.round.crashPoint : null,
    createdAt: b.createdAt.toISOString(),
  }));
}

export async function statePayload(userId: string | null, now: number): Promise<CrashStatePayload> {
  const [snap, history, mine, cfg] = await Promise.all([
    buildSnapshot(userId, now),
    recentHistory(30),
    userId ? myRecentBets(userId) : Promise.resolve([]),
    getSetting('game.crash'),
  ]);
  return {
    ...snap,
    history,
    myRecent: mine,
    config: { minBet: cfg.minBet, maxBet: cfg.maxBet, maxAutoCashoutX100: cfg.maxAutoCashoutX100, enabled: cfg.enabled },
  };
}

/** Public fairness/summary info for a round — only once it has crashed. */
export async function roundInfo(roundId: string): Promise<CrashRoundInfo> {
  const r = await prisma.crashRound.findUnique({ where: { id: roundId } });
  if (!r) throw new AppError('NOT_FOUND', 'Round not found');
  const agg = await prisma.crashBet.aggregate({ where: { roundId }, _count: { _all: true }, _sum: { amount: true } });
  const paid = await prisma.crashBet.aggregate({ where: { roundId, status: 'CASHED_OUT' }, _sum: { payout: true } });
  const players = await prisma.crashBet.groupBy({ by: ['userId'], where: { roundId } });
  const open = revealed(r);
  return {
    id: r.id,
    number: r.roundNumber,
    crashPoint: open ? r.crashPoint : null,
    seedHash: r.seedHash,
    seed: open ? r.seed : null,
    salt: r.salt,
    startedAt: r.startedAt?.getTime() ?? null,
    crashedAt: r.crashedAt?.getTime() ?? null,
    players: players.length,
    totalWagered: toNum(agg._sum.amount ?? 0n),
    totalPaid: toNum(paid._sum.payout ?? 0n),
    forced: open ? isForced(r) : false,
    voided: isVoided(r),
  };
}


/** RoundDetail for one of the viewer's own bets (history modal + verifier). */
export async function getRoundDetail(userId: string, betId: string): Promise<RoundDetail<CrashRoundDetailData>> {
  const bet = await prisma.crashBet.findUnique({ where: { id: betId }, include: { round: true } });
  if (!bet || bet.userId !== userId) throw new AppError('NOT_FOUND', 'Round not found');
  const r = bet.round;
  const open = revealed(r);
  const payout = bet.status === 'CASHED_OUT' || bet.status === 'REFUNDED' ? bet.payout : 0n;
  const forced = open && isForced(r);
  const summary =
    bet.status === 'CASHED_OUT'
      ? `Cashed out ${(bet.cashoutAt! / 100).toFixed(2)}×`
      : bet.status === 'LOST'
        ? `Crashed at ${(r.crashPoint / 100).toFixed(2)}×`
        : bet.status === 'REFUNDED'
          ? 'Round voided — stake refunded'
          : 'In play';
  return {
    game: 'CRASH',
    id: bet.id,
    variant: null,
    createdAt: bet.createdAt.toISOString(),
    wager: toNum(bet.amount),
    payout: toNum(payout),
    net: toNum(payout - bet.amount),
    summary,
    fairness: {
      serverSeedHash: r.seedHash,
      clientSeed: r.salt,
      nonce: r.roundNumber,
      serverSeed: open ? r.seed : null,
      revealed: open,
      extra: { salt: r.salt, roundId: r.id, crashPointX100: open ? r.crashPoint : null },
    },
    forced,
    data: {
      roundId: r.id,
      roundNumber: r.roundNumber,
      slot: (bet.slot === 1 ? 1 : 0) as 0 | 1,
      amount: toNum(bet.amount),
      autoCashout: bet.autoCashout,
      cashoutAt: bet.cashoutAt,
      payout: toNum(payout),
      status: bet.status,
      crashPoint: open ? r.crashPoint : null,
      startedAt: r.startedAt?.getTime() ?? null,
      crashedAt: r.crashedAt?.getTime() ?? null,
    },
  };
}
