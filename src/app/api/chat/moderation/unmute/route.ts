import { z } from 'zod';
import { route } from '@/server/api/handler';
import { unmuteUser } from '@/server/services/chat/moderation-service';

export const POST = route(
  { auth: 'MODERATOR', body: z.object({ userId: z.string().min(1).max(40), reason: z.string().max(300).nullish() }) },
  async ({ user, body }) => unmuteUser({ actorId: user.id, userId: body.userId, reason: body.reason }),
);
