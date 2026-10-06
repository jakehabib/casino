import { z } from 'zod';
import { route } from '@/server/api/handler';
import { setTimezone } from '@/server/services/responsible-play/settings';

export const POST = route({ auth: true, body: z.object({ timezone: z.string().min(1).max(64) }) }, async ({ user, body }) => {
  await setTimezone(user.id, body.timezone);
  return { ok: true };
});
