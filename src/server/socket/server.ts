import type { Server as HttpServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';
import { parseCookie } from 'cookie';
import { SESSION_COOKIE, userFromToken } from '@/server/auth/tokens';
import { redisSubscriber } from '@/server/redis';
import { EVENTS_CHANNEL, type RealtimeEvent } from '@/server/realtime/events';
import { logger } from '@/server/logger';
import { setIO, userRoom, type NovaIO } from './io';
import { registerPresence } from './presence';
import { registerSocketModules } from './modules';

export async function createSocketServer(http: HttpServer, opts: { origin: string }) {
  const io: NovaIO = new Server(http, {
    path: '/socket.io',
    cors: { origin: opts.origin, credentials: true },
    pingInterval: 10_000,
    pingTimeout: 8_000,
    maxHttpBufferSize: 16_000,
    connectionStateRecovery: { maxDisconnectionDuration: 30_000, skipMiddlewares: false },
  });
  setIO(io);

  // Cookie-based session auth. Guests may connect (read-only lobby, chat, crash spectating).
  // Cross-site WebSocket hijacking guard: CORS does not apply to the websocket
  // transport, so reject browser handshakes from any other origin explicitly.
  const allowedOrigin = (() => {
    try {
      return new URL(opts.origin).host;
    } catch {
      return null;
    }
  })();
  io.use((socket, next) => {
    const origin = socket.handshake.headers.origin;
    if (!origin) return next(); // non-browser clients (no ambient cookies to abuse)
    let host: string | null = null;
    try {
      host = new URL(origin).host;
    } catch {
      host = null;
    }
    const reqHost = socket.handshake.headers['x-forwarded-host'] ?? socket.handshake.headers.host;
    if (host && (host === allowedOrigin || host === reqHost)) return next();
    logger.warn({ origin }, 'socket handshake from foreign origin rejected');
    next(new Error('forbidden_origin'));
  });

  io.use(async (socket, next) => {
    try {
      const raw = socket.handshake.headers.cookie;
      const token = raw ? parseCookie(raw)[SESSION_COOKIE] : undefined;
      socket.data.user = await userFromToken(token);
      socket.data.guestId = randomUUID();
      next();
    } catch (err) {
      logger.warn({ err }, 'socket auth failed');
      next(new Error('auth_failed'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    if (user) void socket.join(userRoom(user.id));
    socket.on('error', (err) => logger.warn({ err }, 'socket error'));
  });

  // Fan-out from the Redis realtime bus.
  const sub = redisSubscriber();
  await sub.subscribe(EVENTS_CHANNEL);
  sub.on('message', (_channel, message) => {
    try {
      const evt = JSON.parse(message) as RealtimeEvent;
      if (evt.scope === 'user') io.to(userRoom(evt.userId)).emit(evt.event, evt.data);
      else if (evt.scope === 'room') io.to(evt.room).emit(evt.event, evt.data);
      else io.emit(evt.event, evt.data);
    } catch (err) {
      logger.error({ err }, 'bad realtime event');
    }
  });

  registerPresence(io);
  await registerSocketModules(io);
  return io;
}
