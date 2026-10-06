import { prisma, isUniqueViolation } from '@/server/db';
import { AppError } from '@/lib/errors';
import { getSetting } from '@/server/services/settings/settings-service';
import { applyLedgerEntry, lockWallet } from '@/server/services/wallet/wallet-service';
import { getActiveExclusion } from '@/server/services/responsible-play/exclusions';
import { PostCommit } from '@/server/realtime/events';
import { LEVEL_MILESTONES, milestoneReward } from '@/lib/levels';
import { toNum } from '@/lib/money';

/**
 * Rewards: Daily Credits, Emergency Refill, Weekly Bonus, Level milestones.
 *
 * Duplicate claims are impossible: each claim has a deterministic periodKey
 * with a unique (userId, type, periodKey) constraint, and the ledger entry
 * uses the same key for idempotency. All inside one transaction.
 */
export type RewardType = 'DAILY' | 'REFILL' | 'WEEKLY' | 'LEVEL_UP';

function weekKey(d: Date) {
  // ISO week key, UTC.
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function weekStart(d: Date) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() - (day - 1));
  return t;
}

export async function getRewardStatus(userId: string, now = new Date()) {
  const cfg = await getSetting('rewards');
  const [wallet, lastDaily, lastRefill, weeklyClaim, user, levelClaims, exclusion, weekWagered] = await Promise.all([
    prisma.wallet.findUniqueOrThrow({ where: { userId } }),
    prisma.rewardClaim.findFirst({ where: { userId, type: 'DAILY' }, orderBy: { createdAt: 'desc' } }),
    prisma.rewardClaim.findFirst({ where: { userId, type: 'REFILL' }, orderBy: { createdAt: 'desc' } }),
    prisma.rewardClaim.findUnique({ where: { userId_type_periodKey: { userId, type: 'WEEKLY', periodKey: weekKey(now) } } }),
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { level: true } }),
    prisma.rewardClaim.findMany({ where: { userId, type: 'LEVEL_UP' }, select: { periodKey: true } }),
    getActiveExclusion(prisma, userId, now),
    prisma.walletTransaction.aggregate({
      where: { userId, type: 'BET', createdAt: { gte: weekStart(now) } },
      _sum: { amount: true },
    }),
  ]);

  const dailyNext = lastDaily ? new Date(lastDaily.createdAt.getTime() + cfg.dailyCooldownHours * 3600_000) : now;
  const refillNext = lastRefill ? new Date(lastRefill.createdAt.getTime() + cfg.refillCooldownMinutes * 60_000) : now;
  const balance = toNum(wallet.balance);
  const wageredThisWeek = -toNum(weekWagered._sum.amount ?? 0n);
  const claimedLevels = new Set(levelClaims.map((c) => c.periodKey));
  const excluded = !!exclusion;

  return {
    daily: {
      amount: cfg.dailyAmount,
      available: dailyNext <= now,
      nextAt: dailyNext.toISOString(),
    },
    refill: {
      amount: cfg.refillAmount,
      threshold: cfg.refillThreshold,
      belowThreshold: balance < cfg.refillThreshold,
      available: balance < cfg.refillThreshold && refillNext <= now,
      nextAt: refillNext.toISOString(),
    },
    weekly: {
      amount: cfg.weeklyAmount,
      minWagered: cfg.weeklyMinWagered,
      wageredThisWeek,
      claimed: !!weeklyClaim,
      // Wagering-dependent reward: unavailable during cooldown/self-exclusion.
      available: !weeklyClaim && wageredThisWeek >= cfg.weeklyMinWagered && !excluded,
      blockedByExclusion: excluded,
    },
    levels: LEVEL_MILESTONES.map((lvl) => ({
      level: lvl,
      amount: milestoneReward(lvl),
      reached: user.level >= lvl,
      claimed: claimedLevels.has(String(lvl)),
      available: user.level >= lvl && !claimedLevels.has(String(lvl)) && !excluded,
    })),
  };
}

export async function claimReward(userId: string, type: RewardType, opts: { level?: number } = {}, now = new Date()) {
  const cfg = await getSetting('rewards');
  const post = new PostCommit();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const balance = await lockWallet(tx, userId);
      let amount: number;
      let periodKey: string;

      if (type === 'DAILY') {
        const last = await tx.rewardClaim.findFirst({ where: { userId, type }, orderBy: { createdAt: 'desc' } });
        if (last && last.createdAt.getTime() + cfg.dailyCooldownHours * 3600_000 > now.getTime()) {
          throw new AppError('ALREADY_CLAIMED', 'Your daily Credits are not ready yet.', {
            nextAt: new Date(last.createdAt.getTime() + cfg.dailyCooldownHours * 3600_000).toISOString(),
          });
        }
        amount = cfg.dailyAmount;
        // Window index makes the key deterministic for the cooldown period.
        periodKey = `${Math.floor(now.getTime() / (cfg.dailyCooldownHours * 3600_000))}`;
        if (last && last.periodKey === periodKey) throw new AppError('ALREADY_CLAIMED');
      } else if (type === 'REFILL') {
        if (balance >= BigInt(cfg.refillThreshold)) {
          throw new AppError('NOT_ELIGIBLE', `Emergency refill is available when your balance is below ${cfg.refillThreshold.toLocaleString('en-US')} Credits.`);
        }
        const last = await tx.rewardClaim.findFirst({ where: { userId, type }, orderBy: { createdAt: 'desc' } });
        if (last && last.createdAt.getTime() + cfg.refillCooldownMinutes * 60_000 > now.getTime()) {
          throw new AppError('ALREADY_CLAIMED', 'Emergency refill is cooling down.', {
            nextAt: new Date(last.createdAt.getTime() + cfg.refillCooldownMinutes * 60_000).toISOString(),
          });
        }
        amount = cfg.refillAmount;
        periodKey = `${Math.floor(now.getTime() / (cfg.refillCooldownMinutes * 60_000))}`;
      } else if (type === 'WEEKLY') {
        if (await getActiveExclusion(tx, userId, now)) throw new AppError('NOT_ELIGIBLE', 'Wagering rewards are paused during a break.');
        const wk = await tx.walletTransaction.aggregate({
          where: { userId, type: 'BET', createdAt: { gte: weekStart(now) } },
          _sum: { amount: true },
        });
        if (-(wk._sum.amount ?? 0n) < BigInt(cfg.weeklyMinWagered)) throw new AppError('NOT_ELIGIBLE', 'Keep playing to unlock this week’s bonus.');
        amount = cfg.weeklyAmount;
        periodKey = weekKey(now);
      } else {
        const level = opts.level ?? 0;
        if (!LEVEL_MILESTONES.includes(level as (typeof LEVEL_MILESTONES)[number])) throw new AppError('VALIDATION', 'Unknown milestone');
        if (await getActiveExclusion(tx, userId, now)) throw new AppError('NOT_ELIGIBLE', 'Wagering rewards are paused during a break.');
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { level: true } });
        if (user.level < level) throw new AppError('NOT_ELIGIBLE', `Reach level ${level} to claim this reward.`);
        amount = milestoneReward(level);
        periodKey = String(level);
      }

      if (amount <= 0) throw new AppError('NOT_ELIGIBLE', 'This reward is currently disabled.');
      const claim = await tx.rewardClaim.create({ data: { userId, type, amount: BigInt(amount), periodKey } });
      const ledger = await applyLedgerEntry(
        tx,
        {
          userId,
          type: 'FREE_CREDIT_CLAIM',
          amount: BigInt(amount),
          referenceType: 'REWARD_CLAIM',
          referenceId: claim.id,
          idempotencyKey: `reward:${type}:${periodKey}`,
          metadata: { reward: type },
        },
        post,
      );
      return { amount, balance: toNum(ledger.balance), claimId: claim.id };
    });
    await post.flush();
    return result;
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError('ALREADY_CLAIMED');
    throw err;
  }
}
