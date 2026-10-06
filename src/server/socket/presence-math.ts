/** One node's view of its own sockets (published to Redis by presence.ts). PURE. */
export interface LocalView {
  at: number;
  users: string[];
  guests: string[];
  games: Record<string, string[]>;
}

export interface PresencePayload {
  online: number;
  users: number;
  games: Record<string, number>;
}

/** Cluster totals: a user connected to several nodes (tabs) counts once. */
export function summarizePresence(views: LocalView[]): PresencePayload {
  const users = new Set<string>();
  let guests = 0;
  const games: Record<string, Set<string>> = {};
  for (const v of views) {
    for (const u of v.users) users.add(u);
    guests += v.guests.length;
    for (const [g, keys] of Object.entries(v.games)) for (const k of keys) (games[g] ??= new Set()).add(k);
  }
  return {
    online: users.size + guests,
    users: users.size,
    games: Object.fromEntries(Object.entries(games).map(([k, v]) => [k, v.size])),
  };
}
