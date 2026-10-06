import { describe, it, expect } from 'vitest';
import { prisma } from '@/server/db';
import { getOwnProfile, getPublicProfile } from '@/server/services/profile/profile-service';
import { applyPrivacy } from '@/server/services/profile/privacy';
import { createTestUser } from './helpers';

async function seedStats(userId: string) {
  await prisma.playerStats.update({
    where: { userId },
    data: {
      gamesPlayed: 40,
      totalWagered: 50_000n,
      totalWon: 62_000n,
      largestWin: 9_000n,
      largestWinGame: 'gilded-vault',
      playsBlackjack: 10,
      playsSlots: 25,
      playsCrash: 5,
      slotSpins: 25,
      slotSpinsBySlot: { overcharge: 20, 'gilded-vault': 5 },
      bjHands: 10,
      bjWins: 6,
      bjBlackjacks: 2,
      crashRounds: 5,
      crashHighestCashout: 412,
    },
  });
  await prisma.gameHistory.create({
    data: { userId, game: 'BLACKJACK', referenceId: `ref-${userId}`, wager: 100n, payout: 250n, net: 150n, resultSummary: 'Blackjack 21' },
  });
}

describe('profiles & privacy', () => {
  it('PUBLIC shows join date, games played, favourite game, stats and biggest win', async () => {
    const u = await createTestUser();
    await seedStats(u.id);
    const p = await getPublicProfile(u.username, null);
    expect(p.privacy).toBe('PUBLIC');
    expect(p.user).toMatchObject({ username: u.username, level: 1 });
    expect(p.stats.gamesPlayed).toBe(40);
    expect(p.stats.joinedAt).toBeDefined();
    expect(p.stats.favoriteGame).toMatchObject({ id: 'overcharge', name: 'Overcharge' });
    expect(p.stats.totalWagered).toBe(50_000);
    expect(p.stats.totalWon).toBe(62_000);
    expect(p.stats.netResult).toBe(12_000);
    expect(p.stats.largestWin).toEqual({ amount: 9_000, game: 'Gilded Vault' });
    expect(p.stats.highlights?.crashHighestCashout).toBe(412);
    expect(p.viewer).toBeNull();
    expect(p.moderation).toBeUndefined();
  });

  it('respects the individual hide flags', async () => {
    const u = await createTestUser();
    await seedStats(u.id);
    await prisma.user.update({ where: { id: u.id }, data: { hideLargestWin: true, hideTotalWagered: true, hideTotalWon: true } });
    const p = await getPublicProfile(u.username, null);
    expect(p.stats.largestWin).toBeUndefined();
    expect(p.stats.totalWagered).toBeUndefined();
    expect(p.stats.totalWon).toBeUndefined();
    expect(p.stats.netResult).toBe(12_000);
    expect(p.stats.hidden.sort()).toEqual(['largestWin', 'totalWagered', 'totalWon']);
  });

  it('hiding only one of wagered/won/net withholds a second so it cannot be derived', async () => {
    const u = await createTestUser();
    await seedStats(u.id);
    await prisma.user.update({ where: { id: u.id }, data: { hideTotalWon: true } });
    const p = await getPublicProfile(u.username, null);
    expect(p.stats.totalWon).toBeUndefined();
    expect(p.stats.netResult).toBeUndefined();
    expect(p.stats.totalWagered).toBe(50_000);
    expect(p.stats.derivedHidden).toEqual(['netResult']);
  });

  it('LIMITED shows only avatar, username, level, join date and games played', async () => {
    const u = await createTestUser();
    await seedStats(u.id);
    await prisma.user.update({ where: { id: u.id }, data: { privacy: 'LIMITED' } });
    const p = await getPublicProfile(u.username, null);
    expect(Object.keys(p.stats).sort()).toEqual(['gamesPlayed', 'hidden', 'joinedAt']);
    expect(p.user.avatarUrl).toMatch(/^preset:/);
  });

  it('PRIVATE shows only avatar, username and level', async () => {
    const u = await createTestUser();
    await seedStats(u.id);
    await prisma.user.update({ where: { id: u.id }, data: { privacy: 'PRIVATE' } });
    const p = await getPublicProfile(u.username, null);
    expect(p.stats).toEqual({ hidden: [] });
    expect(Object.keys(p.user).sort()).toEqual(['avatarUrl', 'displayName', 'id', 'level', 'role', 'tier', 'username']);
  });

  it('never exposes responsible-play data, email or balance', async () => {
    const u = await createTestUser();
    await prisma.responsiblePlaySettings.update({ where: { userId: u.id }, data: { dailyLossLimit: 5_000n } });
    const json = JSON.stringify(await getPublicProfile(u.username, null));
    expect(json).not.toMatch(/limit|exclusion|email|balance|timezone/i);
  });

  it('includes block state for signed-in viewers and a moderation snapshot only for staff', async () => {
    const u = await createTestUser();
    const viewer = await createTestUser();
    const mod = await createTestUser({ role: 'MODERATOR' });
    await prisma.userBlock.create({ data: { blockerId: viewer.id, blockedId: u.id } });
    const asViewer = await getPublicProfile(u.username, { id: viewer.id, role: 'USER' });
    expect(asViewer.viewer).toEqual({ blocked: true });
    expect(asViewer.moderation).toBeUndefined();
    const asMod = await getPublicProfile(u.username, { id: mod.id, role: 'MODERATOR' });
    expect(asMod.moderation).toMatchObject({ chatBanned: false, mutedUntil: null, accountStatus: 'ACTIVE' });
    const self = await getPublicProfile(u.username.toUpperCase(), { id: u.id, role: 'USER' });
    expect(self.isSelf).toBe(true);
  });

  it('returns NOT_FOUND for unknown or banned users', async () => {
    await expect(getPublicProfile('does_not_exist_x', null)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(getPublicProfile('../etc', null)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const u = await createTestUser();
    await prisma.user.update({ where: { id: u.id }, data: { status: 'BANNED' } });
    await expect(getPublicProfile(u.username, null)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('own profile has full per-game stats, level progress and recent games', async () => {
    const u = await createTestUser();
    await seedStats(u.id);
    const p = await getOwnProfile(u.id);
    expect(p.general).toMatchObject({ gamesPlayed: 40, totalWagered: 50_000, totalWon: 62_000, netResult: 12_000 });
    expect(p.general.favoriteGame?.id).toBe('overcharge');
    expect(p.blackjack).toMatchObject({ hands: 10, wins: 6, blackjacks: 2 });
    expect(p.crash).toMatchObject({ rounds: 5, highestCashout: 412 });
    expect(p.slots.favoriteSlot).toMatchObject({ id: 'overcharge', plays: 20 });
    expect(p.level).toMatchObject({ level: 1, tier: 'neutral' });
    expect(p.recent).toHaveLength(1);
    expect(p.recent[0]).toMatchObject({ game: 'BLACKJACK', gameName: 'Blackjack', net: 150 });
  });

  it('applyPrivacy is pure and matches the API (used by the settings preview)', () => {
    const full = {
      joinedAt: '2026-01-01T00:00:00.000Z',
      gamesPlayed: 3,
      favoriteGame: null,
      totalWagered: 10,
      totalWon: 5,
      netResult: -5,
      largestWin: null,
      highlights: { blackjackHands: 0, blackjacks: 0, baccaratHands: 0, rouletteSpins: 0, crashRounds: 0, crashHighestCashout: 0, slotSpins: 0 },
    };
    const flags = { privacy: 'PUBLIC' as const, hideNetResult: true, hideTotalWagered: false, hideTotalWon: false, hideLargestWin: false };
    const v = applyPrivacy(full, flags);
    expect(v.netResult).toBeUndefined();
    expect(v.totalWon).toBeUndefined(); // derived-leak guard
    expect(v.totalWagered).toBe(10);
  });
});
