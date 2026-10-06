import { z } from 'zod';
import { route } from '@/server/api/handler';
import { listBlocks, setBlocked } from '@/server/services/chat/chat-service';

/** Personal block list. Blocked players' chat messages are hidden from you server-side. */
export const GET = route({ auth: true }, async ({ user }) => ({ items: await listBlocks(user.id) }));

export const POST = route(
  {
    auth: true,
    body: z.object({ userId: z.string().min(1).max(40), blocked: z.boolean() }),
    rateLimit: { bucket: 'chat-block', limit: 30, windowSec: 60 },
  },
  async ({ user, body }) => setBlocked(user.id, body.userId, body.blocked),
);
