import { redis } from '@/server/redis';
import { devToolsEnabled } from '@/server/env';
import { logger } from '@/server/logger';

/**
 * Development-only forced outcomes (dev panel). Every accessor is a no-op
 * unless devToolsEnabled() — which is hard-false in production — so these
 * hooks can never influence a production result.
 *
 * Keys are consumed once (GETDEL) so a forced result applies to exactly one
 * round. Forced rounds are flagged in their stored data (`forced: true`) and
 * are NOT verifiable against the fairness seeds by design.
 */
export type ForcedGame = 'blackjack' | 'baccarat' | 'roulette' | 'crash' | 'slots';

const key = (game: ForcedGame, userId: string | 'global') => `dev:force:${game}:${userId}`;

export async function setForcedOutcome(game: ForcedGame, userId: string | 'global', value: unknown, ttlSec = 600) {
  if (!devToolsEnabled()) throw new Error('Dev tools disabled');
  await redis.set(key(game, userId), JSON.stringify(value), 'EX', ttlSec);
}

export async function consumeForcedOutcome<T>(game: ForcedGame, userId: string | 'global'): Promise<T | null> {
  if (!devToolsEnabled()) return null;
  try {
    const raw = await redis.getdel(key(game, userId));
    if (!raw) return null;
    logger.warn({ game, userId }, 'DEV: consuming forced outcome');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function peekForcedOutcome<T>(game: ForcedGame, userId: string | 'global'): Promise<T | null> {
  if (!devToolsEnabled()) return null;
  const raw = await redis.get(key(game, userId)).catch(() => null);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function clearForcedOutcome(game: ForcedGame, userId: string | 'global') {
  if (!devToolsEnabled()) return;
  await redis.del(key(game, userId));
}
