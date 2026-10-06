import { z } from 'zod';
import { route } from '@/server/api/handler';
import { listReports, resolveReports } from '@/server/services/chat/moderation-service';

/** Moderator reports queue: one item per reported message, grouped reports inside. */
export const GET = route(
  { auth: 'MODERATOR', query: z.object({ status: z.enum(['OPEN', 'RESOLVED', 'DISMISSED']).default('OPEN') }) },
  async ({ user, query }) => listReports({ actorId: user.id, status: query.status }),
);

export const POST = route(
  { auth: 'MODERATOR', body: z.object({ messageId: z.string().min(1).max(40), status: z.enum(['RESOLVED', 'DISMISSED']) }) },
  async ({ user, body }) => resolveReports({ actorId: user.id, messageId: body.messageId, status: body.status }),
);
