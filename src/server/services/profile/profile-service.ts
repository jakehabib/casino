import type { PlayerStats, Role } from '@prisma/client';
import { prisma } from '@/server/db';
import { AppError } from '@/lib/errors';
import { toNum } from '@/lib/money';
import { GAMES, GAME_LABEL, gameById, type GameKey } from '@/lib/games';
import { levelFromLifetimeXp, tierForLevel, type LevelTier } from '@/lib/levels';
import { hasRole } from '@/server/auth/tokens';
import { moderationSnapshot } from '@/server/services/chat/moderation-service';
import { applyPrivacy, type FavoriteGame, type FullPublicStats, type Privacy, type VisibleStats } from './privacy';

const PLAY_COUNTERS: { key: GameKey; field: keyof PlayerStats; id: string }[] = [
  { key: 'BLACKJACK', field: 'playsBlackjack', id: 'blackjack' },
  { key: 'BACCARAT', field: 'playsBaccarat', id: 'baccarat' },
  { key: 'ROULETTE', field: 'playsRoulette', id: 'roulette' },
  { key: 'CRASH', field: 'playsCrash', id: 'crash' },
  { key: 'SLOTS', field: 'playsSlots', id: 'slots' },
];

function slotCounts(stats: Pick<PlayerStats, 'slotSpinsBySlot'> | null): [string, number][] {
  const raw = stats?.slotSpinsBySlot;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>)
    .map(([k, v]) => [k, typeof v === 'number' && Number.isFinite(v) ? v : 0] as [string, number])
    .filter(([k, v]) => v > 0 && !!gameById(k));
}

/** Most-played slot machine (ties → catalogue order). */
export function favoriteSlot(stats: Pick<PlayerStats, 'slotSpinsBySlot'> | null): FavoriteGame | null {
  let best: FavoriteGame | null = null;
  const counts = new Map(slotCounts(stats));
  for (const g of GAMES.filter((x) => x.key === 'SLOTS')) {
    const n = counts.get(g.id) ?? 0;
    if (n > 0 && (!best || n > best.plays)) best = { id: g.id, key: g.key, name: g.name, href: g.href, plays: n };
  }
  return best;
}

/** Most-played game from the per-game play counters; slots resolve to the favourite machine. */
export function favoriteGame(stats: PlayerStats | null): FavoriteGame | null {
  if (!stats) return null;
  let best: { key: GameKey; id: string; plays: number } | null = null;
  for (const c of PLAY_COUNTERS) {
    const n = Number(stats[c.field] ?? 0);
    if (n > 0 && (!best || n > best.plays)) best = { key: c.key, id: c.id, plays: n };
  }
  if (!best) return null;
  if (best.key === 'SLOTS') {
    const slot = favoriteSlot(stats);
    if (slot) return { ...slot, plays: best.plays };
    return { id: 'slots', key: 'SLOTS', name: 'Slots', href: '/casino/slots', plays: best.plays };
  }
  const meta = GAMES.find((g) => g.key === best!.key)!;
  return { id: meta.id, key: meta.key, name: meta.name, href: meta.href, plays: best.plays };
}

/** Human label for PlayerStats.largestWinGame (stores a slot id or a game key). */
export function gameLabel(v: string | null | undefined): string | null {
  if (!v) return null;
  return gameById(v)?.name ?? GAMES.find((g) => g.key === v && g.key !== 'SLOTS')?.name ?? GAME_LABEL[v as GameKey] ?? v;
}

function fullPublicStats(createdAt: Date, s: PlayerStats | null): FullPublicStats {
  const wagered = toNum(s?.totalWagered ?? 0n);
  const won = toNum(s?.totalWon ?? 0n);
  const largest = toNum(s?.largestWin ?? 0n);
  return {
    joinedAt: createdAt.toISOString(),
    gamesPlayed: s?.gamesPlayed ?? 0,
    favoriteGame: favoriteGame(s),
    totalWagered: wagered,
    totalWon: won,
    netResult: won - wagered,
    largestWin: largest > 0 ? { amount: largest, game: gameLabel(s?.largestWinGame) } : null,
    highlights: {
      blackjackHands: s?.bjHands ?? 0,
      blackjacks: s?.bjBlackjacks ?? 0,
      baccaratHands: s?.bacHands ?? 0,
      rouletteSpins: s?.rouSpins ?? 0,
      crashRounds: s?.crashRounds ?? 0,
      crashHighestCashout: s?.crashHighestCashout ?? 0,
      slotSpins: s?.slotSpins ?? 0,
    },
  };
}

export interface PublicProfile {
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
    level: number;
    tier: LevelTier;
    role: Role;
  };
  privacy: Privacy;
  stats: VisibleStats;
  isSelf: boolean;
  /** Present for signed-in viewers. */
  viewer: { blocked: boolean } | null;
  /** Present only for staff viewers. */
  moderation?: Awaited<ReturnType<typeof moderationSnapshot>>;
}

export async function getPublicProfile(username: string, viewer: { id: string; role: Role } | null): Promise<PublicProfile> {
  const handle = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{1,20}$/.test(handle)) throw new AppError('NOT_FOUND', 'Player not found.');
  const u = await prisma.user.findUnique({
    where: { username: handle },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      role: true,
      status: true,
      level: true,
      privacy: true,
      hideNetResult: true,
      hideTotalWagered: true,
      hideTotalWon: true,
      hideLargestWin: true,
      createdAt: true,
      stats: true,
    },
  });
  const isStaff = !!viewer && hasRole(viewer.role, 'MODERATOR');
  if (!u || (u.status === 'BANNED' && !isStaff)) throw new AppError('NOT_FOUND', 'Player not found.');
  const isSelf = viewer?.id === u.id;
  const [blocked, moderation] = await Promise.all([
    viewer && !isSelf ? prisma.userBlock.findUnique({ where: { blockerId_blockedId: { blockerId: viewer.id, blockedId: u.id } } }) : null,
    isStaff && !isSelf ? moderationSnapshot(u.id) : undefined,
  ]);
  return {
    user: { id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl, level: u.level, tier: tierForLevel(u.level), role: u.role },
    privacy: u.privacy,
    stats: applyPrivacy(fullPublicStats(u.createdAt, u.stats), u),
    isSelf,
    viewer: viewer ? { blocked: !!blocked } : null,
    ...(moderation ? { moderation } : {}),
  };
}

export async function getOwnProfile(userId: string) {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      role: true,
      privacy: true,
      hideNetResult: true,
      hideTotalWagered: true,
      hideTotalWon: true,
      hideLargestWin: true,
      createdAt: true,
      lastSeenAt: true,
      lifetimeXp: true,
      stats: true,
    },
  });
  const s = u.stats;
  const prog = levelFromLifetimeXp(toNum(u.lifetimeXp));
  const recent = await prisma.gameHistory.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 10 });
  const full = fullPublicStats(u.createdAt, s);
  const n = (v: bigint | null | undefined) => toNum(v ?? 0n);
  return {
    user: {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
      lastActiveAt: u.lastSeenAt.toISOString(),
    },
    privacy: {
      privacy: u.privacy,
      hideNetResult: u.hideNetResult,
      hideTotalWagered: u.hideTotalWagered,
      hideTotalWon: u.hideTotalWon,
      hideLargestWin: u.hideLargestWin,
    },
    level: {
      level: prog.level,
      tier: tierForLevel(prog.level),
      xpIntoLevel: prog.xpIntoLevel,
      xpForNext: prog.xpForNext,
      lifetimeXp: n(u.lifetimeXp),
    },
    /** Unfiltered — used for the owner's own view and the privacy preview. */
    publicStats: full,
    general: {
      gamesPlayed: full.gamesPlayed,
      totalWagered: full.totalWagered,
      totalWon: full.totalWon,
      netResult: full.netResult,
      largestWin: full.largestWin,
      favoriteGame: full.favoriteGame,
      createdAt: u.createdAt.toISOString(),
      lastActiveAt: u.lastSeenAt.toISOString(),
    },
    blackjack: {
      hands: s?.bjHands ?? 0,
      wins: s?.bjWins ?? 0,
      losses: s?.bjLosses ?? 0,
      pushes: s?.bjPushes ?? 0,
      blackjacks: s?.bjBlackjacks ?? 0,
      largestBlackjackWin: n(s?.bjLargestBlackjackWin),
    },
    baccarat: {
      hands: s?.bacHands ?? 0,
      playerWins: s?.bacPlayerWins ?? 0,
      bankerWins: s?.bacBankerWins ?? 0,
      ties: s?.bacTies ?? 0,
    },
    roulette: { spins: s?.rouSpins ?? 0, largestWin: n(s?.rouLargestWin) },
    crash: { rounds: s?.crashRounds ?? 0, highestCashout: s?.crashHighestCashout ?? 0, largestWin: n(s?.crashLargestWin) },
    slots: {
      spins: s?.slotSpins ?? 0,
      largestWin: n(s?.slotLargestWin),
      favoriteSlot: favoriteSlot(s),
      bySlot: GAMES.filter((g) => g.key === 'SLOTS').map((g) => ({ id: g.id, name: g.name, spins: new Map(slotCounts(s)).get(g.id) ?? 0 })),
    },
    recent: recent.map((r) => ({
      id: r.id,
      game: r.game as GameKey,
      variant: r.gameVariant,
      gameName: gameLabel(r.gameVariant) ?? gameLabel(r.game) ?? r.game,
      referenceId: r.referenceId,
      wager: n(r.wager),
      payout: n(r.payout),
      net: n(r.net),
      multiplier: r.multiplier,
      summary: r.resultSummary,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export type OwnProfile = Awaited<ReturnType<typeof getOwnProfile>>;
