import { z } from 'zod';
import { route } from '@/server/api/handler';
import { PasswordSchema, changePassword } from '@/server/services/account/account-service';
import { SESSION_COOKIE, hashToken } from '@/server/auth/session';

export const POST = route(
  {
    auth: true,
    body: z.object({ currentPassword: z.string().min(1).max(128), newPassword: PasswordSchema }),
    rateLimit: { bucket: 'pw-change', limit: 5, windowSec: 600 },
  },
  async ({ user, body, req }) => {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    await changePassword(user.id, body.currentPassword, body.newPassword, token ? hashToken(token) : null);
    return { ok: true };
  },
);
