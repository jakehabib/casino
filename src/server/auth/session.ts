import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/server/db';
import { env } from '@/server/env';
import { SESSION_COOKIE, hashToken, userFromToken, type SessionUser } from './tokens';
export { SESSION_COOKIE, hashToken, userFromToken, hasRole, ROLE_RANK, isBanned, type SessionUser } from './tokens';


export function cookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: env().NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSec,
  };
}

export async function createSession(userId: string, meta: { ip?: string | null; userAgent?: string | null }) {
  const token = randomBytes(32).toString('base64url');
  const ttlDays = env().SESSION_TTL_DAYS;
  const expiresAt = new Date(Date.now() + ttlDays * 86400_000);
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      ip: meta.ip?.slice(0, 64) ?? null,
      userAgent: meta.userAgent?.slice(0, 256) ?? null,
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions(ttlDays * 86400));
  return { expiresAt };
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.set(SESSION_COOKIE, '', cookieOptions(0));
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return userFromToken(jar.get(SESSION_COOKIE)?.value);
}

