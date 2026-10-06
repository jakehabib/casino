import { z } from 'zod';
import { route } from '@/server/api/handler';
import { warnUser } from '@/server/services/chat/moderation-service';

export const POST = route(
  {
    auth: 'MODERATOR',
    body: z.object({ userId: z.string().min(1).max(40), reason: z.string().trim().min(3, 'Add a reason').max(300), messageId: z.string().max(40).nullish() }),
  },
  async ({ user, body }) => warnUser({ actorId: user.id, userId: body.userId, reason: body.reason, messageId: body.messageId }),
);
