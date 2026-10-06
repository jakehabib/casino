import { z } from 'zod';
import { route, RequestId } from '@/server/api/handler';
import { deal } from '@/server/services/blackjack/blackjack-service';

/** POST /api/games/blackjack/deal { bet, requestId } — idempotent by requestId. */
export const POST = route(
  {
    auth: true,
    body: z.object({ bet: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), requestId: RequestId }),
    rateLimit: { bucket: 'bj-deal', limit: 90, windowSec: 60 },
  },
  async ({ user, body }) => deal(user.id, body),
);
