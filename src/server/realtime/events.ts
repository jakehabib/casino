import { redis } from '@/server/redis';
import { logger } from '@/server/logger';

/**
 * Cross-process realtime bus. API route handlers (Next.js) and the socket
 * server may live in different module graphs or processes, so every realtime
 * emission is published to Redis and fanned out by the socket server.
 */
export const EVENTS_CHANNEL = 'nova:events';

export type RealtimeEvent =
  | { scope: 'user'; userId: string; event: string; data: unknown }
  | { scope: 'all'; event: string; data: unknown }
  | { scope: 'room'; room: string; event: string; data: unknown };

export async function publish(evt: RealtimeEvent): Promise<void> {
  try {
    await redis.publish(EVENTS_CHANNEL, JSON.stringify(evt));
  } catch (err) {
    logger.warn({ err, event: evt.event }, 'realtime publish failed');
  }
}

export const emitToUser = (userId: string, event: string, data: unknown) =>
  publish({ scope: 'user', userId, event, data });
export const emitToAll = (event: string, data: unknown) => publish({ scope: 'all', event, data });
export const emitToRoom = (room: string, event: string, data: unknown) => publish({ scope: 'room', room, event, data });

/**
 * Collects events during a DB transaction and flushes them only after commit,
 * so clients never see a balance that was rolled back.
 */
export class PostCommit {
  private queue: RealtimeEvent[] = [];
  push(evt: RealtimeEvent) {
    this.queue.push(evt);
  }
  user(userId: string, event: string, data: unknown) {
    this.queue.push({ scope: 'user', userId, event, data });
  }
  async flush() {
    const q = this.queue;
    this.queue = [];
    await Promise.all(q.map(publish));
  }
}
