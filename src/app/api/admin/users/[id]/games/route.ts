import { z } from 'zod';
import { route } from '@/server/api/handler';
import { getUserGames } from '@/server/services/admin/users';

const Query = z.object({
  cursor: z.string().max(40).optional(),
  take: z.coerce.number().int().min(1).max(100).optional(),
  game: z.enum(['BLACKJACK', 'BACCARAT', 'ROULETTE', 'CRASH', 'SLOTS']).optional(),
});

export const GET = route<undefined, typeof Query, { id: string }>({ auth: 'ADMIN', query: Query }, async ({ user, params, query }) =>
  getUserGames(user, params.id, query),
);
