import type { Server as IOServer, Socket } from 'socket.io';
import type { SessionUser } from '@/server/auth/tokens';

export interface SocketData {
  user: SessionUser | null;
  guestId: string;
  /** Game page the socket is currently viewing (for per-game player counts). */
  gameId?: string;
}

export type NovaSocket = Socket<Record<string, (...args: any[]) => void>, Record<string, (...args: any[]) => void>, Record<string, never>, SocketData>;
export type NovaIO = IOServer<Record<string, (...args: any[]) => void>, Record<string, (...args: any[]) => void>, Record<string, never>, SocketData>;

const g = globalThis as unknown as { __novaIO?: NovaIO };

export function setIO(io: NovaIO) {
  g.__novaIO = io;
}
export function getIO(): NovaIO | undefined {
  return g.__novaIO;
}

export const userRoom = (userId: string) => `user:${userId}`;

/** Standard ack envelope for socket RPCs. */
export type Ack<T = unknown> = (res: { ok: true; data: T } | { ok: false; error: { code: string; message: string; details?: unknown } }) => void;
