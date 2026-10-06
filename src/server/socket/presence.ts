import { randomUUID } from 'node:crypto';
import { redis } from '@/server/redis';
import type { NovaIO } from './io';
import { GAMES } from '@/lib/games';
import { summarizePresence, type LocalView, type PresencePayload } from './presence-math';

const GAME_IDS = new Set(GAMES.map((g) => g.id));

/** Every node writes its local view here; any node can aggregate the cluster. */
const NODES_KEY = 'presence:nodes';
const NODE_ID = randomUUID();
const TICK_MS = 3_000;
/** A node that has not reported for this long is gone (crashed / restarted). */
const STALE_MS = 10_000;

/**
 * Presence: unique signed-in users + guests, and per-game viewer counts
 * (sockets report which game page they are on).
 *
 * Counts are CLUSTER-wide: each node publishes its local sockets to a Redis
 * hash every few seconds and broadcasts the union of all live nodes, so every
 * server shows the same number (the crash loop already assumes several nodes).
 * If Redis is unavailable the node falls back to its local view.
 */
export function registerPresence(io: NovaIO) {
  const local = (): LocalView => {
    const users = new Set<string>();
    const guests = new Set<string>();
    const byGame: Record<string, Set<string>> = {};
    for (const [, s] of io.of('/').sockets) {
      const key = s.data.user?.id ?? s.data.guestId;
      if (s.data.user) users.add(s.data.user.id);
      else guests.add(s.data.guestId);
      if (s.data.gameId) (byGame[s.data.gameId] ??= new Set()).add(key);
    }
    return {
      at: Date.now(),
      users: [...users],
      guests: [...guests],
      games: Object.fromEntries(Object.entries(byGame).map(([k, v]) => [k, [...v]])),
    };
  };

  const summarize = summarizePresence;

  let current: PresencePayload | null = null;
  const snapshot = () => current ?? summarize([local()]);

  const aggregate = async (): Promise<PresencePayload> => {
    const mine = local();
    try {
      await redis.hset(NODES_KEY, NODE_ID, JSON.stringify(mine));
      const all = await redis.hgetall(NODES_KEY);
      const views: LocalView[] = [mine];
      const stale: string[] = [];
      for (const [id, raw] of Object.entries(all)) {
        if (id === NODE_ID) continue;
        try {
          const v = JSON.parse(raw) as LocalView;
          if (mine.at - v.at > STALE_MS) stale.push(id);
          else views.push(v);
        } catch {
          stale.push(id);
        }
      }
      if (stale.length) await redis.hdel(NODES_KEY, ...stale);
      return summarize(views);
    } catch {
      return summarize([mine]);
    }
  };

  let last = '';
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      const p = await aggregate();
      current = p;
      await redis.set('presence:online', String(p.online), 'EX', 30).catch(() => undefined);
      const sig = JSON.stringify(p);
      if (sig !== last) {
        last = sig;
        io.emit('presence', p);
      }
    } finally {
      busy = false;
    }
  };

  io.on('connection', (socket) => {
    socket.emit('presence', snapshot());
    socket.on('presence:get', (ack?: (p: unknown) => void) => typeof ack === 'function' && ack(snapshot()));
    socket.on('presence:game', (gameId: unknown) => {
      socket.data.gameId = typeof gameId === 'string' && GAME_IDS.has(gameId) ? gameId : undefined;
    });
  });
  void tick();
  setInterval(() => void tick(), TICK_MS).unref();
  const leave = () => void redis.hdel(NODES_KEY, NODE_ID).catch(() => undefined);
  process.once('SIGINT', leave);
  process.once('SIGTERM', leave);
}
