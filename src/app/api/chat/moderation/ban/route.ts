import { z } from 'zod';
import { route } from '@/server/api/handler';
import { banUser } from '@/server/services/chat/moderation-service';

export const POST = route(
  { auth: 'MODERATOR', body: z.object({ userId: z.string().min(1).max(40), reason: z.string().max(300).nullish(), purge: z.boolean().optional() }) },
  async ({ user, body }) => banUser({ actorId: user.id, ...body }),
);
