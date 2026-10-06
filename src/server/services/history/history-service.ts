import type { GameHistory, Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { toNum } from '@/lib/money';
import type { GameKey } from '@/lib/games';

/**
 * Game history (unified GameHistory rows written at settlement by every game).
 * Owner-only, newest first, cursor-paginated by row id with a stable
 * (createdAt DESC, id DESC) order so concurrent inserts never shift pages.
 */
export const HISTORY_GAMES = ['BLACKJACK', 'BACCARAT', 'ROULETTE', 'CRASH', 'SLOTS'] as const satisfies readonly GameKey[];

export interface HistoryQuery {
  game?: GameKey;
  cursor?: string;
  take?: number;
}

export function serializeHistory(r: GameHistory) {
  return {
    id: r.id,
    game: r.game as GameKey,
    variant: r.gameVariant,
    referenceId: r.referenceId,
    wager: toNum(r.wager),
    payout: toNum(r.payout),
    net: toNum(r.net),
    multiplier: r.multiplier,
    summary: r.resultSummary,
    createdAt: r.createdAt.toISOString(),
  };
}
export type HistoryItem = ReturnType<typeof serializeHistory>;

export async function listHistory(userId: string, q: HistoryQuery = {}) {
  const take = Math.min(Math.max(q.take ?? 25, 1), 100);
  const where: Prisma.GameHistoryWhereInput = { userId, ...(q.game ? { game: q.game } : {}) };

  // A cursor must belong to the same user (and filter), otherwise Prisma would
  // happily page from another user's row position.
  if (q.cursor) {
    const anchor = await prisma.gameHistory.findFirst({ where: { ...where, id: q.cursor }, select: { id: true } });
    if (!anchor) return { items: [], nextCursor: null };
  }

  const rows = await prisma.gameHistory.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  return {
    items: rows.slice(0, take).map(serializeHistory),
    nextCursor: hasMore ? rows[take - 1].id : null,
  };
}

/** Lifetime totals for the history header (per game or overall). */
export async function historyTotals(userId: string, game?: GameKey) {
  const agg = await prisma.gameHistory.aggregate({
    where: { userId, ...(game ? { game } : {}) },
    _count: { _all: true },
    _sum: { wager: true, payout: true, net: true },
  });
  return {
    rounds: agg._count._all,
    wagered: toNum(agg._sum.wager ?? 0n),
    returned: toNum(agg._sum.payout ?? 0n),
    net: toNum(agg._sum.net ?? 0n),
  };
}
