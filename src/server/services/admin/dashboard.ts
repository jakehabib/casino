import { prisma, Prisma } from '@/server/db';
import { toNum } from '@/lib/money';
import { type Actor, requireRole } from './access';

export const DASHBOARD_GAMES = ['BLACKJACK', 'BACCARAT', 'ROULETTE', 'CRASH', 'SLOTS'] as const;
const DAY = 86_400_000;

/**
 * Platform overview. Every figure is a single aggregate query over indexed
 * columns (GameHistory.createdAt, WalletTransaction.type+createdAt,
 * User.lastSeenAt) — no per-row work in Node.
 */
export async function getDashboard(actor: Actor, now = new Date()) {
  requireRole(actor, 'ADMIN');
  const t15m = new Date(now.getTime() - 15 * 60_000);
  const t24h = new Date(now.getTime() - DAY);
  const t7d = new Date(now.getTime() - 7 * DAY);
  const t14d = new Date(now.getTime() - 14 * DAY);
  // Start of the UTC day 13 days ago, so the series has exactly 14 whole buckets.
  const seriesStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 13 * DAY);

  const [
    active15m,
    active24h,
    totalUsers,
    newUsers24h,
    gamesAll,
    games24h,
    ledgerByType,
    ledger24h,
    outstanding,
    perGameAll,
    perGame24h,
    perGame7d,
    daily,
  ] = await Promise.all([
    prisma.user.count({ where: { lastSeenAt: { gte: t15m } } }),
    prisma.user.count({ where: { lastSeenAt: { gte: t24h } } }),
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: t24h } } }),
    prisma.gameHistory.count(),
    prisma.gameHistory.count({ where: { createdAt: { gte: t24h } } }),
    prisma.walletTransaction.groupBy({ by: ['type'], _sum: { amount: true }, _count: true }),
    prisma.walletTransaction.groupBy({ by: ['type'], where: { createdAt: { gte: t24h } }, _sum: { amount: true } }),
    prisma.wallet.aggregate({ _sum: { balance: true }, _count: true }),
    prisma.gameHistory.groupBy({ by: ['game'], _count: true, _sum: { wager: true, payout: true } }),
    prisma.gameHistory.groupBy({ by: ['game'], where: { createdAt: { gte: t24h } }, _count: true, _sum: { wager: true, payout: true } }),
    prisma.gameHistory.groupBy({ by: ['game'], where: { createdAt: { gte: t7d } }, _count: true, _sum: { wager: true, payout: true } }),
    prisma.$queryRaw<{ day: Date; rounds: bigint; wagered: bigint | null; payout: bigint | null; players: bigint }[]>(Prisma.sql`
      SELECT date_trunc('day', "createdAt" AT TIME ZONE 'UTC') AS day,
             COUNT(*)::bigint AS rounds,
             SUM(wager)::bigint AS wagered,
             SUM(payout)::bigint AS payout,
             COUNT(DISTINCT "userId")::bigint AS players
        FROM "GameHistory"
       WHERE "createdAt" >= ${seriesStart} AND "createdAt" >= ${t14d}
       GROUP BY 1
       ORDER BY 1`),
  ]);

  const sumOf = (rows: { type: string; _sum: { amount: bigint | null } }[], type: string) =>
    rows.find((r) => r.type === type)?._sum.amount ?? 0n;
  const wagered = -sumOf(ledgerByType, 'BET') - sumOf(ledgerByType, 'REFUND');
  const won = sumOf(ledgerByType, 'WIN');
  const wagered24h = -sumOf(ledger24h, 'BET') - sumOf(ledger24h, 'REFUND');
  const won24h = sumOf(ledger24h, 'WIN');

  const perGame = (rows: typeof perGameAll) =>
    DASHBOARD_GAMES.map((g) => {
      const r = rows.find((x) => x.game === g);
      const w = r?._sum.wager ?? 0n;
      const p = r?._sum.payout ?? 0n;
      return { game: g, rounds: r?._count ?? 0, wagered: toNum(w), payout: toNum(p), rtpBps: w > 0n ? Number((p * 10_000n) / w) : null };
    });

  const byDay = new Map(daily.map((d) => [new Date(d.day).toISOString().slice(0, 10), d]));
  const series = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(seriesStart.getTime() + i * DAY).toISOString().slice(0, 10);
    const d = byDay.get(day);
    return {
      day,
      rounds: d ? Number(d.rounds) : 0,
      wagered: toNum(d?.wagered ?? 0n),
      payout: toNum(d?.payout ?? 0n),
      players: d ? Number(d.players) : 0,
    };
  });

  return {
    generatedAt: now.toISOString(),
    users: { active15m, active24h, total: totalUsers, new24h: newUsers24h },
    games: { total: gamesAll, last24h: games24h },
    credits: {
      wagered: toNum(wagered),
      won: toNum(won),
      wagered24h: toNum(wagered24h),
      won24h: toNum(won24h),
      outstanding: toNum(outstanding._sum.balance ?? 0n),
      wallets: outstanding._count,
      rtpBps: wagered > 0n ? Number((won * 10_000n) / wagered) : null,
      issued: {
        signup: toNum(sumOf(ledgerByType, 'SIGNUP_GRANT')),
        rewards: toNum(sumOf(ledgerByType, 'FREE_CREDIT_CLAIM')),
        adjustments: toNum(sumOf(ledgerByType, 'ADMIN_ADJUSTMENT')),
      },
    },
    perGame: { all: perGame(perGameAll), last24h: perGame(perGame24h), last7d: perGame(perGame7d) },
    series,
  };
}

export type DashboardPayload = Awaited<ReturnType<typeof getDashboard>>;
