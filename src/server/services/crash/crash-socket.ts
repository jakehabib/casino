import { z } from 'zod';
import type { NovaIO, NovaSocket, Ack } from '@/server/socket/io';
import { redis } from '@/server/redis';
import { emitToRoom } from '@/server/realtime/events';
import { rateLimit } from '@/server/rate-limit';
import { logger } from '@/server/logger';
import { AppError } from '@/lib/errors';
import { CrashController } from './crash-controller';
import { LeaderLock } from './crash-leader';
import { CRASH_ROOM, buildSnapshot, cashout, placeBet } from './crash-service';

/**
 * Socket layer for Launch (crash).
 *
 *  client → server   crash:join  (ack → snapshot incl. own bets)   crash:leave
 *                    crash:bet {slot, amount, autoCashout?, requestId}   (ack)
 *                    crash:cashout {slot, requestId}                     (ack)
 *  server → room     crash:state (transitions) · crash:tick (100ms) · crash:bet · crash:cashout
 *  server → user     crash:mybet (own bet changed, e.g. auto cash-out)
 *
 * Every process registers the RPC handlers (they are DB-transactional and
 * clock-based, so any node can serve them). Only the Redis leader runs the
 * round loop; its broadcasts travel over the Redis bus to every node.
 */
/** Same shape as RequestId in src/server/api/handler.ts (not imported: that module pulls in next/headers). */
const RequestId = z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/);

const BetSchema = z.object({
  slot: z.union([z.literal(0), z.literal(1)]),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  autoCashout: z.number().int().min(101).nullish(),
  requestId: RequestId,
});
const CashoutSchema = z.object({ slot: z.union([z.literal(0), z.literal(1)]), requestId: RequestId.optional() });

const g = globalThis as unknown as { __novaCrash?: { lock: LeaderLock; controller: CrashController } };

function fail(ack: Ack | undefined, err: unknown) {
  if (typeof ack !== 'function') return;
  if (err instanceof AppError) return ack({ ok: false, error: { code: err.code, message: err.message, details: err.details } });
  if (err instanceof z.ZodError) return ack({ ok: false, error: { code: 'VALIDATION', message: err.issues[0]?.message ?? 'Invalid input' } });
  logger.error({ err }, 'crash rpc failed');
  ack({ ok: false, error: { code: 'INTERNAL', message: 'Something went wrong' } });
}

function requireUser(socket: NovaSocket) {
  const user = socket.data.user;
  if (!user) throw new AppError('UNAUTHENTICATED', 'Sign in to place bets.');
  return user;
}

export function registerCrashHandlers(io: NovaIO) {
  io.on('connection', (socket: NovaSocket) => {
    socket.on('crash:join', async (_payload: unknown, maybeAck?: Ack) => {
      const ack = typeof _payload === 'function' ? (_payload as Ack) : maybeAck;
      try {
        await rateLimit('crash-join', socket.data.user?.id ?? socket.data.guestId, 30, 60);
        await socket.join(CRASH_ROOM);
        const snap = await buildSnapshot(socket.data.user?.id ?? null, Date.now());
        if (typeof ack === 'function') ack({ ok: true, data: snap });
        else socket.emit('crash:snapshot', snap);
      } catch (err) {
        fail(ack, err);
      }
    });

    socket.on('crash:leave', () => void socket.leave(CRASH_ROOM));

    socket.on('crash:bet', async (payload: unknown, ack?: Ack) => {
      const now = Date.now();
      try {
        const user = requireUser(socket);
        await rateLimit('crash-bet', user.id, 20, 10);
        const input = BetSchema.parse(payload);
        const res = await placeBet(user.id, { ...input, autoCashout: input.autoCashout ?? null }, now);
        if (typeof ack === 'function') ack({ ok: true, data: res });
      } catch (err) {
        fail(ack, err);
      }
    });

    socket.on('crash:cashout', async (payload: unknown, ack?: Ack) => {
      // The authoritative instant is when the request arrived — read it first.
      const now = Date.now();
      try {
        const user = requireUser(socket);
        await rateLimit('crash-cashout', user.id, 30, 10);
        const input = CashoutSchema.parse(payload);
        const res = await cashout(user.id, { slot: input.slot }, now);
        if (typeof ack === 'function') ack({ ok: true, data: res });
      } catch (err) {
        fail(ack, err);
      }
    });
  });
}

export function register(io: NovaIO) {
  registerCrashHandlers(io);
  if (g.__novaCrash) return; // already running in this process
  const controller = new CrashController({ emit: (event, data) => emitToRoom(CRASH_ROOM, event, data) });
  const lock = new LeaderLock(redis, {
    onElected: () => controller.start(),
    onLost: () => controller.stop(),
  });
  g.__novaCrash = { lock, controller };
  lock.start();
  const release = () => void lock.stop();
  process.once('SIGINT', release);
  process.once('SIGTERM', release);
}
