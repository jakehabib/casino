import { z } from 'zod';
import { route } from '@/server/api/handler';
import { devSetCrashCountdown, requireDevUser } from '@/server/services/admin/dev-tools';

export const POST = route({ devOnly: true, body: z.object({ ms: z.number().int().nullable() }) }, async ({ user, body }) => {
  requireDevUser(user);
  return devSetCrashCountdown(body.ms);
});
