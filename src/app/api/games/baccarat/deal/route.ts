import { z } from 'zod';
import { route, RequestId } from '@/server/api/handler';
import { deal } from '@/server/services/baccarat/baccarat-service';

const Amount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional();

export const POST = route(
  {
    auth: true,
    body: z.object({
      bets: z.object({ PLAYER: Amount, BANKER: Amount, TIE: Amount }).strict(),
      requestId: RequestId,
    }),
    rateLimit: { bucket: 'baccarat-deal', limit: 90, windowSec: 60 },
  },
  async ({ user, body }) => deal(user.id, body),
);
