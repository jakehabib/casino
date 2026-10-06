import { redis } from '@/server/redis';
import { AppError } from '@/lib/errors';
import { logger } from '@/server/logger';

/**
 * Fixed-window rate limiter backed by Redis. Fails open (logs) if Redis is
 * unavailable so a cache outage doesn't take the casino down — wallet safety
 * never depends on rate limiting.
 */
export async function rateLimit(bucket: string, id: string, limit: number, windowSec: number): Promise<void> {
  const key = `rl:${bucket}:${id}:${Math.floor(Date.now() / 1000 / windowSec)}`;
  try {
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, windowSec + 1);
    if (n > limit) throw new AppError('RATE_LIMITED', undefined, { retryAfterSec: windowSec });
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.warn({ err, bucket }, 'rate limiter unavailable');
  }
}
