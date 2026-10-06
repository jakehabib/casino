import { z } from 'zod';
import { route, RequestId } from '@/server/api/handler';
import { act } from '@/server/services/blackjack/blackjack-service';
import { BLACKJACK_ACTIONS } from '@/engines/blackjack/types';

/**
 * POST /api/games/blackjack/action { gameId, action, requestId }
 * HIT | STAND | DOUBLE | SPLIT | INSURANCE | DECLINE_INSURANCE. Idempotent by
 * (gameId, requestId): a duplicate returns the current state.
 */
export const POST = route(
  {
    auth: true,
    body: z.object({ gameId: z.string().min(1).max(64), action: z.enum(BLACKJACK_ACTIONS), requestId: RequestId }),
    rateLimit: { bucket: 'bj-action', limit: 300, windowSec: 60 },
  },
  async ({ user, body }) => act(user.id, body),
);
