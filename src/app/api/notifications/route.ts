import { route } from '@/server/api/handler';
import { listNotifications } from '@/server/services/notifications/notification-service';

export const GET = route({ auth: true }, async ({ user }) => listNotifications(user.id));
