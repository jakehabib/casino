import { NextResponse, type NextRequest } from 'next/server';
import { z, type ZodType } from 'zod';
import { AppError, type ApiErrorBody } from '@/lib/errors';
import { getSessionUser, hasRole, type SessionUser } from '@/server/auth/session';
import { rateLimit } from '@/server/rate-limit';
import { logger } from '@/server/logger';
import { env, devToolsEnabled } from '@/server/env';
import type { Role } from '@prisma/client';

/**
 * Route handler wrapper:
 *  • CSRF: state-changing requests must come from our own Origin and send JSON
 *    (cookies are SameSite=Lax + HttpOnly).
 *  • Auth + role checks.
 *  • Zod body/query validation.
 *  • Rate limiting.
 *  • Uniform error envelope — raw errors are never exposed.
 */
interface Opts<B extends ZodType | undefined, Q extends ZodType | undefined> {
  auth?: boolean | Role;
  body?: B;
  query?: Q;
  rateLimit?: { bucket: string; limit: number; windowSec: number };
  /** Development-only endpoint: responds 404 before any other processing unless dev tools are enabled. */
  devOnly?: boolean;
  /** Allow banned/suspended users (e.g. viewing history, RP page). Default true for reads. */
}

type Ctx<B, Q, P> = {
  req: NextRequest;
  user: SessionUser;
  body: B;
  query: Q;
  params: P;
  ip: string | null;
};
type PublicCtx<B, Q, P> = Omit<Ctx<B, Q, P>, 'user'> & { user: SessionUser | null };

/** Set by server.ts from the socket's remote address (any client-sent value is overwritten). */
export const PEER_IP_HEADER = 'x-nova-peer-ip';

/**
 * Client IP for rate limiting / audit. The left-most X-Forwarded-For entry is
 * client-controlled, so in production it is never trusted: we use the entry
 * appended by our own reverse proxy (right-most) when TRUST_PROXY is set, or
 * the TCP peer address stamped by server.ts otherwise. Development keeps the
 * permissive behaviour so local test scripts can simulate distinct clients.
 */
function clientIp(req: NextRequest): string | null {
  const e = env();
  const xff = req.headers.get('x-forwarded-for');
  if (e.NODE_ENV !== 'production') {
    return xff?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || req.headers.get(PEER_IP_HEADER) || null;
  }
  if (e.TRUST_PROXY && xff) {
    const parts = xff.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return req.headers.get(PEER_IP_HEADER) || null;
}

function checkCsrf(req: NextRequest) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new AppError('FORBIDDEN', 'Bad origin');
    }
    const allowed = new Set([host, new URL(env().APP_URL).host]);
    if (!allowed.has(originHost)) throw new AppError('FORBIDDEN', 'Cross-site request blocked');
  } else if (env().NODE_ENV === 'production') {
    throw new AppError('FORBIDDEN', 'Missing origin');
  }
  const ct = req.headers.get('content-type') ?? '';
  if (req.headers.get('content-length') !== '0' && req.body && !ct.includes('application/json')) {
    throw new AppError('VALIDATION', 'Expected JSON');
  }
}

export function errorResponse(err: unknown): NextResponse<ApiErrorBody> {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status },
    );
  }
  if (err instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION',
          message: err.issues[0]?.message ?? 'Invalid input',
          details: { issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) },
        },
      },
      { status: 400 },
    );
  }
  logger.error({ err }, 'unhandled API error');
  return NextResponse.json({ error: { code: 'INTERNAL', message: 'Something went wrong' } }, { status: 500 });
}

async function parseBody(req: NextRequest, schema?: ZodType) {
  if (!schema) return undefined;
  let raw: unknown = {};
  const text = await req.text();
  if (text) {
    if (text.length > 64_000) throw new AppError('VALIDATION', 'Body too large');
    try {
      raw = JSON.parse(text);
    } catch {
      throw new AppError('VALIDATION', 'Invalid JSON');
    }
  }
  return schema.parse(raw);
}

function parseQuery(req: NextRequest, schema?: ZodType) {
  if (!schema) return undefined;
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
}

type Infer<T> = T extends ZodType ? z.infer<T> : undefined;

export function route<B extends ZodType | undefined = undefined, Q extends ZodType | undefined = undefined, P = Record<string, string>>(
  opts: Opts<B, Q> & { auth: true | Role },
  fn: (ctx: Ctx<Infer<B>, Infer<Q>, P>) => Promise<unknown>,
): (req: NextRequest, ctx: { params: Promise<P> }) => Promise<NextResponse>;
export function route<B extends ZodType | undefined = undefined, Q extends ZodType | undefined = undefined, P = Record<string, string>>(
  opts: Opts<B, Q> & { auth?: false },
  fn: (ctx: PublicCtx<Infer<B>, Infer<Q>, P>) => Promise<unknown>,
): (req: NextRequest, ctx: { params: Promise<P> }) => Promise<NextResponse>;
export function route(opts: Opts<ZodType | undefined, ZodType | undefined>, fn: (ctx: any) => Promise<unknown>) {
  return async (req: NextRequest, routeCtx: { params: Promise<Record<string, string>> }) => {
    try {
      if (opts.devOnly && !devToolsEnabled()) throw new AppError('NOT_FOUND');
      checkCsrf(req);
      const ip = clientIp(req);
      const user = await getSessionUser();
      if (opts.auth) {
        if (!user) throw new AppError('UNAUTHENTICATED');
        if (user.status === 'BANNED') throw new AppError('ACCOUNT_LOCKED', 'This account has been banned.');
        if (typeof opts.auth === 'string' && !hasRole(user.role, opts.auth)) throw new AppError('FORBIDDEN');
      }
      if (opts.rateLimit) {
        await rateLimit(opts.rateLimit.bucket, user?.id ?? ip ?? 'anon', opts.rateLimit.limit, opts.rateLimit.windowSec);
      }
      const body = await parseBody(req, opts.body);
      const query = parseQuery(req, opts.query);
      const params = routeCtx?.params ? await routeCtx.params : {};
      const result = await fn({ req, user, body, query, params, ip });
      if (result instanceof NextResponse) return result;
      return NextResponse.json(result ?? { ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/** Common schema for client-generated idempotency keys. */
export const RequestId = z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/);
