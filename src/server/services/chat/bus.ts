import { redis } from '@/server/redis';
import { logger } from '@/server/logger';
import type { ChatMessageDTO } from './types';

/**
 * Chat fan-out bus. Chat broadcasts do NOT use the generic realtime bus
 * because they need per-viewer filtering (personal blocks are enforced
 * server-side). The socket module subscribes to this channel and delivers to
 * each socket in the room individually.
 */
export const CHAT_CHANNEL = 'nova:chat';

export type ChatBusEvent =
  | { t: 'message'; room: string; authorId: string; data: ChatMessageDTO }
  | { t: 'deleted'; room: string; ids: string[] }
  | { t: 'blocks'; userId: string };

export async function publishChat(evt: ChatBusEvent): Promise<void> {
  try {
    await redis.publish(CHAT_CHANNEL, JSON.stringify(evt));
  } catch (err) {
    logger.warn({ err, t: evt.t }, 'chat publish failed');
  }
}
