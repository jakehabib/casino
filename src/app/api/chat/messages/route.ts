import { z } from 'zod';
import { route } from '@/server/api/handler';
import { joinPayload, sendMessage } from '@/server/services/chat/chat-service';

/**
 * REST mirror of the chat socket (initial load fallback + non-socket clients).
 * GET  → recent messages + viewer status (blocked authors filtered out).
 * POST → send a message (same validation/limits as `chat:send`).
 */
export const GET = route({ rateLimit: { bucket: 'chat-read', limit: 60, windowSec: 60 } }, async ({ user }) => joinPayload(user?.id ?? null));

export const POST = route(
  {
    auth: true,
    body: z.object({ content: z.string().max(2000), replyToId: z.string().max(40).nullish(), clientId: z.string().max(64).nullish() }),
  },
  async ({ user, body }) => sendMessage({ userId: user.id, content: body.content, replyToId: body.replyToId, clientId: body.clientId }),
);
