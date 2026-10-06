'use client';
import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/** Shared Socket.IO client (one connection per tab). */
export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    });
  }
  return socket;
}

/** Reconnect so the server re-reads the session cookie (after login/logout). */
export function resetSocket() {
  if (socket) {
    socket.disconnect();
    socket.connect();
  }
}

export function emitAck<T>(event: string, payload: unknown, timeoutMs = 8000): Promise<T> {
  const s = getSocket();
  return new Promise((resolve, reject) => {
    s.timeout(timeoutMs).emit(event, payload, (err: Error | null, res: { ok: boolean; data?: T; error?: { code: string; message: string; details?: unknown } }) => {
      if (err) return reject(Object.assign(new Error('Connection lost — reconnecting'), { code: 'TIMEOUT' }));
      if (!res?.ok) return reject(Object.assign(new Error(res?.error?.message ?? 'Request failed'), { code: res?.error?.code ?? 'INTERNAL', details: res?.error?.details }));
      resolve(res.data as T);
    });
  });
}
