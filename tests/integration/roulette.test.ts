import { describe, it, expect } from 'vitest';
import { prisma } from '@/server/db';
import { spin, getRouletteState, getRoundDetail } from '@/server/services/roulette/roulette-service';
import { setForcedOutcome } from '@/server/services/dev/forced-outcomes';
import { verifyWalletIntegrity } from '@/server/services/wallet/wallet-service';
import { rotateSeed } from '@/server/services/fairness/seed-service';
import { setSetting } from '@/server/services/settings/settings-service';
import { verifyRoulette } from '@/engines/roulette';
import { createTestUser, balanceOf, rid } from './helpers';

const force = (userId: string, n: number) => setForcedOutcome('roulette', userId, { number: n });
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe('Roulette spin', () => {
  it('pays a straight-up 35:1', async () => {
    const u = await createTestUser();
    await force(u.id, 17);
    const r = await spin(u.id, { bets: [{ type: 'STRAIGHT', numbers: [17], amount: 1_000 }], requestId: rid() });
    expect(r.winningNumber).toBe(17);
    expect(r.totalPayout).toBe(36_000);
    expect(r.balance).toBe(100_000 - 1_000 + 36_000);
    expect(await balanceOf(u.id)).toBe(135_000);
    expect((await verifyWalletIntegrity(u.id)).ok).toBe(true);
  });

  it('pays a split 17:1 and a corner 8:1, settling multiple bets in one wager/payout', async () => {
    const u = await createTestUser();
    await force(u.id, 20);
    const r = await spin(u.id, {
      bets: [
        { type: 'SPLIT', numbers: [17, 20], amount: 1_000 },
        { type: 'CORNER', numbers: [19, 20, 22, 23], amount: 500 },
        { type: 'RED', numbers: [], amount: 2_000 },
        { type: 'BLACK', numbers: [], amount: 2_000 },
        { type: 'DOZEN', numbers: range(1, 12), amount: 1_000 },
      ],
      requestId: rid(),
    });
    expect(r.totalWagered).toBe(6_500);
    // split 18k + corner 4.5k + black 4k (20 is black)
    expect(r.totalPayout).toBe(18_000 + 4_500 + 4_000);
    expect(r.bets.find((b) => b.type === 'RED')!.won).toBe(false);
    expect(r.bets.find((b) => b.type === 'BLACK')!.payout).toBe(4_000);
    expect(await balanceOf(u.id)).toBe(100_000 - 6_500 + 26_500);

    const ledger = await prisma.walletTransaction.findMany({ where: { userId: u.id, referenceId: r.roundId } });
    expect(ledger.map((l) => [l.type, Number(l.amount)]).sort()).toEqual([
      ['BET', -6_500],
      ['WIN', 26_500],
    ]);
  });

  it('zero: even-money bets lose, first four wins', async () => {
    const u = await createTestUser();
    await force(u.id, 0);
    const r = await spin(u.id, {
      bets: [
        { type: 'EVEN', numbers: [], amount: 1_000 },
        { type: 'LOW', numbers: [], amount: 1_000 },
        { type: 'CORNER', numbers: [0, 1, 2, 3], amount: 1_000 },
      ],
      requestId: rid(),
    });
    expect(r.totalPayout).toBe(9_000);
  });

  it('replaying a requestId returns the original round and never double-charges', async () => {
    const u = await createTestUser();
    const requestId = rid();
    const bets = [{ type: 'RED' as const, numbers: [], amount: 5_000 }];
    const a = await spin(u.id, { bets, requestId });
    const after = await balanceOf(u.id);
    const b = await spin(u.id, { bets, requestId });
    expect(b.roundId).toBe(a.roundId);
    expect(b.winningNumber).toBe(a.winningNumber);
    expect(b.replay).toBe(true);
    expect(await balanceOf(u.id)).toBe(after);
    expect(await prisma.rouletteRound.count({ where: { userId: u.id } })).toBe(1);
  });

  it('concurrent duplicates settle exactly once', async () => {
    const u = await createTestUser();
    const requestId = rid();
    const bets = [{ type: 'STRAIGHT' as const, numbers: [5], amount: 1_000 }];
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => spin(u.id, { bets, requestId })));
    const ok = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof spin>>> => r.status === 'fulfilled');
    expect(ok.length).toBeGreaterThan(0);
    expect(new Set(ok.map((r) => r.value.roundId)).size).toBe(1);
    expect(await prisma.rouletteRound.count({ where: { userId: u.id } })).toBe(1);
    expect(await prisma.walletTransaction.count({ where: { userId: u.id, type: 'BET' } })).toBe(1);
    expect(await prisma.gameHistory.count({ where: { userId: u.id, game: 'ROULETTE' } })).toBe(1);
    const stats = await prisma.playerStats.findUniqueOrThrow({ where: { userId: u.id } });
    expect(stats.rouSpins).toBe(1);
    expect((await verifyWalletIntegrity(u.id)).ok).toBe(true);
  });

  it('rejects illegal bets without charging', async () => {
    const u = await createTestUser();
    await expect(
      spin(u.id, { bets: [{ type: 'SPLIT', numbers: [1, 5], amount: 1_000 }], requestId: rid() }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      spin(u.id, { bets: [{ type: 'CORNER', numbers: [3, 4, 6, 7], amount: 1_000 }], requestId: rid() }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(await balanceOf(u.id)).toBe(100_000);
    expect(await prisma.rouletteRound.count({ where: { userId: u.id } })).toBe(0);
  });

  it('enforces per-type and table limits without charging', async () => {
    const u = await createTestUser({ balance: 2_000_000 });
    await expect(
      spin(u.id, { bets: [{ type: 'STRAIGHT', numbers: [1], amount: 50_100 }], requestId: rid() }),
    ).rejects.toMatchObject({ code: 'BET_TOO_HIGH' });
    await expect(
      spin(u.id, { bets: [{ type: 'RED', numbers: [], amount: 250_100 }], requestId: rid() }),
    ).rejects.toMatchObject({ code: 'BET_TOO_HIGH' });
    await expect(
      spin(u.id, {
        bets: [
          { type: 'RED', numbers: [], amount: 250_000 },
          { type: 'ODD', numbers: [], amount: 250_000 },
          { type: 'STRAIGHT', numbers: [2], amount: 100 },
        ],
        requestId: rid(),
      }),
    ).rejects.toMatchObject({ code: 'BET_TOO_HIGH' });
    await expect(spin(u.id, { bets: [{ type: 'RED', numbers: [], amount: 50 }], requestId: rid() })).rejects.toMatchObject({
      code: 'BET_TOO_LOW',
    });
    expect(await balanceOf(u.id)).toBe(2_000_000);
  });

  it('respects admin-configured limits', async () => {
    const u = await createTestUser();
    await setSetting('game.roulette', { maxStraightBet: 1_000 });
    try {
      await expect(
        spin(u.id, { bets: [{ type: 'STRAIGHT', numbers: [9], amount: 1_100 }], requestId: rid() }),
      ).rejects.toMatchObject({ code: 'BET_TOO_HIGH' });
      const state = await getRouletteState(u.id);
      expect(state.betLimits.STRAIGHT.max).toBe(1_000);
      expect(state.betLimits.RED.max).toBe(250_000);
    } finally {
      await setSetting('game.roulette', { maxStraightBet: 50_000 });
    }
  });

  it('rejects a spin that would cross the daily wager limit (no charge)', async () => {
    const u = await createTestUser();
    await prisma.responsiblePlaySettings.upsert({
      where: { userId: u.id },
      create: { userId: u.id, dailyWagerLimit: 5_000n },
      update: { dailyWagerLimit: 5_000n },
    });
    await spin(u.id, { bets: [{ type: 'RED', numbers: [], amount: 3_000 }], requestId: rid() });
    const before = await balanceOf(u.id);
    await expect(
      spin(u.id, {
        bets: [
          { type: 'BLACK', numbers: [], amount: 1_500 },
          { type: 'ODD', numbers: [], amount: 1_000 },
        ],
        requestId: rid(),
      }),
    ).rejects.toMatchObject({ code: 'DAILY_WAGER_LIMIT' });
    expect(await balanceOf(u.id)).toBe(before);
    expect(await prisma.rouletteRound.count({ where: { userId: u.id } })).toBe(1);
  });

  it('rejects when balance is insufficient', async () => {
    const u = await createTestUser({ balance: 500 });
    await expect(
      spin(u.id, { bets: [{ type: 'RED', numbers: [], amount: 1_000 }], requestId: rid() }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
    expect(await balanceOf(u.id)).toBe(500);
  });

  it('records history, stats and a verifiable fairness trail', async () => {
    const u = await createTestUser();
    const r = await spin(u.id, { bets: [{ type: 'STRAIGHT', numbers: [3], amount: 100 }], requestId: rid() });
    const hist = await prisma.gameHistory.findFirstOrThrow({ where: { userId: u.id, referenceId: r.roundId } });
    expect(hist.game).toBe('ROULETTE');
    expect(Number(hist.wager)).toBe(100);

    const detail = await getRoundDetail(u.id, r.roundId);
    expect(detail.fairness?.revealed).toBe(false);
    expect(detail.fairness?.serverSeed).toBeNull();
    expect(detail.forced).toBeUndefined();

    await rotateSeed(u.id);
    const revealed = await getRoundDetail(u.id, r.roundId);
    expect(revealed.fairness?.revealed).toBe(true);
    const f = revealed.fairness!;
    expect(verifyRoulette(f.serverSeed!, f.clientSeed, f.nonce)).toBe(r.winningNumber);

    const other = await createTestUser();
    await expect(getRoundDetail(other.id, r.roundId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('flags forced rounds and tracks largest win', async () => {
    const u = await createTestUser();
    await force(u.id, 32);
    const r = await spin(u.id, { bets: [{ type: 'STRAIGHT', numbers: [32], amount: 2_000 }], requestId: rid() });
    expect((await getRoundDetail(u.id, r.roundId)).forced).toBe(true);
    const stats = await prisma.playerStats.findUniqueOrThrow({ where: { userId: u.id } });
    expect(Number(stats.rouLargestWin)).toBe(72_000);
  });

  it('state returns recent results newest first and the last round', async () => {
    const u = await createTestUser();
    const nums = [7, 0, 26];
    for (const n of nums) {
      await force(u.id, n);
      await spin(u.id, { bets: [{ type: 'ODD', numbers: [], amount: 100 }], requestId: rid() });
    }
    const s = await getRouletteState(u.id);
    expect(s.recent.map((r) => r.winningNumber)).toEqual([26, 0, 7]);
    expect(s.lastRound?.winningNumber).toBe(26);
    expect(s.lastRound?.bets[0].type).toBe('ODD');
    expect(s.limits.maxBet).toBe(500_000);
  });
});
