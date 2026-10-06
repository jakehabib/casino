import { route } from '@/server/api/handler';
import { LoginSchema, authenticate } from '@/server/services/account/account-service';
import { createSession } from '@/server/auth/session';
import { rateLimit } from '@/server/rate-limit';

export const POST = route(
  { body: LoginSchema, rateLimit: { bucket: 'login-ip', limit: 20, windowSec: 300 } },
  async ({ body, req, ip }) => {
    await rateLimit('login-id', body.identifier.toLowerCase(), 10, 300);
    const user = await authenticate(body.identifier, body.password);
    await createSession(user.id, { ip, userAgent: req.headers.get('user-agent') });
    return { ok: true };
  },
);
