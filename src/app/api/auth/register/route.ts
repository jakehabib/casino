import { route } from '@/server/api/handler';
import { RegisterSchema, registerUser } from '@/server/services/account/account-service';
import { createSession } from '@/server/auth/session';

export const POST = route(
  { body: RegisterSchema, rateLimit: { bucket: 'register', limit: 5, windowSec: 600 } },
  async ({ body, req, ip }) => {
    const user = await registerUser(body);
    await createSession(user.id, { ip, userAgent: req.headers.get('user-agent') });
    return { ok: true, userId: user.id };
  },
);
