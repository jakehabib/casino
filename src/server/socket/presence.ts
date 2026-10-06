import { redis } from '@/server/redis';
import type { NovaIO } from './io';
import { GAMES } from '@/lib/games';

const GAME_IDS = new Set(GAMES.map((g) => g.id));

/**
 * Presence: unique signed-in users + guests connected to this node, and
 * per-game viewer counts (sockets report which game page they are on).
 */
export function registerPresence(io: NovaIO) {
  const compute = () => {
    const users = new Set<string>();
    let guests = 0;
    const byGame: Record<string, Set<string>> = {};
    for (const [, s] of io.of('/').sockets) {
      const key = s.data.user?.id ?? s.data.guestId;
      if (s.data.user) users.add(s.data.user.id);
      else guests++;
      if (s.data.gameId) (byGame[s.data.gameId] ??= new Set()).add(key);
    }
    return {
      online: users.size + guests,
      users: users.size,
      games: Object.fromEntries(Object.entries(byGame).map(([k, v]) => [k, v.size])),
    };
  };
  let last = '';
  const tick = async () => {
    const p = compute();
    await redis.set('presence:online', String(p.online), 'EX', 30).catch(() => undefined);
    const sig = JSON.stringify(p);
    if (sig !== last) {
      last = sig;
      io.emit('presence', p);
    }
  };
  io.on('connection', (socket) => {
    socket.emit('presence', compute());
    socket.on('presence:get', (ack?: (p: unknown) => void) => typeof ack === 'function' && ack(compute()));
    socket.on('presence:game', (gameId: unknown) => {
      socket.data.gameId = typeof gameId === 'string' && GAME_IDS.has(gameId) ? gameId : undefined;
    });
  });
  setInterval(() => void tick(), 3_000).unref();
}
