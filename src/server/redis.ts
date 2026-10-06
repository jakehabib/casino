import { Redis } from 'ioredis';

const g = globalThis as unknown as { __novaRedis?: Redis; __novaRedisSub?: Redis };

function make(): Redis {
  const client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    enableOfflineQueue: true,
    lazyConnect: false,
  });
  client.on('error', () => {
    /* surfaced via health checks + logger at call sites */
  });
  return client;
}

export const redis: Redis = g.__novaRedis ?? make();
g.__novaRedis = redis;

/** Dedicated subscriber connection (a subscribed connection cannot issue commands). */
export function redisSubscriber(): Redis {
  if (!g.__novaRedisSub) g.__novaRedisSub = make();
  return g.__novaRedisSub;
}
