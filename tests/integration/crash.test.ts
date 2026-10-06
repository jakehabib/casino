import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '@/server/db';
import { verifyWalletIntegrity } from '@/server/services/wallet/wallet-service';
import { setForcedOutcome } from '@/server/services/dev/forced-outcomes';
import {
  autoCashout,
  buildSnapshot,
  cashout,
  createRound,
  lockBetting,
  markCrashed,
  nodeCrashPoint,
  placeBet,
  roundInfo,
  getRoundDetail,
  settleRound,
  startRound,
  voidRound,
  INTERMISSION_MS,
  LOCK_MS,
  SETTLE_GRACE_MS,
  VOID_AFTER_MS,
} from '@/server/services/crash/crash-service';
import { CrashController, type CrashClock } from '@/server/services/crash/crash-controller';
import { CRASH_SALT, crashTimeMs, timeForMultiplier } from '@/engines/crash/crash-math';
import { verifyCrash } from '@/engines/crash/verify';
import { createTestUser, balanceOf, rid } from './helpers';

/** Manual clock: timers are recorded, never fired automatically. */
class FakeClock implements CrashClock {
  constructor(public t: number) {}
  now() {
    return this.t;
  }
  setTimeout() {
    return 1;
  }
  clearTimeout() {}
  setInterval() {
    return 2;
  }
  clearInterval() {}
}

async function clearRounds() {
  await prisma.crashRound.deleteMany({});
}

/** A WAITING round with a fixed crash point; returns its timeline. */
async function openRound(crashPointX100: number, base = Date.now()) {
  const r = await createRound(base, { countdownMs: 5_000 });
  await prisma.crashRound.update({ where: { id: r.id }, data: { crashPoint: crashPointX100 } });
  return { round: { ...r, crashPoint: crashPointX100 }, base, endsAt: base + 5_000 };
}

async function launch(roundId: string, at: number) {
  expect(await lockBetting(roundId, at)).toBe(true);
  expect(await startRound(roundId, at + LOCK_MS)).toBe(true);
  return at + LOCK_MS; // startedAt
}

const at = (startedAt: number, x100: number) => Math.ceil(startedAt + timeForMultiplier(x100)) + 1;

async function crashAndSettle(roundId: string) {
  const r = await prisma.crashRound.findUniqueOrThrow({ where: { id: roundId } });
  await markCrashed(r);
  const crashAt = crashTimeMs(r.startedAt!.getTime(), r.crashPoint);
  return settleRound(roundId, crashAt + SETTLE_GRACE_MS);
}

describe('Launch (crash) service', () => {
  beforeEach(clearRounds);

  it('accepts a bet while WAITING and debits the stake once (replay-safe)', async () => {
    const u = await createTestUser();
    const { base } = await openRound(250);
    const requestId = rid();
    const a = await placeBet(u.id, { slot: 0, amount: 1_000, requestId }, base + 100);
    const b = await placeBet(u.id, { slot: 0, amount: 1_000, requestId }, base + 200);
    expect(a.replay).toBe(false);
    expect(b.replay).toBe(true);
    expect(b.bet.id).toBe(a.bet.id);
    expect(await balanceOf(u.id)).toBe(99_000);
    // A second bet in the same slot is refused; slot B is independent.
    await expect(placeBet(u.id, { slot: 0, amount: 1_000, requestId: rid() }, base + 300)).rejects.toMatchObject({ code: 'CONFLICT' });
    await placeBet(u.id, { slot: 1, amount: 500, autoCashout: 200, requestId: rid() }, base + 300);
    expect(await balanceOf(u.id)).toBe(98_500);
  });

  it('rejects bets after betting closes (time or lock)', async () => {
    const u = await createTestUser();
    const { round, base, endsAt } = await openRound(250);
    await expect(placeBet(u.id, { slot: 0, amount: 1_000, requestId: rid() }, endsAt)).rejects.toMatchObject({ code: 'ROUND_CLOSED' });
    await lockBetting(round.id, endsAt);
    await expect(placeBet(u.id, { slot: 0, amount: 1_000, requestId: rid() }, base + 10)).rejects.toMatchObject({ code: 'ROUND_CLOSED' });
    expect(await balanceOf(u.id)).toBe(100_000);
  });

  it('validates the auto cash-out range', async () => {
    const u = await createTestUser();
    const { base } = await openRound(250);
    await expect(placeBet(u.id, { slot: 0, amount: 1_000, autoCashout: 100, requestId: rid() }, base)).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(placeBet(u.id, { slot: 0, amount: 1_000, autoCashout: 10_000_001, requestId: rid() }, base)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('cash-out before the crash pays floor(amount × m / 100) from the server clock', async () => {
    const u = await createTestUser();
    const { round, base, endsAt } = await openRound(500);
    await placeBet(u.id, { slot: 0, amount: 333, requestId: rid() }, base);
    const startedAt = await launch(round.id, endsAt);
    const when = at(startedAt, 231);
    const res = await cashout(u.id, { slot: 0 }, when);
    expect(res.duplicate).toBe(false);
    expect(res.bet.cashoutAt).toBe(231);
    expect(res.bet.payout).toBe(Math.floor((333 * 231) / 100));
    expect(await balanceOf(u.id)).toBe(100_000 - 333 + 769);
  });

  it('cash-out at or after the crash is rejected (ties lose)', async () => {
    const u = await createTestUser();
    const { round, base, endsAt } = await openRound(180);
    await placeBet(u.id, { slot: 0, amount: 1_000, requestId: rid() }, base);
    const startedAt = await launch(round.id, endsAt);
    const crashAt = crashTimeMs(startedAt, 180);
    await expect(cashout(u.id, { slot: 0 }, Math.ceil(crashAt))).rejects.toMatchObject({ code: 'ROUND_CLOSED' });
    await expect(cashout(u.id, { slot: 0 }, crashAt + 5_000)).rejects.toMatchObject({ code: 'ROUND_CLOSED' });
    // Not launched yet → unavailable (separate round)
    expect(await balanceOf(u.id)).toBe(99_000);
  });

  it('a duplicate cash-out pays exactly once (sequential and concurrent)', async () => {
    const u = await createTestUser();
    const { round, base, endsAt } = await openRound(1_000);
    await placeBet(u.id, { slot: 0, amount: 1_000, requestId: rid() }, base);
    const startedAt = await launch(round.id, endsAt);
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => cashout(u.id, { slot: 0 }, at(startedAt, 300) + i * 50)),
    );
    const ok = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof cashout>>>[];
    expect(ok.length).toBeGreaterThan(0);
    expect(ok.filter((r) => !r.value.duplicate)).toHaveLength(1);
    const again = await cashout(u.id, { slot: 0 }, at(startedAt, 600));
    expect(again.duplicate).toBe(true);
    const wins = await prisma.walletTransaction.findMany({ where: { userId: u.id, type: 'WIN' } });
    expect(wins).toHaveLength(1);
    expect(await balanceOf(u.id)).toBe(99_000 + Number(wins[0].amount));
    expect((await verifyWalletIntegrity(u.id)).ok).toBe(true);
  });

  it('a manual cash-out after the auto target was passed pays exactly the target', async () => {
    const u = await createTestUser();
    const { round, base, endsAt } = await openRound(800);
    await placeBet(u.id, { slot: 0, amount: 1_000, autoCashout: 150, requestId: rid() }, base);
    const startedAt = await launch(round.id, endsAt);
    const res = await cashout(u.id, { slot: 0 }, at(startedAt, 210));
    expect(res.bet.cashoutAt).toBe(150);
    expect(res.bet.payout).toBe(1_500);
  });

  it('settles: losers LOST, history + stats recorded once, idempotent', async () => {
    const win = await createTestUser();
    const lose = await createTestUser();
    const { round, base, endsAt } = await openRound(300);
    await placeBet(win.id, { slot: 0, amount: 2_000, requestId: rid() }, base);
    await placeBet(lose.id, { slot: 0, amount: 1_000, requestId: rid() }, base);
    const startedAt = await launch(round.id, endsAt);
    await cashout(win.id, { slot: 0 }, at(startedAt, 250));
    expect(await crashAndSettle(round.id)).toBe(true);
    expect(await settleRound(round.id, Date.now() + 60_000)).toBe(false); // second run is a no-op

    const bets = await prisma.crashBet.findMany({ where: { roundId: round.id } });
    expect(bets.find((b) => b.userId === lose.id)!.status).toBe('LOST');
    const hist = await prisma.gameHistory.findMany({ where: { referenceId: { in: bets.map((b) => b.id) } } });
    expect(hist).toHaveLength(2);
    expect(hist.find((h) => h.userId === win.id)!.resultSummary).toBe('Cashed out 2.50×');
    expect(hist.find((h) => h.userId === lose.id)!.resultSummary).toBe('Crashed at 3.00×');
    const ws = await prisma.playerStats.findUniqueOrThrow({ where: { userId: win.id } });
    expect(ws.crashRounds).toBe(1);
    expect(ws.crashHighestCashout).toBe(250);
    expect(Number(ws.crashLargestWin)).toBe(5_000);
    const r = await prisma.crashRound.findUniqueOrThrow({ where: { id: round.id } });
    expect(r.status).toBe('SETTLED');
    expect(await balanceOf(win.id)).toBe(100_000 - 2_000 + 5_000);
    expect(await balanceOf(lose.id)).toBe(99_000);
  });

  it('auto cash-outs that beat the crash are paid at their exact target during settlement; ties lose', async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const { round, base, endsAt } = await openRound(250);
    await placeBet(a.id, { slot: 0, amount: 1_000, autoCashout: 249, requestId: rid() }, base);
    await placeBet(b.id, { slot: 0, amount: 1_000, autoCashout: 250, requestId: rid() }, base);
    await launch(round.id, endsAt);
    await crashAndSettle(round.id);
    const bets = await prisma.crashBet.findMany({ where: { roundId: round.id } });
    const ba = bets.find((x) => x.userId === a.id)!;
    const bb = bets.find((x) => x.userId === b.id)!;
    expect(ba.status).toBe('CASHED_OUT');
    expect(ba.cashoutAt).toBe(249);
    expect(Number(ba.payout)).toBe(2_490);
    expect(bb.status).toBe('LOST');
  });

  it('the reconnection snapshot includes my bet (and hides the seed until the crash)', async () => {
    const u = await createTestUser();
    const other = await createTestUser();
    const { round, base } = await openRound(400);
    const placed = await placeBet(u.id, { slot: 1, amount: 700, autoCashout: 300, requestId: rid() }, base);
    await placeBet(other.id, { slot: 0, amount: 900, requestId: rid() }, base);
    const snap = await buildSnapshot(u.id, base + 1_000);
    expect(snap.round!.id).toBe(round.id);
    expect(snap.round!.seed).toBeUndefined();
    expect(snap.round!.crashPoint).toBeUndefined();
    expect(snap.bets).toHaveLength(2);
    expect(snap.me).toHaveLength(1);
    expect(snap.me![0]).toMatchObject({ id: placed.bet.id, slot: 1, amount: 700, autoCashout: 300, status: 'ACTIVE' });
    // Public bets never carry the auto target.
    expect(JSON.stringify(snap.bets)).not.toContain('autoCashout');
    const guest = await buildSnapshot(null, base + 1_000);
    expect(guest.me).toBeUndefined();
  });

  it('a self-excluded player cannot bet, but already-accepted bets still settle and cash out', async () => {
    const u = await createTestUser();
    const { round, base, endsAt } = await openRound(500);
    await placeBet(u.id, { slot: 0, amount: 1_000, requestId: rid() }, base);
    await placeBet(u.id, { slot: 1, amount: 1_000, autoCashout: 200, requestId: rid() }, base);
    await prisma.selfExclusion.create({ data: { userId: u.id, type: 'COOLDOWN_24H', startsAt: new Date(base - 1000), endsAt: new Date(base + 86_400_000) } });
    // A third account attempt is blocked by the eligibility service.
    const v = await createTestUser();
    await prisma.selfExclusion.create({ data: { userId: v.id, type: 'EXCLUSION_INDEFINITE', startsAt: new Date(base - 1000) } });
    await expect(placeBet(v.id, { slot: 0, amount: 1_000, requestId: rid() }, base)).rejects.toMatchObject({ code: 'SELF_EXCLUDED' });

    const startedAt = await launch(round.id, endsAt);
    const res = await cashout(u.id, { slot: 0 }, at(startedAt, 300));
    expect(res.bet.status).toBe('CASHED_OUT');
    await crashAndSettle(round.id);
    expect(await balanceOf(u.id)).toBe(100_000 - 2_000 + 3_000 + 2_000);
    expect(await balanceOf(v.id)).toBe(100_000);
  });

  it('round detail + public info reveal the seed only after the crash and verify', async () => {
    const u = await createTestUser();
    const r = await createRound(Date.now(), { countdownMs: 5_000 });
    const placed = await placeBet(u.id, { slot: 0, amount: 1_000, requestId: rid() }, Date.now());
    const before = await getRoundDetail(u.id, placed.bet.id);
    expect(before.fairness!.serverSeed).toBeNull();
    expect((await roundInfo(r.id)).seed).toBeNull();
    const other = await createTestUser();
    await expect(getRoundDetail(other.id, placed.bet.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await launch(r.id, r.bettingEndsAt.getTime());
    await crashAndSettle(r.id);
    const d = await getRoundDetail(u.id, placed.bet.id);
    expect(d.fairness!.revealed).toBe(true);
    expect(d.fairness!.clientSeed).toBe(CRASH_SALT);
    expect(d.fairness!.nonce).toBe(r.roundNumber);
    const v = verifyCrash(d.fairness!.serverSeed!, CRASH_SALT);
    expect(v.seedHash).toBe(r.seedHash);
    expect(v.crashPointX100).toBe(r.crashPoint);
    expect(d.forced).toBe(false);
    const info = await roundInfo(r.id);
    expect(info.seed).toBe(d.fairness!.serverSeed);
    expect(info.totalWagered).toBe(1_000);
  });

  it('dev forced crash points are applied and flagged unverifiable', async () => {
    await setForcedOutcome('crash', 'global', { crashPointX100: 777 });
    const r = await createRound(Date.now(), { countdownMs: 5_000 });
    expect(r.crashPoint).toBe(777);
    expect(nodeCrashPoint(r.seed, r.salt)).not.toBe(777);
    await launch(r.id, r.bettingEndsAt.getTime());
    await crashAndSettle(r.id);
    expect((await roundInfo(r.id)).forced).toBe(true);
  });

  it('voiding refunds active bets once and honours reached auto targets', async () => {
    const u = await createTestUser();
    const { round, base, endsAt } = await openRound(300);
    await placeBet(u.id, { slot: 0, amount: 1_000, requestId: rid() }, base);
    await placeBet(u.id, { slot: 1, amount: 1_000, autoCashout: 200, requestId: rid() }, base);
    await launch(round.id, endsAt);
    expect(await voidRound(round.id, Date.now(), 'test')).toBe(true);
    expect(await voidRound(round.id, Date.now(), 'test')).toBe(false);
    expect(await balanceOf(u.id)).toBe(100_000 - 2_000 + 1_000 + 2_000);
    const refunds = await prisma.walletTransaction.count({ where: { userId: u.id, type: 'REFUND' } });
    expect(refunds).toBe(1);
    expect((await roundInfo(round.id)).voided).toBe(true);
    expect((await verifyWalletIntegrity(u.id)).ok).toBe(true);
  });
});

describe('Launch round controller', () => {
  beforeEach(clearRounds);

  it('runs the full state machine and auto-cashes out at the exact target on tick', async () => {
    const clock = new FakeClock(Date.now());
    const events: [string, unknown][] = [];
    const c = new CrashController({ clock, emit: (e, d) => void events.push([e, d]), countdownMs: 5_000 });
    const u = await createTestUser();

    expect(await c.advance()).toBe(5_000); // created WAITING round
    const round = (await prisma.crashRound.findFirstOrThrow({ where: { status: 'WAITING' } }))!;
    await prisma.crashRound.update({ where: { id: round.id }, data: { crashPoint: 400 } });
    await placeBet(u.id, { slot: 0, amount: 1_000, autoCashout: 173, requestId: rid() }, clock.t + 100);

    clock.t += 5_000;
    expect(await c.advance()).toBe(LOCK_MS); // locked
    await expect(placeBet(u.id, { slot: 1, amount: 1_000, requestId: rid() }, clock.t)).rejects.toMatchObject({ code: 'ROUND_CLOSED' });
    clock.t += LOCK_MS;
    const toCrash = await c.advance(); // launched
    const startedAt = clock.t;
    expect(toCrash).toBeCloseTo(timeForMultiplier(400), 0);

    // Tick lands past the target (1.80×) → cashed out at exactly 1.73×.
    clock.t = startedAt + timeForMultiplier(180);
    c.tick();
    await c.drain();
    const bet = await prisma.crashBet.findFirstOrThrow({ where: { roundId: round.id } });
    expect(bet.status).toBe('CASHED_OUT');
    expect(bet.cashoutAt).toBe(173);
    expect(Number(bet.payout)).toBe(1_730);
    expect(events.some(([e]) => e === 'crash:tick')).toBe(true);

    clock.t = Math.ceil(crashTimeMs(startedAt, 400));
    expect(await c.advance()).toBe(SETTLE_GRACE_MS); // crashed
    const crashedState = events.filter(([e]) => e === 'crash:state').at(-1)![1] as { round: { status: string; seed?: string; crashPoint?: number } };
    expect(crashedState.round.status).toBe('CRASHED');
    expect(crashedState.round.seed).toBeTruthy();
    expect(crashedState.round.crashPoint).toBe(400);

    clock.t += SETTLE_GRACE_MS;
    await c.advance(); // settled
    expect((await prisma.crashRound.findUniqueOrThrow({ where: { id: round.id } })).status).toBe('SETTLED');
    const wait = await c.advance(); // intermission
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(INTERMISSION_MS);
    clock.t += wait;
    await c.advance();
    expect(await prisma.crashRound.count({ where: { status: 'WAITING' } })).toBe(1);
    expect(await balanceOf(u.id)).toBe(100_000 - 1_000 + 1_730);
  });

  it('recovers after a restart: resumes the round, processes due auto cash-outs, never double-settles', async () => {
    const clock = new FakeClock(Date.now());
    const a = await createTestUser();
    const b = await createTestUser();
    const first = new CrashController({ clock, countdownMs: 5_000 });
    await first.advance();
    const round = await prisma.crashRound.findFirstOrThrow({ where: { status: 'WAITING' } });
    await prisma.crashRound.update({ where: { id: round.id }, data: { crashPoint: 300 } });
    await placeBet(a.id, { slot: 0, amount: 1_000, autoCashout: 250, requestId: rid() }, clock.t);
    await placeBet(b.id, { slot: 0, amount: 1_000, requestId: rid() }, clock.t);
    clock.t += 5_000;
    await first.advance();
    clock.t += LOCK_MS;
    await first.advance(); // RUNNING
    const startedAt = clock.t;
    first.stop(); // "process dies" before any tick reached 2.50×

    // New leader comes up after the crash time (within the resume window).
    clock.t = Math.ceil(crashTimeMs(startedAt, 300)) + 2_000;
    const second = new CrashController({ clock, countdownMs: 5_000 });
    await second.advance(); // → CRASHED
    clock.t += SETTLE_GRACE_MS;
    await second.advance(); // → SETTLED (auto cash-out paid at 2.50×)

    // Yet another controller (or a stale one) cannot settle again.
    const third = new CrashController({ clock, countdownMs: 5_000 });
    await third.advance();
    expect(await settleRound(round.id, clock.t)).toBe(false);

    const bets = await prisma.crashBet.findMany({ where: { roundId: round.id } });
    expect(bets.find((x) => x.userId === a.id)).toMatchObject({ status: 'CASHED_OUT', cashoutAt: 250 });
    expect(bets.find((x) => x.userId === b.id)).toMatchObject({ status: 'LOST' });
    expect(await prisma.walletTransaction.count({ where: { userId: a.id, type: 'WIN' } })).toBe(1);
    expect(await prisma.gameHistory.count({ where: { referenceId: { in: bets.map((x) => x.id) } } })).toBe(2);
    expect(await balanceOf(a.id)).toBe(100_000 - 1_000 + 2_500);
    expect(await autoCashout(bets.find((x) => x.userId === a.id)!.id)).toBeNull();
  });

  it('continues a still-running round after a restart', async () => {
    const clock = new FakeClock(Date.now());
    const u = await createTestUser();
    const c1 = new CrashController({ clock, countdownMs: 5_000 });
    await c1.advance();
    const round = await prisma.crashRound.findFirstOrThrow({ where: { status: 'WAITING' } });
    await prisma.crashRound.update({ where: { id: round.id }, data: { crashPoint: 1_000 } });
    await placeBet(u.id, { slot: 0, amount: 1_000, requestId: rid() }, clock.t);
    clock.t += 5_000;
    await c1.advance();
    clock.t += LOCK_MS;
    await c1.advance();
    const startedAt = clock.t;
    c1.stop();

    clock.t = startedAt + timeForMultiplier(200);
    const c2 = new CrashController({ clock, countdownMs: 5_000 });
    const left = await c2.advance();
    expect(left).toBeCloseTo(crashTimeMs(startedAt, 1_000) - clock.t, 0);
    expect((await prisma.crashRound.findUniqueOrThrow({ where: { id: round.id } })).status).toBe('RUNNING');
    // The player can still cash out against the original start time.
    const res = await cashout(u.id, { slot: 0 }, at(startedAt, 220));
    expect(res.bet.cashoutAt).toBe(220);
  });

  it('voids a round discovered long after its crash time (outage) with refunds', async () => {
    const clock = new FakeClock(Date.now());
    const u = await createTestUser();
    const c1 = new CrashController({ clock, countdownMs: 5_000 });
    await c1.advance();
    const round = await prisma.crashRound.findFirstOrThrow({ where: { status: 'WAITING' } });
    await prisma.crashRound.update({ where: { id: round.id }, data: { crashPoint: 150 } });
    await placeBet(u.id, { slot: 0, amount: 1_000, requestId: rid() }, clock.t);
    clock.t += 5_000;
    await c1.advance();
    clock.t += LOCK_MS;
    await c1.advance();
    const startedAt = clock.t;
    c1.stop();

    clock.t = Math.ceil(crashTimeMs(startedAt, 150)) + VOID_AFTER_MS + 1_000;
    const c2 = new CrashController({ clock, countdownMs: 5_000 });
    await c2.advance();
    const r = await prisma.crashRound.findUniqueOrThrow({ where: { id: round.id } });
    expect(r.status).toBe('SETTLED');
    expect(r.crashedAt).toBeNull();
    expect(await balanceOf(u.id)).toBe(100_000);
    expect((await prisma.crashBet.findFirstOrThrow({ where: { roundId: round.id } })).status).toBe('REFUNDED');
  });
});
