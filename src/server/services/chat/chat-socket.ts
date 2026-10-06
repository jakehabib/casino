import { z } from 'zod';
import { AppError } from '@/lib/errors';
import { redis } from '@/server/redis';
import { logger } from '@/server/logger';
import { userRoom, type Ack, type NovaIO, type NovaSocket } from '@/server/socket/io';
import { CHAT_CHANNEL, type ChatBusEvent } from './bus';
import { getBlockedIds, joinPayload, sendMessage } from './chat-service';
import { deleteMessage } from './moderation-service';
import { CHAT_SOCKET_ROOM, type ChatJoinPayload, type ChatMessageDTO } from './types';

/**
 * Chat realtime module.
 *   chat:join   (ack) → ChatJoinPayload (recent 50, viewer status, block list)
 *   chat:send   (ack) {content, replyToId?, clientId} → ChatMessageDTO
 *   chat:delete (ack) {messageId, reason?}  — moderators
 * Server → client: chat:message, chat:deleted, plus per-user chat:status,
 * chat:mention, chat:warn, chat:blocks (via the realtime bus).
 *
 * Messages are fanned out per socket so a viewer's personal blocks are
 * enforced server-side: a blocked author's messages are never sent to them.
 */
const SendSchema = z.object({
  content: z.string().max(2000),
  replyToId: z.string().max(40).nullish(),
  clientId: z.string().max(64).nullish(),
});
const DeleteSchema = z.object({ messageId: z.string().min(1).max(40), reason: z.string().max(300).nullish() });

/** Per-socket set of authors the viewer has blocked. */
const blockCache = new WeakMap<NovaSocket, Set<string>>();

function fail(ack: Ack<never> | undefined, err: unknown, ctx: Record<string, unknown>) {
  if (typeof ack !== 'function') return;
  if (err instanceof AppError) return ack({ ok: false, error: { code: err.code, message: err.message, details: err.details } });
  if (err instanceof z.ZodError) return ack({ ok: false, error: { code: 'VALIDATION', message: 'Invalid message' } });
  logger.error({ err, ...ctx }, 'chat socket handler failed');
  ack({ ok: false, error: { code: 'INTERNAL', message: 'Something went wrong' } });
}

async function loadBlocks(socket: NovaSocket) {
  const user = socket.data.user;
  blockCache.set(socket, new Set(user ? await getBlockedIds(user.id) : []));
}

function deliver(io: NovaIO, evt: ChatBusEvent) {
  if (evt.t === 'message') {
    const ids = io.sockets.adapter.rooms.get(CHAT_SOCKET_ROOM);
    if (!ids) return;
    for (const id of ids) {
      const s = io.sockets.sockets.get(id) as NovaSocket | undefined;
      if (!s || blockCache.get(s)?.has(evt.authorId)) continue;
      // Only the author gets its clientId echoed back.
      const data: ChatMessageDTO = s.data.user?.id === evt.authorId ? evt.data : { ...evt.data, clientId: null };
      s.emit('chat:message', data);
    }
  } else if (evt.t === 'deleted') {
    io.to(CHAT_SOCKET_ROOM).emit('chat:deleted', { ids: evt.ids });
  } else if (evt.t === 'blocks') {
    const ids = io.sockets.adapter.rooms.get(userRoom(evt.userId));
    for (const id of ids ?? []) {
      const s = io.sockets.sockets.get(id) as NovaSocket | undefined;
      if (s) void loadBlocks(s).catch((err) => logger.warn({ err }, 'chat block reload failed'));
    }
  }
}

export async function register(io: NovaIO) {
  // Dedicated subscriber connection: a subscribed client can't issue commands,
  // and the generic realtime subscriber treats every message as a RealtimeEvent.
  const sub = redis.duplicate();
  sub.on('error', () => undefined);
  await sub.subscribe(CHAT_CHANNEL);
  sub.on('message', (channel, raw) => {
    if (channel !== CHAT_CHANNEL) return;
    try {
      deliver(io, JSON.parse(raw) as ChatBusEvent);
    } catch (err) {
      logger.error({ err }, 'bad chat bus event');
    }
  });

  io.on('connection', (socket: NovaSocket) => {
    socket.on('chat:join', async (_payload: unknown, ack?: Ack<ChatJoinPayload>) => {
      if (typeof _payload === 'function') ack = _payload as Ack<ChatJoinPayload>;
      try {
        await loadBlocks(socket);
        await socket.join(CHAT_SOCKET_ROOM);
        const payload = await joinPayload(socket.data.user?.id ?? null);
        if (typeof ack === 'function') ack({ ok: true, data: payload });
      } catch (err) {
        fail(ack, err, { event: 'chat:join' });
      }
    });

    socket.on('chat:leave', () => {
      void socket.leave(CHAT_SOCKET_ROOM);
    });

    socket.on('chat:send', async (payload: unknown, ack?: Ack<ChatMessageDTO>) => {
      try {
        const user = socket.data.user;
        if (!user) throw new AppError('UNAUTHENTICATED', 'Sign in to chat.');
        const body = SendSchema.parse(payload);
        const msg = await sendMessage({ userId: user.id, content: body.content, replyToId: body.replyToId, clientId: body.clientId });
        if (typeof ack === 'function') ack({ ok: true, data: msg });
      } catch (err) {
        fail(ack, err, { event: 'chat:send' });
      }
    });

    socket.on('chat:delete', async (payload: unknown, ack?: Ack<{ ok: true }>) => {
      try {
        const user = socket.data.user;
        if (!user) throw new AppError('UNAUTHENTICATED');
        const body = DeleteSchema.parse(payload);
        await deleteMessage({ actorId: user.id, messageId: body.messageId, reason: body.reason });
        if (typeof ack === 'function') ack({ ok: true, data: { ok: true } });
      } catch (err) {
        fail(ack, err, { event: 'chat:delete' });
      }
    });
  });
}
