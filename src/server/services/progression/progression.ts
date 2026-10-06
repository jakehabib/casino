import { type Tx } from '@/server/db';
import { levelFromLifetimeXp, xpForWager, LEVEL_MILESTONES } from '@/lib/levels';
import type { PostCommit } from '@/server/realtime/events';
import { toNum } from '@/lib/money';

/**
 * Award XP for an accepted wager. Level is derived from lifetime XP so it can
 * never drift. Level-ups emit a realtime event + notification after commit.
 */
export async function awardWagerXp(tx: Tx, userId: string, wager: bigint, post?: PostCommit) {
  const gained = xpForWager(wager);
  if (gained <= 0n) return null;
  const rows = await tx.$queryRaw<{ lifetimeXp: bigint; level: number }[]>`
    UPDATE "User" SET "lifetimeXp" = "lifetimeXp" + ${gained} WHERE id = ${userId}
    RETURNING "lifetimeXp", level`;
  const { lifetimeXp, level: prevLevel } = rows[0];
  const { level, xpIntoLevel } = levelFromLifetimeXp(toNum(lifetimeXp));
  await tx.user.update({ where: { id: userId }, data: { level, xp: BigInt(xpIntoLevel) } });
  await tx.playerLevel.upsert({
    where: { userId },
    create: { userId, level, xp: BigInt(xpIntoLevel), lifetimeXp },
    update: { level, xp: BigInt(xpIntoLevel), lifetimeXp },
  });
  if (level > prevLevel) {
    const milestone = LEVEL_MILESTONES.filter((m) => m > prevLevel && m <= level);
    await tx.notification.create({
      data: {
        userId,
        type: 'LEVEL_UP',
        title: `Level ${level} reached`,
        body: milestone.length
          ? `You unlocked a level ${milestone[milestone.length - 1]} milestone reward. Claim it in Rewards.`
          : 'Keep playing to climb further.',
        link: milestone.length ? '/rewards' : '/profile',
      },
    });
    post?.user(userId, 'level:up', { level, previous: prevLevel, milestone: milestone.length > 0 });
    post?.user(userId, 'notification:new', {});
  }
  post?.user(userId, 'xp:update', { level, xpIntoLevel, lifetimeXp: toNum(lifetimeXp) });
  return { level, prevLevel, gained };
}
