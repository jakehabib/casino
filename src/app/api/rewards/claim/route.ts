import { z } from 'zod';
import { route } from '@/server/api/handler';
import { claimReward } from '@/server/services/rewards/rewards-service';

export const POST = route(
  {
    auth: true,
    body: z.object({ type: z.enum(['DAILY', 'REFILL', 'WEEKLY', 'LEVEL_UP']), level: z.number().int().optional() }),
    rateLimit: { bucket: 'reward-claim', limit: 10, windowSec: 60 },
  },
  async ({ user, body }) => claimReward(user.id, body.type, { level: body.level }),
);
