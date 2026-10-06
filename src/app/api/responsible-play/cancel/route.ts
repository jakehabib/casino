import { z } from 'zod';
import { route } from '@/server/api/handler';
import { cancelPendingChange } from '@/server/services/responsible-play/settings';

export const POST = route({ auth: true, body: z.object({ changeId: z.string().min(1).max(40) }) }, async ({ user, body }) => {
  await cancelPendingChange(user.id, body.changeId);
  return { ok: true };
});
