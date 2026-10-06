import { z } from 'zod';
import { route } from '@/server/api/handler';
import { PasswordSchema, resetPassword } from '@/server/services/account/account-service';

export const POST = route(
  { body: z.object({ token: z.string().min(10).max(200), password: PasswordSchema }), rateLimit: { bucket: 'reset', limit: 10, windowSec: 900 } },
  async ({ body }) => {
    await resetPassword(body.token, body.password);
    return { ok: true };
  },
);
