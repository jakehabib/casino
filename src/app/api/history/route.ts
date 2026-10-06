import { z } from 'zod';
import { route } from '@/server/api/handler';
import { HISTORY_GAMES, historyTotals, listHistory } from '@/server/services/history/history-service';

/**
 * GET /api/history?game=&cursor=&take=
 * The signed-in user's settled rounds, newest first. `totals` is included on
 * the first page only (it is filter-wide, not page-wide).
 */
export const GET = route(
  {
    auth: true,
    query: z.object({
      game: z.enum(HISTORY_GAMES).optional(),
      cursor: z.string().min(1).max(40).optional(),
      take: z.coerce.number().int().min(1).max(100).optional(),
    }),
    rateLimit: { bucket: 'history', limit: 120, windowSec: 60 },
  },
  async ({ user, query }) => {
    const [page, totals] = await Promise.all([
      listHistory(user.id, query),
      query.cursor ? Promise.resolve(null) : historyTotals(user.id, query.game),
    ]);
    return { ...page, totals };
  },
);
