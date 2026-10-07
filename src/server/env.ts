import { z } from 'zod';
import { normalizeAppUrl } from '@/lib/app-url';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z
    .string()
    .optional()
    .transform((v) => {
      const n = normalizeAppUrl(v);
      if (v && !n) console.warn(`[nova] WARNING: APP_URL "${v}" is not a valid web address; ignoring it.`);
      return n ?? 'http://localhost:3000';
    }),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  AUTH_SECRET: z.string().min(16).default('dev-only-insecure-secret-change-me'),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  ENABLE_DEV_TOOLS: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  LOG_LEVEL: z.string().default('info'),
  /** Set when behind exactly one trusted reverse proxy that appends X-Forwarded-For. */
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (!cached) {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid environment: ${parsed.error.message}`);
    }
    if (parsed.data.NODE_ENV === 'production' && parsed.data.AUTH_SECRET.startsWith('dev-only')) {
      throw new Error('AUTH_SECRET must be set in production');
    }
    cached = parsed.data;
  }
  return cached;
}

/** Dev tooling is hard-disabled in production regardless of flags. */
export function devToolsEnabled(): boolean {
  const e = env();
  return e.NODE_ENV !== 'production' && e.ENABLE_DEV_TOOLS === true;
}

export const isProd = () => env().NODE_ENV === 'production';
