import { z } from 'zod';
import { route, RequestId } from '@/server/api/handler';
import { spin } from '@/server/services/roulette/roulette-service';
import { BET_TYPES, MAX_BETS_PER_SPIN } from '@/engines/roulette';

const Bet = z.object({
  type: z.enum(BET_TYPES),
  numbers: z.array(z.number().int().min(0).max(36)).max(18),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

export const POST = route(
  {
    auth: true,
    body: z.object({ bets: z.array(Bet).min(1).max(MAX_BETS_PER_SPIN), requestId: RequestId }),
    rateLimit: { bucket: 'roulette-spin', limit: 60, windowSec: 60 },
  },
  async ({ user, body }) => spin(user.id, body),
);
