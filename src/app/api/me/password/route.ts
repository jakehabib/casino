import { z } from 'zod';
import { route } from '@/server/api/handler';
import { PasswordSchema, changePassword } from '@/server/services/account/account-service';

export const POST = route(
  {
    auth: true,
    body: z.object({ currentPassword: z.string().min(1).max(128), newPassword: PasswordSchema }),
    rateLimit: { bucket: 'pw-change', limit: 5, windowSec: 600 },
  },
  async ({ user, body }) => {
    await changePassword(user.id, body.currentPassword, body.newPassword);
    return { ok: true };
  },
);
