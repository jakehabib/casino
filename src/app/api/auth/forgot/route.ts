import { z } from 'zod';
import { route } from '@/server/api/handler';
import { requestPasswordReset } from '@/server/services/account/account-service';

export const POST = route(
  { body: z.object({ email: z.string().trim().email().max(254) }), rateLimit: { bucket: 'forgot', limit: 5, windowSec: 900 } },
  async ({ body }) => {
    await requestPasswordReset(body.email);
    return { ok: true };
  },
);
