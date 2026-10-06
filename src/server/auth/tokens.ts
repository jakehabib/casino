import { createHash } from 'node:crypto';
import { prisma } from '@/server/db';
import type { Role, User, UserStatus } from '@prisma/client';

/**
 * Session token resolution, free of Next.js request APIs so it can be used by
 * both route handlers and the Socket.IO server.
 */
export const SESSION_COOKIE = 'nova_session';

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type SessionUser = Pick<
  User,
  'id' | 'username' | 'displayName' | 'email' | 'avatarUrl' | 'role' | 'status' | 'level' | 'privacy' | 'createdAt'
> & { suspendedUntil: Date | null };

/** Resolve a raw session token (cookie value) to a user. Shared by HTTP + sockets. */
export async function userFromToken(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token || token.length > 200) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          email: true,
          avatarUrl: true,
          role: true,
          status: true,
          level: true,
          privacy: true,
          createdAt: true,
          suspendedUntil: true,
        },
      },
    },
  });
  if (!session || session.expiresAt < new Date()) return null;
  // Touch at most once a minute to keep writes cheap.
  if (Date.now() - session.lastUsedAt.getTime() > 60_000) {
    await prisma.$transaction([
      prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }),
      prisma.user.update({ where: { id: session.userId }, data: { lastSeenAt: new Date() } }),
    ]).catch(() => undefined);
  }
  return session.user;
}

export const ROLE_RANK: Record<Role, number> = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 };
export function hasRole(role: Role, min: Role) {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}
export function isBanned(status: UserStatus) {
  return status === 'BANNED';
}
