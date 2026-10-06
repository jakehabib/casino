import { route } from '@/server/api/handler';
import { getActive } from '@/server/services/blackjack/blackjack-service';

/**
 * GET /api/games/blackjack/active
 * The unfinished hand (hole card hidden) + table config + shoe status.
 * Used to restore a hand after a refresh.
 */
export const GET = route({ auth: true, rateLimit: { bucket: 'bj-active', limit: 120, windowSec: 60 } }, async ({ user }) =>
  getActive(user.id),
);
