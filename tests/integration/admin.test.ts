import { describe, it, expect } from 'vitest';
import { prisma } from '@/server/db';
import { verifyWalletIntegrity } from '@/server/services/wallet/wallet-service';
import { adjustCredits, changeUserRole, setUserStatus, searchUsers, getUserDetail } from '@/server/services/admin/users';
import { processReinstatement, getUserResponsiblePlay } from '@/server/services/admin/responsible-play';
import { updateSettings } from '@/server/services/admin/settings';
import { getDashboard } from '@/server/services/admin/dashboard';
import { listAuditLog } from '@/server/services/admin/audit';
import { createExclusion, requestReinstatement, REINSTATEMENT_WAIT_MS } from '@/server/services/responsible-play/exclusions';
import { getSetting } from '@/server/services/settings/settings-service';
import { checkWagerEligibility } from '@/server/services/responsible-play/eligibility';
import { devGrantCredits, devClearBalance, devSetForced, devResetResponsiblePlay } from '@/server/services/admin/dev-tools';
import { peekForcedOutcome } from '@/server/services/dev/forced-outcomes';
import { transaction } from '@/server/db';
import { createTestUser, balanceOf, rid } from './helpers';

const actorOf = (u: { id: string; role: string }) => ({ id: u.id, role: u.role as 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN' });

async function staff(role: 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN') {
  const u = await createTestUser({ role });
  return actorOf({ id: u.id, role });
}

describe('Admin: credit adjustments', () => {
  it('writes a ledger entry and an audit row, and is idempotent by requestId', async () => {
    const admin = await staff('ADMIN');
    const player = await createTestUser();
    const requestId = rid();
    const input = { userId: player.id, amount: 5_000, reason: 'Goodwill credit', requestId };

    const a = await adjustCredits(admin, input, { ip: '10.0.0.1' });
    const b = await adjustCredits(admin, input, { ip: '10.0.0.1' });
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect(b.entryId).toBe(a.entryId);
    expect(await balanceOf(player.id)).toBe(105_000);

    const ledger = await prisma.walletTransaction.findMany({ where: { userId: player.id, type: 'ADMIN_ADJUSTMENT' } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0].amount).toBe(5_000n);
    expect(ledger[0].idempotencyKey).toBe(`admin-adjust:${requestId}`);

    const audit = await prisma.adminAuditLog.findMany({ where: { targetId: player.id, action: 'USER_CREDIT_ADJUST' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ adminUserId: admin.id, targetType: 'USER', reason: 'Goodwill credit', ip: '10.0.0.1' });
    expect(audit[0].before).toEqual({ balance: 100_000 });
    expect(audit[0].after).toMatchObject({ balance: 105_000, amount: 5_000 });
    expect((await verifyWalletIntegrity(player.id)).ok).toBe(true);
  });

  it('can debit but never drives a balance negative', async () => {
    const admin = await staff('ADMIN');
    const player = await createTestUser({ balance: 1_000 });
    await expect(adjustCredits(admin, { userId: player.id, amount: -1_001, reason: 'Clawback', requestId: rid() })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    expect(await balanceOf(player.id)).toBe(1_000);
    expect(await prisma.adminAuditLog.count({ where: { targetId: player.id } })).toBe(0);

    await adjustCredits(admin, { userId: player.id, amount: -1_000, reason: 'Clawback', requestId: rid() });
    expect(await balanceOf(player.id)).toBe(0);
  });

  it('requires a reason and a non-zero amount', async () => {
    const admin = await staff('ADMIN');
    const player = await createTestUser();
    await expect(adjustCredits(admin, { userId: player.id, amount: 10, reason: ' ', requestId: rid() })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(adjustCredits(admin, { userId: player.id, amount: 0, reason: 'zero', requestId: rid() })).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('Admin: authorisation', () => {
  it('forbids non-admins from every admin service', async () => {
    const user = actorOf(await createTestUser());
    const mod = await staff('MODERATOR');
    const target = await createTestUser();
    for (const actor of [user, mod]) {
      await expect(adjustCredits(actor, { userId: target.id, amount: 100, reason: 'nope', requestId: rid() })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(setUserStatus(actor, { userId: target.id, action: 'BAN', reason: 'nope' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(searchUsers(actor, {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(getDashboard(actor)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(updateSettings(actor, 'system', { announcement: 'x' }, 'nope')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    expect(await balanceOf(target.id)).toBe(100_000);
  });

  it('admins cannot act on equal/higher ranks or themselves; only SUPER_ADMIN changes roles', async () => {
    const admin = await staff('ADMIN');
    const otherAdmin = await staff('ADMIN');
    const sup = await staff('SUPER_ADMIN');
    const player = await createTestUser();

    await expect(setUserStatus(admin, { userId: otherAdmin.id, action: 'SUSPEND', reason: 'test' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(setUserStatus(admin, { userId: sup.id, action: 'BAN', reason: 'test' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(adjustCredits(admin, { userId: admin.id, amount: 1, reason: 'self', requestId: rid() })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(changeUserRole(admin, { userId: player.id, role: 'MODERATOR', reason: 'promote' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(changeUserRole(sup, { userId: player.id, role: 'SUPER_ADMIN', reason: 'promote' })).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await changeUserRole(sup, { userId: player.id, role: 'MODERATOR', reason: 'Trusted community member' });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: player.id } })).role).toBe('MODERATOR');
    const audit = await prisma.adminAuditLog.findFirstOrThrow({ where: { targetId: player.id, action: 'USER_ROLE_CHANGE' } });
    expect(audit.before).toEqual({ role: 'USER' });
    expect(audit.after).toEqual({ role: 'MODERATOR' });
  });
});

describe('Admin: account status', () => {
  it('suspend / ban / unban update status and write audit rows', async () => {
    const admin = await staff('ADMIN');
    const player = await createTestUser();
    const until = new Date(Date.now() + 3 * 86_400_000);

    await setUserStatus(admin, { userId: player.id, action: 'SUSPEND', until, reason: 'Chargeback review' });
    let u = await prisma.user.findUniqueOrThrow({ where: { id: player.id } });
    expect(u.status).toBe('SUSPENDED');
    expect(u.suspendedUntil?.getTime()).toBe(until.getTime());
    expect(u.statusReason).toBe('Chargeback review');

    // A suspended player cannot wager.
    const elig = await transaction((tx) =>
      checkWagerEligibility(tx, { userId: player.id, game: 'ROULETTE', amount: 100n, balance: 100_000n }),
    );
    expect(elig).toMatchObject({ ok: false, code: 'ACCOUNT_SUSPENDED' });

    await setUserStatus(admin, { userId: player.id, action: 'BAN', reason: 'Abuse' });
    u = await prisma.user.findUniqueOrThrow({ where: { id: player.id } });
    expect(u.status).toBe('BANNED');
    expect(await prisma.session.count({ where: { userId: player.id } })).toBe(0);
    await expect(setUserStatus(admin, { userId: player.id, action: 'BAN', reason: 'Again' })).rejects.toMatchObject({ code: 'INVALID_ACTION' });

    await setUserStatus(admin, { userId: player.id, action: 'REINSTATE', reason: 'Appeal accepted' });
    u = await prisma.user.findUniqueOrThrow({ where: { id: player.id } });
    expect(u.status).toBe('ACTIVE');
    expect(u.suspendedUntil).toBeNull();

    const actions = (await prisma.adminAuditLog.findMany({ where: { targetId: player.id }, orderBy: { createdAt: 'asc' } })).map((a) => a.action);
    expect(actions).toEqual(['USER_SUSPEND', 'USER_BAN', 'USER_UNBAN']);
    const ban = await prisma.adminAuditLog.findFirstOrThrow({ where: { targetId: player.id, action: 'USER_BAN' } });
    expect(ban.before).toMatchObject({ status: 'SUSPENDED' });
    expect(ban.after).toMatchObject({ status: 'BANNED' });

    const list = await listAuditLog(admin, { targetId: player.id });
    expect(list.items).toHaveLength(3);
  });

  it('rejects a suspension end in the past', async () => {
    const admin = await staff('ADMIN');
    const player = await createTestUser();
    await expect(
      setUserStatus(admin, { userId: player.id, action: 'SUSPEND', until: new Date(Date.now() - 1000), reason: 'x-test' }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('Admin: self-exclusion protection', () => {
  it('ADMIN cannot override an active self-exclusion', async () => {
    const admin = await staff('ADMIN');
    const player = await createTestUser();
    const { exclusion } = await createExclusion(player.id, 'EXCLUSION_INDEFINITE');
    await requestReinstatement(player.id);
    await prisma.selfExclusion.update({
      where: { id: exclusion.id },
      data: { reinstatementRequestedAt: new Date(Date.now() - REINSTATEMENT_WAIT_MS - 60_000) },
    });
    await expect(processReinstatement(admin, { exclusionId: exclusion.id, reason: 'Request' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const ex = await prisma.selfExclusion.findUniqueOrThrow({ where: { id: exclusion.id } });
    expect(ex.status).toBe('REINSTATEMENT_REQUESTED');
    expect(await prisma.adminAuditLog.count({ where: { targetId: exclusion.id } })).toBe(0);
  });

  it('nobody can override a time-limited exclusion or cooldown', async () => {
    const sup = await staff('SUPER_ADMIN');
    const player = await createTestUser();
    const { exclusion } = await createExclusion(player.id, 'EXCLUSION_6M');
    await expect(processReinstatement(sup, { exclusionId: exclusion.id, reason: 'Request' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const p2 = await createTestUser();
    const { exclusion: cd } = await createExclusion(p2.id, 'COOLDOWN_24H');
    await expect(processReinstatement(sup, { exclusionId: cd.id, reason: 'Request' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const rp = await getUserResponsiblePlay(p2.id);
    expect(rp.activeExclusion).toMatchObject({ type: 'COOLDOWN_24H', overridable: false });
  });

  it('SUPER_ADMIN reinstates an indefinite exclusion only after a request + the waiting period', async () => {
    const sup = await staff('SUPER_ADMIN');
    const player = await createTestUser();
    const { exclusion } = await createExclusion(player.id, 'EXCLUSION_INDEFINITE');

    // Not requested yet.
    await expect(processReinstatement(sup, { exclusionId: exclusion.id, reason: 'Review' })).rejects.toMatchObject({ code: 'NOT_ELIGIBLE' });

    // Requested, but within the waiting period.
    await requestReinstatement(player.id);
    await expect(processReinstatement(sup, { exclusionId: exclusion.id, reason: 'Review' })).rejects.toMatchObject({ code: 'NOT_ELIGIBLE' });

    // Waiting period elapsed.
    const requestedAt = new Date(Date.now() - REINSTATEMENT_WAIT_MS - 60_000);
    await prisma.selfExclusion.update({ where: { id: exclusion.id }, data: { reinstatementRequestedAt: requestedAt } });
    await expect(processReinstatement(sup, { exclusionId: exclusion.id, reason: '' })).rejects.toMatchObject({ code: 'VALIDATION' });
    const res = await processReinstatement(sup, { exclusionId: exclusion.id, reason: 'Review call completed, player cleared' });
    expect(res.status).toBe('REINSTATED');

    const ex = await prisma.selfExclusion.findUniqueOrThrow({ where: { id: exclusion.id } });
    expect(ex.status).toBe('REINSTATED');
    expect(ex.reinstatedById).toBe(sup.id);
    expect(ex.reinstatedAt).not.toBeNull();
    const audit = await prisma.adminAuditLog.findFirstOrThrow({ where: { targetId: exclusion.id } });
    expect(audit).toMatchObject({ action: 'RP_REINSTATEMENT', targetType: 'SELF_EXCLUSION', adminUserId: sup.id });

    // Cannot be processed twice.
    await expect(processReinstatement(sup, { exclusionId: exclusion.id, reason: 'Again please' })).rejects.toMatchObject({ code: 'NOT_ELIGIBLE' });
    const elig = await transaction((tx) => checkWagerEligibility(tx, { userId: player.id, game: 'ROULETTE', amount: 100n, balance: 100_000n }));
    expect(elig.ok).toBe(true);
  });

  it('exposes RP state read-only in the user detail', async () => {
    const admin = await staff('ADMIN');
    const player = await createTestUser();
    await createExclusion(player.id, 'COOLDOWN_72H');
    const detail = await getUserDetail(admin, player.id);
    expect(detail.responsiblePlay.activeExclusion).toMatchObject({ type: 'COOLDOWN_72H', active: true });
    expect(detail.permissions.canReinstate).toBe(false);
  });
});

describe('Admin: settings', () => {
  it('validates and audits settings updates', async () => {
    const admin = await staff('ADMIN');
    await expect(updateSettings(admin, 'game.blackjack', { decks: 12 }, 'More decks')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(updateSettings(admin, 'game.blackjack', { minBet: 5_000, maxBet: 1_000 }, 'Bad range')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(updateSettings(admin, 'game.blackjack', { bogus: true }, 'Unknown key')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(updateSettings(admin, 'game.blackjack', { decks: 8 }, '')).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(await prisma.adminAuditLog.count({ where: { action: 'SETTINGS_UPDATE', adminUserId: admin.id } })).toBe(0);

    const res = await updateSettings(admin, 'game.blackjack', { decks: 8, blackjackPayout: '6:5' }, 'Holiday table rules', { ip: '1.2.3.4' });
    expect(res.changed).toBe(true);
    const cfg = await getSetting('game.blackjack');
    expect(cfg.decks).toBe(8);
    expect(cfg.blackjackPayout).toBe('6:5');
    expect(cfg.minBet).toBe(100); // untouched fields keep their values

    const audit = await prisma.adminAuditLog.findFirstOrThrow({ where: { action: 'SETTINGS_UPDATE', adminUserId: admin.id } });
    expect(audit).toMatchObject({ targetType: 'SETTING', targetId: 'game.blackjack', reason: 'Holiday table rules', ip: '1.2.3.4' });
    expect(audit.before).toMatchObject({ decks: 6, blackjackPayout: '3:2' });
    expect(audit.after).toMatchObject({ decks: 8, blackjackPayout: '6:5' });

    // A no-op save does not create an audit row.
    const again = await updateSettings(admin, 'game.blackjack', { decks: 8 }, 'Same again');
    expect(again.changed).toBe(false);
    expect(await prisma.adminAuditLog.count({ where: { action: 'SETTINGS_UPDATE', adminUserId: admin.id } })).toBe(1);

    await updateSettings(admin, 'game.blackjack', { decks: 6, blackjackPayout: '3:2' }, 'Restore defaults');
  });

  it('validates slot machines and roulette maxima', async () => {
    const admin = await staff('ADMIN');
    await expect(updateSettings(admin, 'game.slots', { machines: { 'not-a-slot': { enabled: true } } }, 'x-test')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(updateSettings(admin, 'game.slots', { betLevels: [100, 100] }, 'x-test')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(updateSettings(admin, 'game.roulette', { maxStraightBet: 900_000 }, 'x-test')).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});

describe('Dev tools', () => {
  it('grant / clear balance are ledgered with dev metadata and idempotent', async () => {
    const u = await createTestUser();
    const r = rid();
    await devGrantCredits(u.id, 50_000, r);
    await devGrantCredits(u.id, 50_000, r);
    expect(await balanceOf(u.id)).toBe(150_000);
    const g = await prisma.walletTransaction.findFirstOrThrow({ where: { userId: u.id, type: 'ADMIN_ADJUSTMENT' } });
    expect(g.metadata).toMatchObject({ dev: true });
    await devClearBalance(u.id, rid());
    expect(await balanceOf(u.id)).toBe(0);
    expect((await verifyWalletIntegrity(u.id)).ok).toBe(true);
  });

  it('validates forced outcomes and stores crash globally', async () => {
    const u = await createTestUser();
    await expect(devSetForced(u.id, 'roulette', { number: 37 })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(devSetForced(u.id, 'blackjack', { cards: ['ZZ'] })).rejects.toMatchObject({ code: 'VALIDATION' });
    await devSetForced(u.id, 'roulette', { number: 17 });
    expect(await peekForcedOutcome('roulette', u.id)).toEqual({ number: 17 });
    await devSetForced(u.id, 'crash', { crashPointX100: 250 });
    expect(await peekForcedOutcome('crash', 'global')).toEqual({ crashPointX100: 250 });
    await devSetForced(u.id, 'crash', null);
    expect(await peekForcedOutcome('crash', 'global')).toBeNull();
  });

  it('resets responsible-play test state', async () => {
    const u = await createTestUser();
    await createExclusion(u.id, 'COOLDOWN_24H');
    await prisma.responsiblePlaySettings.update({ where: { userId: u.id }, data: { dailyWagerLimit: 1_000n } });
    await devResetResponsiblePlay(u.id);
    expect(await prisma.selfExclusion.count({ where: { userId: u.id } })).toBe(0);
    expect((await prisma.responsiblePlaySettings.findUniqueOrThrow({ where: { userId: u.id } })).dailyWagerLimit).toBeNull();
  });
});

describe('Admin: dashboard', () => {
  it('aggregates platform figures', async () => {
    const admin = await staff('ADMIN');
    const d = await getDashboard(admin);
    expect(d.users.total).toBeGreaterThan(0);
    expect(d.series).toHaveLength(14);
    expect(d.perGame.all.map((g) => g.game)).toEqual(['BLACKJACK', 'BACCARAT', 'ROULETTE', 'CRASH', 'SLOTS']);
    expect(d.credits.outstanding).toBeGreaterThan(0);
  });
});
