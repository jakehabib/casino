import { z } from 'zod';
import { route } from '@/server/api/handler';
import { deleteMessage } from '@/server/services/chat/moderation-service';

export const POST = route(
  { auth: 'MODERATOR', body: z.object({ messageId: z.string().min(1).max(40), reason: z.string().max(300).nullish() }) },
  async ({ user, body }) => deleteMessage({ actorId: user.id, messageId: body.messageId, reason: body.reason }),
);
