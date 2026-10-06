import { z } from 'zod';
import { route } from '@/server/api/handler';
import { requestLimitChange, serializeLimitChange } from '@/server/services/responsible-play/settings';

export const POST = route(
  {
    auth: true,
    body: z.object({
      limitType: z.enum(['DAILY_WAGER', 'DAILY_LOSS']),
      value: z.number().int().positive().max(10_000_000_000).nullable(),
    }),
    rateLimit: { bucket: 'rp-limit', limit: 20, windowSec: 60 },
  },
  async ({ user, body }) => {
    const res = await requestLimitChange(user.id, body.limitType, body.value === null ? null : BigInt(body.value));
    return { applied: res.applied, change: res.change ? serializeLimitChange(res.change) : null };
  },
);
