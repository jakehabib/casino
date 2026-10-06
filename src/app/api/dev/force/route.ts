import { z } from 'zod';
import { route } from '@/server/api/handler';
import { devSetForced, requireDevUser } from '@/server/services/admin/dev-tools';

const Body = z.object({
  game: z.enum(['blackjack', 'baccarat', 'roulette', 'crash', 'slots']),
  /** null clears a pending forced outcome. Validated per game in the service. */
  value: z.unknown().nullable(),
});

export const POST = route({ body: Body }, async ({ user, body }) => devSetForced(requireDevUser(user).id, body.game, body.value ?? null));
