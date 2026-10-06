import { describe, it, expect } from 'vitest';
import { prisma, transaction } from '@/server/db';
import { applyLedgerEntry, lockWallet, verifyWalletIntegrity } from '@/server/services/wallet/wallet-service';
import { placeWager, creditPayout } from '@/server/services/wagering';
import { claimReward } from '@/server/services/rewards/rewards-service';
import { createTestUser, balanceOf, rid } from './helpers';

describe('WalletService', () => {
  it('grants the signup bonus exactly once via the ledger', async () => {
    const u = await createTestUser();
    expect(await balanceOf(u.id)).toBe(100_000);
    const txs = await prisma.walletTransaction.findMany({ where: { userId: u.id } });
    expect(txs).toHaveLength(1);
    expect(txs[0].type).toBe('SIGNUP_GRANT');
    expect((await verifyWalletIntegrity(u.id)).ok).toBe(true);
  });

  it('is idempotent per key: replaying a movement never double-charges', async () => {
    const u = await createTestUser();
    const key = `bet:${rid()}`;
    const entry = { userId: u.id, type: 'BET' as const, amount: -1_000n, referenceType: 'TEST', referenceId: 'x', idempotencyKey: key };
    const a = await transaction((tx) => applyLedgerEntry(tx, entry));
    const b = await transaction((tx) => applyLedgerEntry(tx, entry));
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect(await balanceOf(u.id)).toBe(99_000);
  });

  it('never allows a negative balance', async () => {
    const u = await createTestUser({ balance: 500 });
    await expect(
      transaction((tx) => applyLedgerEntry(tx, { userId: u.id, type: 'BET', amount: -501n, referenceType: 'T', referenceId: 'x', idempotencyKey: rid() })),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
    expect(await balanceOf(u.id)).toBe(500);
  });

  it('serialises concurrent wagers on the same wallet', async () => {
    const u = await createTestUser({ balance: 10_000 });
    const results = await Promise.allSettled(
      Array.from({ length: 15 }, () =>
        transaction((tx) =>
          placeWager(tx, { userId: u.id, game: 'ROULETTE', amount: 1_000n, referenceType: 'T', referenceId: rid(), idempotencyKey: rid() }),
        ),
      ),
    );
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    expect(ok).toBe(10);
    expect(await balanceOf(u.id)).toBe(0);
    expect((await verifyWalletIntegrity(u.id)).ok).toBe(true);
  });

  it('records balanceBefore/After consistently', async () => {
    const u = await createTestUser();
    await transaction(async (tx) => {
      await lockWallet(tx, u.id);
      await placeWager(tx, { userId: u.id, game: 'BLACKJACK', amount: 2_000n, referenceType: 'T', referenceId: '1', idempotencyKey: 'k1' });
      await creditPayout(tx, { userId: u.id, game: 'BLACKJACK', amount: 4_000n, referenceType: 'T', referenceId: '1', idempotencyKey: 'k1:win' });
    });
    const rows = await prisma.walletTransaction.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'asc' } });
    for (const r of rows) expect(r.balanceAfter - r.balanceBefore).toBe(r.amount);
    expect(await balanceOf(u.id)).toBe(102_000);
  });
});

describe('Rewards', () => {
  it('prevents duplicate concurrent daily claims', async () => {
    const u = await createTestUser();
    const res = await Promise.allSettled([claimReward(u.id, 'DAILY'), claimReward(u.id, 'DAILY'), claimReward(u.id, 'DAILY')]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await balanceOf(u.id)).toBe(125_000);
  });

  it('only allows emergency refill below the threshold', async () => {
    const u = await createTestUser();
    await expect(claimReward(u.id, 'REFILL')).rejects.toMatchObject({ code: 'NOT_ELIGIBLE' });
    const poor = await createTestUser({ balance: 200 });
    await claimReward(poor.id, 'REFILL');
    expect(await balanceOf(poor.id)).toBe(10_200);
    await expect(claimReward(poor.id, 'REFILL')).rejects.toMatchObject({ code: expect.stringMatching(/ALREADY_CLAIMED|NOT_ELIGIBLE/) });
  });
});
