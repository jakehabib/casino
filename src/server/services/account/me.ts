import { prisma } from '@/server/db';
import { levelFromLifetimeXp, tierForLevel } from '@/lib/levels';
import { toNum } from '@/lib/money';
import { getPlayStatus } from '@/server/services/responsible-play/eligibility';
import type { SessionUser } from '@/server/auth/tokens';

export async function getMe(user: SessionUser) {
  const [wallet, full, unread, play] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId: user.id } }),
    prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { lifetimeXp: true, level: true } }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    getPlayStatus(user.id),
  ]);
  const prog = levelFromLifetimeXp(toNum(full.lifetimeXp));
  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role,
      status: user.status,
      privacy: user.privacy,
      createdAt: user.createdAt.toISOString(),
    },
    balance: toNum(wallet?.balance ?? 0n),
    level: {
      level: prog.level,
      tier: tierForLevel(prog.level),
      xpIntoLevel: prog.xpIntoLevel,
      xpForNext: prog.xpForNext,
      lifetimeXp: toNum(full.lifetimeXp),
    },
    unreadNotifications: unread,
    play,
  };
}

export type MePayload = Awaited<ReturnType<typeof getMe>>;
