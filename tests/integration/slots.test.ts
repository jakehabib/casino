import { describe, it, expect } from 'vitest';
import { prisma } from '@/server/db';
import { spinSlot, getSlotState, getSlotRoundDetail } from '@/server/services/slots/slot-service';
import { setForcedOutcome } from '@/server/services/dev/forced-outcomes';
import { createExclusion } from '@/server/services/responsible-play/exclusions';
import { rotateSeed } from '@/server/services/fairness/seed-service';
import { verifyWalletIntegrity } from '@/server/services/wallet/wallet-service';
import { setSetting } from '@/server/services/settings/settings-service';
import { verifySlotSpin } from '@/engines/slots/verify';
import { createTestUser, balanceOf, rid } from './helpers';

const BET = 1_000;

async function forceFreeSpins(userId: string, slotId = 'gilded-vault') {
  await setForcedOutcome('slots', userId, { slotId, trigger: 'FREE_SPINS' });
}

describe('Slots — paid spins', () => {
  it('debits the bet and credits the payout through the ledger', async () => {
    const u = await createTestUser();
    let expected = await balanceOf(u.id);
    for (let i = 0; i < 12; i++) {
      const res = await spinSlot(u.id, 'gilded-vault', { betLevel: BET, requestId: rid() });
      if (res.spin.isFreeSpin) continue;
      expected += -BET + res.spin.payout;
      expect(res.spin.bet).toBe(BET);
      expect(res.balance).toBe(await balanceOf(u.id));
      if (res.bonus) break; // a natural trigger: stop the paid-spin accounting here
      expect(res.balance).toBe(expected);
    }
    const bets = await prisma.walletTransaction.findMany({ where: { userId: u.id, type: 'BET' } });
    expect(bets.every((b) => /^slot:sp[0-9a-f]+:bet$/.test(b.idempotencyKey))).toBe(true);
    expect((await verifyWalletIntegrity(u.id)).ok).toBe(true);
  });

  it('is idempotent: a duplicate requestId returns the original spin and never double-charges', async () => {
    const u = await createTestUser();
    const requestId = rid();
    const a = await spinSlot(u.id, 'overcharge', { betLevel: BET, requestId });
    const balanceAfter = await balanceOf(u.id);
    const b = await spinSlot(u.id, 'overcharge', { betLevel: BET, requestId });
    expect(b.replay).toBe(true);
    expect(b.spin).toEqual(a.spin);
    expect(await balanceOf(u.id)).toBe(balanceAfter);
    expect(await prisma.slotSpin.count({ where: { userId: u.id } })).toBe(1);
    // concurrent duplicates also collapse to one spin
    const rid2 = rid();
    const both = await Promise.allSettled([1, 2, 3].map(() => spinSlot(u.id, 'overcharge', { betLevel: BET, requestId: rid2 })));
    const ok = both.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof spinSlot>>>[];
    expect(ok.length).toBeGreaterThan(0);
    expect(new Set(ok.map((r) => r.value.spin.id)).size).toBe(1);
    expect(await prisma.slotSpin.count({ where: { userId: u.id } })).toBe(2);
    expect((await verifyWalletIntegrity(u.id)).ok).toBe(true);
  });

  it('rejects bet levels that are not configured, and unknown machines', async () => {
    const u = await createTestUser();
    await expect(spinSlot(u.id, 'gilded-vault', { betLevel: 777, requestId: rid() })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(spinSlot(u.id, 'nope', { betLevel: BET, requestId: rid() })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const poor = await createTestUser({ balance: 500 });
    await expect(spinSlot(poor.id, 'gilded-vault', { betLevel: BET, requestId: rid() })).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
    expect(await balanceOf(poor.id)).toBe(500);
  });

  it('records a non-bonus round in history and stats immediately', async () => {
    const u = await createTestUser();
    await setForcedOutcome('slots', u.id, { slotId: 'starforged-relics', trigger: 'LOSS' });
    const res = await spinSlot(u.id, 'starforged-relics', { betLevel: BET, requestId: rid() });
    expect(res.spin.payout).toBe(0);
    expect(res.spin.forced).toBe(true);
    const h = await prisma.gameHistory.findUnique({ where: { game_referenceId: { game: 'SLOTS', referenceId: res.spin.id } } });
    expect(h).toMatchObject({ gameVariant: 'starforged-relics', wager: BigInt(BET), payout: 0n });
    const st = await prisma.playerStats.findUniqueOrThrow({ where: { userId: u.id } });
    expect(st.slotSpins).toBe(1);
    expect(st.playsSlots).toBe(1);
    expect(st.slotSpinsBySlot).toEqual({ 'starforged-relics': 1 });
  });
});

describe('Slots — free spins', () => {
  it('free spins consume no balance, use the locked bet and complete back to the base game', async () => {
    const u = await createTestUser();
    await forceFreeSpins(u.id);
    const trigger = await spinSlot(u.id, 'gilded-vault', { betLevel: 500, requestId: rid() });
    expect(trigger.spin.outcome.features).toContain('FREE_SPINS_TRIGGERED');
    expect(trigger.bonus).toMatchObject({ betLevel: 500, played: 0 });
    // not recorded yet: the round is still running
    expect(await prisma.gameHistory.count({ where: { userId: u.id } })).toBe(0);

    let res = trigger;
    let freeWins = 0;
    let freeSpins = 0;
    let guard = 0;
    while (res.bonus && guard++ < 200) {
      const before = await balanceOf(u.id);
      // a different (even invalid) bet level is ignored during free spins
      res = await spinSlot(u.id, 'gilded-vault', { betLevel: 100_000, requestId: rid() });
      expect(res.spin.isFreeSpin).toBe(true);
      expect(res.spin.bet).toBe(0);
      expect(res.spin.betLevel).toBe(500);
      expect(await balanceOf(u.id)).toBe(before + res.spin.payout);
      freeWins += res.spin.payout;
      freeSpins++;
    }
    expect(res.bonus).toBeNull();
    expect(res.spin.outcome.features).toContain('FREE_SPINS_ENDED');
    expect(res.spin.outcome.freeSpins!.played).toBe(freeSpins);

    // one GameHistory row for the whole round, keyed by the trigger spin
    const rows = await prisma.gameHistory.findMany({ where: { userId: u.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ referenceId: trigger.spin.id, wager: 500n, payout: BigInt(trigger.spin.payout + freeWins) });
    const st = await prisma.playerStats.findUniqueOrThrow({ where: { userId: u.id } });
    expect(st.slotSpins).toBe(1 + freeSpins);
    expect(st.slotSpinsBySlot).toEqual({ 'gilded-vault': 1 + freeSpins });
    if (trigger.spin.payout + freeWins > 0) expect(st.slotLargestWin).toBe(BigInt(trigger.spin.payout + freeWins));

    // back in the base game: the next spin is paid again
    const next = await spinSlot(u.id, 'gilded-vault', { betLevel: 200, requestId: rid() });
    expect(next.spin.isFreeSpin).toBe(false);
    expect(next.spin.bet).toBe(200);
    expect((await verifyWalletIntegrity(u.id)).ok).toBe(true);

    // round detail aggregates the paid spin and every free spin
    const detail = await getSlotRoundDetail(u.id, trigger.spin.id);
    expect(detail.data.spins).toHaveLength(1 + freeSpins);
    expect(detail.data.complete).toBe(true);
    expect(detail.payout).toBe(trigger.spin.payout + freeWins);
    expect(detail.forced).toBe(true);
    expect(detail.fairness?.extra).toMatchObject({ slotId: 'gilded-vault', betLevel: 500, bonusStateBefore: null });
  });

  it('a cooldown blocks free spins but preserves the bonus state', async () => {
    const u = await createTestUser();
    await forceFreeSpins(u.id, 'overcharge');
    const trigger = await spinSlot(u.id, 'overcharge', { betLevel: BET, requestId: rid() });
    expect(trigger.bonus).not.toBeNull();
    const one = await spinSlot(u.id, 'overcharge', { betLevel: BET, requestId: rid() });
    const stateBefore = await prisma.slotGame.findUniqueOrThrow({ where: { userId_slotId: { userId: u.id, slotId: 'overcharge' } } });

    await createExclusion(u.id, 'COOLDOWN_24H');
    await expect(spinSlot(u.id, 'overcharge', { betLevel: BET, requestId: rid() })).rejects.toMatchObject({ code: 'COOLDOWN_ACTIVE' });
    const stateAfter = await prisma.slotGame.findUniqueOrThrow({ where: { userId_slotId: { userId: u.id, slotId: 'overcharge' } } });
    expect(stateAfter.bonusState).toEqual(stateBefore.bonusState);
    expect(stateAfter.version).toBe(stateBefore.version);
    const view = await getSlotState(u.id, 'overcharge');
    expect(view.bonus?.remaining).toBe(one.bonus?.remaining);

    // cooldown over → the bonus continues where it stopped
    await prisma.selfExclusion.updateMany({ where: { userId: u.id }, data: { status: 'EXPIRED', endsAt: new Date(Date.now() - 1000) } });
    const resumed = await spinSlot(u.id, 'overcharge', { betLevel: BET, requestId: rid() });
    expect(resumed.spin.isFreeSpin).toBe(true);
    expect(resumed.spin.outcome.freeSpins!.played).toBe((one.bonus?.played ?? 0) + 1);
  });

  it('a disabled machine blocks free spins; daily limits do not', async () => {
    const u = await createTestUser();
    await forceFreeSpins(u.id, 'starforged-relics');
    const t = await spinSlot(u.id, 'starforged-relics', { betLevel: BET, requestId: rid() });
    expect(t.bonus).not.toBeNull();
    await prisma.responsiblePlaySettings.upsert({
      where: { userId: u.id },
      create: { userId: u.id, dailyWagerLimit: 1n },
      update: { dailyWagerLimit: 1n },
    });
    const free = await spinSlot(u.id, 'starforged-relics', { betLevel: BET, requestId: rid() });
    expect(free.spin.isFreeSpin).toBe(true);
    await setSetting('game.slots', { machines: { 'gilded-vault': { enabled: true }, overcharge: { enabled: true }, 'starforged-relics': { enabled: false } } });
    try {
      await expect(spinSlot(u.id, 'starforged-relics', { betLevel: BET, requestId: rid() })).rejects.toMatchObject({ code: 'GAME_DISABLED' });
      expect((await getSlotState(u.id, 'starforged-relics')).enabled).toBe(false);
    } finally {
      await setSetting('game.slots', { machines: { 'gilded-vault': { enabled: true }, overcharge: { enabled: true }, 'starforged-relics': { enabled: true } } });
    }
  });
});

describe('Slots — fairness', () => {
  it('stored spins re-derive exactly from the revealed seed (paid and free spins)', async () => {
    const u = await createTestUser();
    const spins = [];
    for (let i = 0; i < 25; i++) spins.push(await spinSlot(u.id, 'starforged-relics', { betLevel: 200, requestId: rid() }));
    await rotateSeed(u.id);
    for (const s of spins) {
      if (s.spin.forced) continue;
      const row = await prisma.slotSpin.findUniqueOrThrow({ where: { id: s.spin.id } });
      const detail = await getSlotRoundDetail(u.id, s.spin.id);
      const mine = detail.data.spins.find((x) => x.id === s.spin.id)!;
      expect(detail.fairness?.revealed).toBe(true);
      const seed = detail.fairness!.serverSeed!;
      const re = verifySlotSpin('starforged-relics', seed, row.clientSeed, row.nonce, Number(row.betLevel), mine.bonusStateBefore);
      expect(re).toEqual(s.spin.outcome);
    }
  });
});
