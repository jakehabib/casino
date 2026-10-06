import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { logger } from '@/server/logger';

/**
 * Redis leader lock: exactly one process runs the crash loop. Others only
 * relay events (which travel over the Redis bus anyway) and serve RPCs.
 *
 *   acquire: SET key <id> NX PX 5000
 *   renew:   every 2s, PEXPIRE only if we still own the key (Lua CAS)
 *   lost:    renew fails → onLost() (stop the loop immediately)
 */
export const CRASH_LEADER_KEY = 'crash:leader';
const TTL_MS = 5_000;
const RENEW_MS = 2_000;

const RENEW_LUA = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end`;
const RELEASE_LUA = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

export class LeaderLock {
  readonly id = randomUUID();
  private leader = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly redis: Redis,
    private readonly hooks: { onElected: () => void; onLost: () => void },
    private readonly key = CRASH_LEADER_KEY,
  ) {}

  get isLeader() {
    return this.leader;
  }

  start() {
    void this.cycle();
    this.timer = setInterval(() => void this.cycle(), RENEW_MS);
    this.timer.unref?.();
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.leader) {
      this.leader = false;
      this.hooks.onLost();
      await this.redis.eval(RELEASE_LUA, 1, this.key, this.id).catch(() => undefined);
    }
  }

  private async cycle() {
    try {
      if (this.leader) {
        const ok = await this.redis.eval(RENEW_LUA, 1, this.key, this.id, String(TTL_MS));
        if (Number(ok) !== 1) this.lose('lease lost');
        return;
      }
      const got = await this.redis.set(this.key, this.id, 'PX', TTL_MS, 'NX');
      if (got === 'OK') {
        this.leader = true;
        logger.info({ id: this.id }, 'crash leader elected');
        this.hooks.onElected();
      }
    } catch (err) {
      // Cannot prove we still hold the lease → step down.
      if (this.leader) this.lose('redis unavailable');
      logger.warn({ err }, 'crash leader lock check failed');
    }
  }

  private lose(reason: string) {
    this.leader = false;
    logger.warn({ id: this.id, reason }, 'crash leadership lost');
    this.hooks.onLost();
  }
}
