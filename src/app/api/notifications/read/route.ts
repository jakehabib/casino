import { route } from '@/server/api/handler';
import { markAllRead } from '@/server/services/notifications/notification-service';

export const POST = route({ auth: true }, async ({ user }) => {
  await markAllRead(user.id);
  return { ok: true };
});
