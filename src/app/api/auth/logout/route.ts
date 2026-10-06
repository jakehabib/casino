import { route } from '@/server/api/handler';
import { destroySession } from '@/server/auth/session';

export const POST = route({}, async () => {
  await destroySession();
  return { ok: true };
});
