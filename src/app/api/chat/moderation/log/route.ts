import { z } from 'zod';
import { route } from '@/server/api/handler';
import { listModerationLog } from '@/server/services/chat/moderation-service';

export const GET = route(
  { auth: 'MODERATOR', query: z.object({ userId: z.string().max(40).optional(), limit: z.coerce.number().int().min(1).max(200).optional() }) },
  async ({ user, query }) => listModerationLog({ actorId: user.id, userId: query.userId, limit: query.limit }),
);
