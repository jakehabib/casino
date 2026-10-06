import { prisma } from '@/server/db';
import { getEffectiveSettings, serializeLimitChange } from './settings';
import { getActiveExclusion, serializeExclusion, EXCLUSION_OPTIONS, REINSTATEMENT_WAIT_MS } from './exclusions';
import { getSetting } from '@/server/services/settings/settings-service';
import { getTodayAggregate } from './aggregates';
import { nextLocalMidnight } from '@/lib/time';
import { toNum } from '@/lib/money';

/** Everything the /responsible-play page needs. Private to the user. */
export async function getResponsiblePlaySummary(userId: string, now = new Date()) {
  const settings = await prisma.$transaction((tx) => getEffectiveSettings(tx, userId, now));
  const [today, exclusion, pending, history, system] = await Promise.all([
    getTodayAggregate(prisma, userId, settings.timezone, now),
    getActiveExclusion(prisma, userId, now),
    prisma.responsiblePlayLimitChange.findMany({
      where: { userId, status: 'PENDING' },
      orderBy: { effectiveAt: 'asc' },
    }),
    prisma.selfExclusion.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 10 }),
    getSetting('system'),
  ]);
  const wagerLimit = settings.dailyWagerLimit;
  const lossLimit = settings.dailyLossLimit;
  const lossToday = today.wagered - today.won > 0n ? today.wagered - today.won : 0n;
  return {
    serverNow: now.toISOString(),
    timezone: settings.timezone,
    rules: {
      limitIncreaseDelayHours: system.limitIncreaseDelayHours,
      reinstatementWaitDays: Math.round(REINSTATEMENT_WAIT_MS / 86_400_000),
    },
    resetsAt: nextLocalMidnight(settings.timezone, now).toISOString(),
    today: {
      wagered: toNum(today.wagered),
      won: toNum(today.won),
      net: toNum(today.net),
      loss: toNum(lossToday),
    },
    limits: {
      dailyWager: {
        limit: wagerLimit === null ? null : toNum(wagerLimit),
        remaining: wagerLimit === null ? null : Math.max(0, toNum(wagerLimit - today.wagered)),
        pending: pending.filter((p) => p.limitType === 'DAILY_WAGER').map(serializeLimitChange)[0] ?? null,
      },
      dailyLoss: {
        limit: lossLimit === null ? null : toNum(lossLimit),
        remaining: lossLimit === null ? null : Math.max(0, toNum(lossLimit - lossToday)),
        pending: pending.filter((p) => p.limitType === 'DAILY_LOSS').map(serializeLimitChange)[0] ?? null,
      },
    },
    exclusion: exclusion ? serializeExclusion(exclusion) : null,
    history: history.map(serializeExclusion),
    options: Object.entries(EXCLUSION_OPTIONS).map(([type, o]) => ({ type, label: o.label, kind: o.kind })),
  };
}
