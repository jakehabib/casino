import { randomBytes } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { prisma, transaction } from '@/server/db';
import { placeWager, creditPayout } from '@/server/services/wagering';
import { verifyWalletIntegrity } from '@/server/services/wallet/wallet-service';
import {
  requestLimitChange,
  cancelPendingChange,
  getEffectiveSettings,
  setTimezone,
} from '@/server/services/responsible-play/settings';
import { createExclusion, getActiveExclusion, requestReinstatement } from '@/server/services/responsible-play/exclusions';
import { checkWagerEligibility, getPlayStatus } from '@/server/services/responsible-play/eligibility';
import { bumpAggregate, getTodayAggregate } from '@/server/services/responsible-play/aggregates';
import { getResponsiblePlaySummary } from '@/server/services/responsible-play/summary';
import { invalidateSettings } from '@/server/services/settings/settings-service';
import { hashToken, userFromToken } from '@/server/auth/tokens';
import type { GameKey } from '@/lib/games';
import { createTestUser, balanceOf, rid } from './helpers';

const H = 3600_000;
const GAMES: GameKey[] = ['BLACKJACK', 'BACCARAT', 'ROULETTE', 'CRASH', 'SLOTS'];

/** Place a wager through the real wagering facade (eligibility + ledger + aggregate). */
function wager(userId: string, amount: number, game: GameKey = 'ROULETTE', key = rid()) {
  return transaction((tx) =>
    placeWager(tx, {
      userId,
      game,
      amount: BigInt(amount),
      minBet: null,
      maxBet: null,
      referenceType: 'RP_TEST',
      referenceId: key,
      idempotencyKey: `rp:${key}:bet`,
    }),
  );
}

function payout(userId: string, amount: number, key = rid()) {
  return transaction((tx) =>
    creditPayout(tx, {
      userId,
      game: 'ROULETTE',
      amount: BigInt(amount),
      referenceType: 'RP_TEST',
      referenceId: key,
      idempotencyKey: `rp:${key}:win`,
    }),
  );
}

/** Eligibility at an injected instant (the facade always uses "now"). */
function eligibleAt(userId: string, amount: number, now: Date, game: GameKey = 'ROULETTE') {
  return transaction((tx) =>
    checkWagerEligibility(tx, { userId, game, amount: BigInt(amount), minBet: null, maxBet: null, balance: 10n ** 12n, now }),
  );
}

async function today(userId: string) {
  const s = await getEffectiveSettings(prisma, userId);
  return getTodayAggregate(prisma, userId, s.timezone);
}

describe('Daily wager limit', () => {
  it('accepts a wager below the limit', async () => {
    const u = await createTestUser();
    await requestLimitChange(u.id, 'DAILY_WAGER', 5_000n);
    await wager(u.id, 1_000);
    expect(await balanceOf(u.id)).toBe(99_000);
    expect((await today(u.id)).wagered).toBe(1_000n);
  });

  it('accepts a wager that reaches the limit exactly', async () => {
    const u = await createTestUser();
    await requestLimitChange(u.id, 'DAILY_WAGER', 5_000n);
    await wager(u.id, 3_000);
    await wager(u.id, 2_000);
    expect((await today(u.id)).wagered).toBe(5_000n);
    expect(await balanceOf(u.id)).toBe(95_000);
  });

  it('rejects a wager that would cross the limit, without charging', async () => {
    const u = await createTestUser();
    await requestLimitChange(u.id, 'DAILY_WAGER', 5_000n);
    await wager(u.id, 4_500);
    await expect(wager(u.id, 501)).rejects.toMatchObject({
      code: 'DAILY_WAGER_LIMIT',
      details: expect.objectContaining({ limit: 5_000, wageredToday: 4_500, remaining: 500 }),
    });
    expect(await balanceOf(u.id)).toBe(95_500);
    expect((await today(u.id)).wagered).toBe(4_500n);
    const bets = await prisma.walletTransaction.count({ where: { userId: u.id, type: 'BET' } });
    expect(bets).toBe(1);
    // The remaining headroom is still usable.
    await wager(u.id, 500);
    expect((await today(u.id)).wagered).toBe(5_000n);
  });
});

describe('Daily loss limit', () => {
  it('counts loss as wagered − returned; wins reduce the running loss', async () => {
    const u = await createTestUser();
    await requestLimitChange(u.id, 'DAILY_LOSS', 3_000n);

    await wager(u.id, 2_000); // loss 2,000
    await expect(wager(u.id, 1_001)).rejects.toMatchObject({ code: 'DAILY_LOSS_LIMIT' });
    await wager(u.id, 1_000); // loss 3,000 (exactly at limit)
    await expect(wager(u.id, 1)).rejects.toMatchObject({
      code: 'DAILY_LOSS_LIMIT',
      details: expect.objectContaining({ lossToday: 3_000, remaining: 0 }),
    });

    // A 2,500 return (stake + winnings of an accepted round) reduces the loss to 500.
    await payout(u.id, 2_500);
    const t = await today(u.id);
    expect(t).toMatchObject({ wagered: 3_000n, won: 2_500n, lost: 500n, net: -500n });
    await wager(u.id, 2_500); // 500 + 2,500 = 3,000 — allowed
    await expect(wager(u.id, 1)).rejects.toMatchObject({ code: 'DAILY_LOSS_LIMIT' });
    expect((await verifyWalletIntegrity(u.id)).ok).toBe(true);
  });

  it('a net-positive day leaves the full loss limit available', async () => {
    const u = await createTestUser();
    await requestLimitChange(u.id, 'DAILY_LOSS', 1_000n);
    await wager(u.id, 1_000);
    await payout(u.id, 5_000); // net +4,000 → loss 0
    await wager(u.id, 1_000); // loss is max(0, 2,000 − 5,000) = 0 before this stake
    expect((await today(u.id)).lost).toBe(0n);
  });
});

describe('Limit changes', () => {
  it('applies a decrease immediately', async () => {
    const u = await createTestUser();
    await requestLimitChange(u.id, 'DAILY_WAGER', 10_000n);
    const res = await requestLimitChange(u.id, 'DAILY_WAGER', 2_000n);
    expect(res.applied).toBe(true);
    expect((await getEffectiveSettings(prisma, u.id)).dailyWagerLimit).toBe(2_000n);
    await wager(u.id, 2_000);
    await expect(wager(u.id, 1)).rejects.toMatchObject({ code: 'DAILY_WAGER_LIMIT' });
  });

  it('delays an increase: pending until effectiveAt, then applied lazily on read', async () => {
    const u = await createTestUser();
    const t0 = new Date();
    await requestLimitChange(u.id, 'DAILY_WAGER', 1_000n, t0);
    const res = await requestLimitChange(u.id, 'DAILY_WAGER', 50_000n, t0);
    expect(res.applied).toBe(false);
    expect(res.change?.status).toBe('PENDING');
    expect(res.change?.effectiveAt.getTime()).toBe(t0.getTime() + 24 * H);

    // Not applied before effectiveAt (inject now = +23h59m).
    const before = new Date(t0.getTime() + 24 * H - 60_000);
    expect((await getEffectiveSettings(prisma, u.id, before)).dailyWagerLimit).toBe(1_000n);
    const blocked = await eligibleAt(u.id, 1_001, before);
    expect(blocked).toMatchObject({ ok: false, code: 'DAILY_WAGER_LIMIT' });

    const summaryBefore = await getResponsiblePlaySummary(u.id, before);
    expect(summaryBefore.limits.dailyWager.limit).toBe(1_000);
    expect(summaryBefore.limits.dailyWager.pending).toMatchObject({ newValue: 50_000, oldValue: 1_000 });

    // Applied lazily by the first read at/after effectiveAt (here: an eligibility check).
    const after = new Date(t0.getTime() + 24 * H + 1_000);
    expect(await eligibleAt(u.id, 1_001, after)).toMatchObject({ ok: true });
    const row = await prisma.responsiblePlayLimitChange.findUniqueOrThrow({ where: { id: res.change!.id } });
    expect(row.status).toBe('APPLIED');
    expect((await prisma.responsiblePlaySettings.findUniqueOrThrow({ where: { userId: u.id } })).dailyWagerLimit).toBe(50_000n);
    const summaryAfter = await getResponsiblePlaySummary(u.id, after);
    expect(summaryAfter.limits.dailyWager).toMatchObject({ limit: 50_000, pending: null });
  });

  it('removing a limit is treated as an increase (delayed)', async () => {
    const u = await createTestUser();
    const t0 = new Date();
    await requestLimitChange(u.id, 'DAILY_LOSS', 1_000n, t0);
    const res = await requestLimitChange(u.id, 'DAILY_LOSS', null, t0);
    expect(res.applied).toBe(false);
    expect((await getEffectiveSettings(prisma, u.id, t0)).dailyLossLimit).toBe(1_000n);
    expect((await getEffectiveSettings(prisma, u.id, new Date(t0.getTime() + 25 * H))).dailyLossLimit).toBeNull();
  });

  it('a pending increase can be cancelled, and the old limit stays', async () => {
    const u = await createTestUser();
    await requestLimitChange(u.id, 'DAILY_WAGER', 1_000n);
    const { change } = await requestLimitChange(u.id, 'DAILY_WAGER', 9_000n);
    await cancelPendingChange(u.id, change!.id);
    const row = await prisma.responsiblePlayLimitChange.findUniqueOrThrow({ where: { id: change!.id } });
    expect(row.status).toBe('CANCELLED');
    // Even after the original effective time, nothing is applied.
    expect((await getEffectiveSettings(prisma, u.id, new Date(Date.now() + 48 * H))).dailyWagerLimit).toBe(1_000n);
    // Cancelling twice (or another user's change) is refused.
    await expect(cancelPendingChange(u.id, change!.id)).rejects.toMatchObject({ code: 'ACTION_UNAVAILABLE' });
    const other = await createTestUser();
    await requestLimitChange(other.id, 'DAILY_WAGER', 1_000n);
    const { change: c2 } = await requestLimitChange(other.id, 'DAILY_WAGER', 2_000n);
    await expect(cancelPendingChange(u.id, c2!.id)).rejects.toMatchObject({ code: 'ACTION_UNAVAILABLE' });
  });

  it('a decrease supersedes a pending increase', async () => {
    const u = await createTestUser();
    await requestLimitChange(u.id, 'DAILY_WAGER', 5_000n);
    const { change } = await requestLimitChange(u.id, 'DAILY_WAGER', 20_000n);
    await requestLimitChange(u.id, 'DAILY_WAGER', 3_000n);
    expect((await prisma.responsiblePlayLimitChange.findUniqueOrThrow({ where: { id: change!.id } })).status).toBe('SUPERSEDED');
    expect((await getEffectiveSettings(prisma, u.id, new Date(Date.now() + 48 * H))).dailyWagerLimit).toBe(3_000n);
  });
});

describe('Breaks and cooldowns', () => {
  for (const [type, hours] of [
    ['COOLDOWN_24H', 24],
    ['COOLDOWN_72H', 72],
    ['LOCK_1W', 168],
  ] as const) {
    it(`${type} blocks wagers with COOLDOWN_ACTIVE until it expires`, async () => {
      const u = await createTestUser();
      const t0 = new Date();
      const { exclusion, created } = await createExclusion(u.id, type, t0);
      expect(created).toBe(true);
      expect(exclusion.endsAt!.getTime()).toBe(t0.getTime() + hours * H);

      await expect(wager(u.id, 100)).rejects.toMatchObject({ code: 'COOLDOWN_ACTIVE' });
      expect(await balanceOf(u.id)).toBe(100_000);

      // One minute before expiry: still blocked.
      expect(await eligibleAt(u.id, 100, new Date(t0.getTime() + hours * H - 60_000))).toMatchObject({ ok: false, code: 'COOLDOWN_ACTIVE' });
      // At expiry: eligible again, and the row is lazily marked EXPIRED.
      expect(await eligibleAt(u.id, 100, new Date(t0.getTime() + hours * H))).toMatchObject({ ok: true });
      expect((await prisma.selfExclusion.findUniqueOrThrow({ where: { id: exclusion.id } })).status).toBe('EXPIRED');
      // And a real wager now goes through.
      await wager(u.id, 100);
      expect(await balanceOf(u.id)).toBe(99_900);
    });
  }

  it('cooldowns created in the past and since expired restore eligibility', async () => {
    const u = await createTestUser();
    await createExclusion(u.id, 'COOLDOWN_24H', new Date(Date.now() - 25 * H));
    await wager(u.id, 100);
    expect((await getPlayStatus(u.id)).canPlay).toBe(true);
  });
});

describe('Self-exclusion', () => {
  it('1-month self-exclusion blocks every game with SELF_EXCLUDED', async () => {
    const u = await createTestUser();
    const t0 = new Date('2026-01-31T12:00:00.000Z');
    const { exclusion } = await createExclusion(u.id, 'EXCLUSION_1M', new Date());
    // Calendar-month arithmetic clamps to the end of shorter months.
    const { computeEndsAt } = await import('@/server/services/responsible-play/exclusions');
    expect(computeEndsAt('EXCLUSION_1M', t0)!.toISOString()).toBe('2026-02-28T12:00:00.000Z');
    expect(exclusion.endsAt).not.toBeNull();

    for (const game of GAMES) {
      await expect(wager(u.id, 100, game)).rejects.toMatchObject({ code: 'SELF_EXCLUDED' });
    }
    expect(await balanceOf(u.id)).toBe(100_000);
    expect(await prisma.walletTransaction.count({ where: { userId: u.id, type: 'BET' } })).toBe(0);

    const status = await getPlayStatus(u.id);
    expect(status).toMatchObject({ canPlay: false, code: 'SELF_EXCLUDED' });
  });

  it('every game key rejects new wagers during a cooldown too', async () => {
    const u = await createTestUser();
    await createExclusion(u.id, 'COOLDOWN_72H');
    for (const game of GAMES) {
      await expect(wager(u.id, 100, game)).rejects.toMatchObject({ code: 'COOLDOWN_ACTIVE' });
    }
  });

  it('an already-accepted wager still settles while excluded', async () => {
    const u = await createTestUser();
    const key = rid();
    await wager(u.id, 1_000, 'BLACKJACK', key); // accepted before the break
    await createExclusion(u.id, 'EXCLUSION_1M');
    const res = await payout(u.id, 2_000, key);
    expect(res?.duplicate).toBe(false);
    expect(await balanceOf(u.id)).toBe(101_000);
    expect(await today(u.id)).toMatchObject({ wagered: 1_000n, won: 2_000n });
    // ...but nothing new can be wagered.
    await expect(wager(u.id, 1_000, 'BLACKJACK')).rejects.toMatchObject({ code: 'SELF_EXCLUDED' });
    expect((await verifyWalletIntegrity(u.id)).ok).toBe(true);
  });

  it('duplicate requests are idempotent; a longer one extends', async () => {
    const u = await createTestUser();
    const t0 = new Date();
    const a = await createExclusion(u.id, 'COOLDOWN_72H', t0);
    const b = await createExclusion(u.id, 'COOLDOWN_72H', t0);
    const shorter = await createExclusion(u.id, 'COOLDOWN_24H', t0);
    expect(b.created).toBe(false);
    expect(b.exclusion.id).toBe(a.exclusion.id);
    expect(shorter.created).toBe(false);
    expect(await prisma.selfExclusion.count({ where: { userId: u.id } })).toBe(1);

    const longer = await createExclusion(u.id, 'EXCLUSION_1M', t0);
    expect(longer.created).toBe(true);
    const active = await getActiveExclusion(prisma, u.id, new Date(t0.getTime() + 100 * H));
    expect(active?.id).toBe(longer.exclusion.id);
    expect(await prisma.selfExclusion.count({ where: { userId: u.id } })).toBe(2);
  });

  it('indefinite exclusion: reinstatement request is idempotent and keeps play disabled', async () => {
    const u = await createTestUser();
    await createExclusion(u.id, 'EXCLUSION_INDEFINITE');
    await expect(requestReinstatement(u.id)).resolves.toMatchObject({ status: 'REINSTATEMENT_REQUESTED' });
    const first = await prisma.selfExclusion.findFirstOrThrow({ where: { userId: u.id } });
    await requestReinstatement(u.id);
    const second = await prisma.selfExclusion.findFirstOrThrow({ where: { userId: u.id } });
    expect(second.reinstatementRequestedAt?.getTime()).toBe(first.reinstatementRequestedAt?.getTime());
    await expect(wager(u.id, 100)).rejects.toMatchObject({ code: 'SELF_EXCLUDED' });
    // Far future: still excluded (no end date).
    expect(await eligibleAt(u.id, 100, new Date(Date.now() + 5 * 365 * 24 * H))).toMatchObject({ ok: false, code: 'SELF_EXCLUDED' });
  });

  it('reinstatement requires an indefinite exclusion', async () => {
    const u = await createTestUser();
    await createExclusion(u.id, 'COOLDOWN_24H');
    await expect(requestReinstatement(u.id)).rejects.toMatchObject({ code: 'NOT_ELIGIBLE' });
  });
});

describe('Persistence', () => {
  it('restrictions survive logout/login (a brand-new session)', async () => {
    const u = await createTestUser();
    await createExclusion(u.id, 'COOLDOWN_24H');
    await requestLimitChange(u.id, 'DAILY_WAGER', 1_000n);

    // "Log out": every session is destroyed. "Log in": a new session token.
    await prisma.session.deleteMany({ where: { userId: u.id } });
    const token = randomBytes(32).toString('base64url');
    await prisma.session.create({ data: { userId: u.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 24 * H) } });
    const sessionUser = await userFromToken(token);
    expect(sessionUser?.id).toBe(u.id);

    await expect(wager(sessionUser!.id, 100)).rejects.toMatchObject({ code: 'COOLDOWN_ACTIVE' });
    const summary = await getResponsiblePlaySummary(u.id);
    expect(summary.exclusion?.type).toBe('COOLDOWN_24H');
    expect(summary.limits.dailyWager.limit).toBe(1_000);
  });

  it('restrictions survive a server restart (fresh module state, settings cache dropped)', async () => {
    const u = await createTestUser();
    await createExclusion(u.id, 'EXCLUSION_1M');
    await requestLimitChange(u.id, 'DAILY_LOSS', 500n);

    invalidateSettings();
    vi.resetModules();
    const fresh = await import('@/server/services/wagering');
    const freshDb = await import('@/server/db');
    await expect(
      freshDb.transaction((tx) =>
        fresh.placeWager(tx, {
          userId: u.id,
          game: 'SLOTS',
          amount: 100n,
          minBet: null,
          maxBet: null,
          referenceType: 'RP_TEST',
          referenceId: rid(),
          idempotencyKey: rid(),
        }),
      ),
    ).rejects.toMatchObject({ code: 'SELF_EXCLUDED' });
    const freshSettings = await import('@/server/services/responsible-play/settings');
    expect((await freshSettings.getEffectiveSettings(freshDb.prisma, u.id)).dailyLossLimit).toBe(500n);
  });
});

describe('Timezones', () => {
  it('aggregates are keyed by the local date; the limit resets at local midnight', async () => {
    const u = await createTestUser({ timezone: 'America/New_York' });
    await requestLimitChange(u.id, 'DAILY_WAGER', 1_000n);

    // 2026-10-06 03:30Z = Oct 5, 23:30 in New York (EDT, UTC−4).
    const lateEvening = new Date('2026-10-06T03:30:00.000Z');
    await transaction((tx) => bumpAggregate(tx, u.id, 'America/New_York', { wagered: 1_000n }, lateEvening));
    const row = await prisma.dailyPlayAggregate.findFirstOrThrow({ where: { userId: u.id } });
    expect(row.date.toISOString().slice(0, 10)).toBe('2026-10-05');

    expect(await eligibleAt(u.id, 1, new Date('2026-10-06T03:59:59.000Z'))).toMatchObject({
      ok: false,
      code: 'DAILY_WAGER_LIMIT',
      details: expect.objectContaining({ resetsAt: '2026-10-06T04:00:00.000Z' }),
    });
    // 00:00:01 local on Oct 6 — a fresh day.
    expect(await eligibleAt(u.id, 1_000, new Date('2026-10-06T04:00:01.000Z'))).toMatchObject({ ok: true });

    const summary = await getResponsiblePlaySummary(u.id, new Date('2026-10-06T03:45:00.000Z'));
    expect(summary).toMatchObject({ timezone: 'America/New_York', resetsAt: '2026-10-06T04:00:00.000Z' });
    expect(summary.today.wagered).toBe(1_000);
  });

  it('a UTC user on the same instants is on a different local day', async () => {
    const u = await createTestUser({ timezone: 'UTC' });
    await requestLimitChange(u.id, 'DAILY_WAGER', 1_000n);
    await transaction((tx) => bumpAggregate(tx, u.id, 'UTC', { wagered: 1_000n }, new Date('2026-10-05T23:30:00.000Z')));
    expect(await eligibleAt(u.id, 1, new Date('2026-10-05T23:59:00.000Z'))).toMatchObject({ ok: false });
    expect(await eligibleAt(u.id, 1, new Date('2026-10-06T00:00:00.000Z'))).toMatchObject({ ok: true });
  });

  it('changing timezone does not hand out a fresh day (totals carry over)', async () => {
    const u = await createTestUser({ timezone: 'UTC' });
    await requestLimitChange(u.id, 'DAILY_WAGER', 2_000n);
    // 23:00 UTC on Oct 5 is already Oct 6 in Tokyo.
    const at = new Date('2026-10-05T23:00:00.000Z');
    await transaction((tx) => bumpAggregate(tx, u.id, 'UTC', { wagered: 2_000n, won: 500n }, at));
    expect(await eligibleAt(u.id, 1, at)).toMatchObject({ ok: false, code: 'DAILY_WAGER_LIMIT' });

    await setTimezone(u.id, 'Asia/Tokyo', at);
    expect((await getEffectiveSettings(prisma, u.id)).timezone).toBe('Asia/Tokyo');
    expect(await getTodayAggregate(prisma, u.id, 'Asia/Tokyo', at)).toMatchObject({ wagered: 2_000n, won: 500n, lost: 1_500n });
    expect(await eligibleAt(u.id, 1, at)).toMatchObject({ ok: false, code: 'DAILY_WAGER_LIMIT' });

    await expect(setTimezone(u.id, 'Not/AZone')).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('Client option parity', () => {
  it('the UI computes the same unlock time as the server for every option', async () => {
    const server = await import('@/server/services/responsible-play/exclusions');
    const client = await import('@/components/responsible-play/options');
    const starts = [new Date('2026-01-31T12:00:00.000Z'), new Date('2026-10-06T16:32:00.000Z'), new Date('2028-02-29T23:59:59.000Z')];
    for (const opt of client.EXCLUSION_LIST) {
      expect(server.EXCLUSION_OPTIONS[opt.type].kind).toBe(opt.kind);
      for (const s of starts) {
        expect(client.computeEndsAt(opt.type, s)?.getTime() ?? null).toBe(server.computeEndsAt(opt.type, s)?.getTime() ?? null);
      }
    }
    expect(Object.keys(server.EXCLUSION_OPTIONS).sort()).toEqual(client.EXCLUSION_LIST.map((o) => o.type).sort());
  });
});
