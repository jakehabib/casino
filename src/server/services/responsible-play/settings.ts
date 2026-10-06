import type { LimitType, ResponsiblePlaySettings } from '@prisma/client';
import { prisma, type Tx } from '@/server/db';
import { AppError } from '@/lib/errors';
import { getSetting } from '@/server/services/settings/settings-service';
import { isValidTimeZone, localDateAsUtcDate } from '@/lib/time';
import { toNum } from '@/lib/money';

type Db = Tx | typeof prisma;

const FIELD: Record<LimitType, 'dailyWagerLimit' | 'dailyLossLimit'> = {
  DAILY_WAGER: 'dailyWagerLimit',
  DAILY_LOSS: 'dailyLossLimit',
};

async function ensureSettings(db: Db, userId: string): Promise<ResponsiblePlaySettings> {
  const s = await db.responsiblePlaySettings.findUnique({ where: { userId } });
  if (s) return s;
  return db.responsiblePlaySettings.upsert({ where: { userId }, create: { userId }, update: {} });
}

/**
 * Returns settings with any due pending limit changes applied. Activation is
 * lazy (on read) and transactional, so it is restart-safe and needs no cron.
 */
export async function getEffectiveSettings(db: Db, userId: string, now = new Date()) {
  let settings = await ensureSettings(db, userId);
  const due = await db.responsiblePlayLimitChange.findMany({
    where: { userId, status: 'PENDING', effectiveAt: { lte: now } },
    orderBy: { effectiveAt: 'asc' },
  });
  for (const change of due) {
    const claimed = await db.responsiblePlayLimitChange.updateMany({
      where: { id: change.id, status: 'PENDING' },
      data: { status: 'APPLIED', resolvedAt: now },
    });
    if (claimed.count === 1) {
      settings = await db.responsiblePlaySettings.update({
        where: { userId },
        data: { [FIELD[change.limitType]]: change.newValue },
      });
    }
  }
  return settings;
}

/** "More restrictive" = lower limit, or setting a limit where none existed. */
export function isMoreRestrictive(oldValue: bigint | null, newValue: bigint | null): boolean {
  if (newValue === null) return false; // removing a limit is never more restrictive
  if (oldValue === null) return true;
  return newValue < oldValue;
}

/**
 * Request a limit change.
 *  • More restrictive → applied immediately (and supersedes any pending change).
 *  • Less restrictive → scheduled after the configured delay (default 24h).
 */
export async function requestLimitChange(userId: string, limitType: LimitType, newValue: bigint | null, now = new Date()) {
  if (newValue !== null && newValue <= 0n) throw new AppError('VALIDATION', 'Limit must be positive');
  if (newValue !== null && newValue > 10_000_000_000n) throw new AppError('VALIDATION', 'Limit too large');
  const { limitIncreaseDelayHours } = await getSetting('system');

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const settings = await getEffectiveSettings(tx, userId, now);
    const oldValue = settings[FIELD[limitType]];
    if (oldValue === newValue) {
      // Requesting the current value cancels a pending change of this type.
      await tx.responsiblePlayLimitChange.updateMany({
        where: { userId, limitType, status: 'PENDING' },
        data: { status: 'CANCELLED', resolvedAt: now },
      });
      return { applied: true, change: null };
    }
    await tx.responsiblePlayLimitChange.updateMany({
      where: { userId, limitType, status: 'PENDING' },
      data: { status: 'SUPERSEDED', resolvedAt: now },
    });
    if (isMoreRestrictive(oldValue, newValue)) {
      const change = await tx.responsiblePlayLimitChange.create({
        data: { userId, limitType, oldValue, newValue, effectiveAt: now, status: 'APPLIED', resolvedAt: now },
      });
      await tx.responsiblePlaySettings.update({ where: { userId }, data: { [FIELD[limitType]]: newValue } });
      return { applied: true, change };
    }
    const change = await tx.responsiblePlayLimitChange.create({
      data: {
        userId,
        limitType,
        oldValue,
        newValue,
        effectiveAt: new Date(now.getTime() + limitIncreaseDelayHours * 3600_000),
        status: 'PENDING',
      },
    });
    return { applied: false, change };
  });
}

export async function cancelPendingChange(userId: string, changeId: string, now = new Date()) {
  const res = await prisma.responsiblePlayLimitChange.updateMany({
    where: { id: changeId, userId, status: 'PENDING', effectiveAt: { gt: now } },
    data: { status: 'CANCELLED', resolvedAt: now },
  });
  if (res.count !== 1) throw new AppError('ACTION_UNAVAILABLE', 'That change can no longer be cancelled.');
}

/**
 * Change the responsible-play timezone (which defines "today" for limits).
 *
 * Hardening: switching to a timezone where the local date differs must not
 * hand the user a fresh, empty "today" (which would be a trivial way around a
 * daily limit). Today's totals are carried over to the new timezone's current
 * local date, keeping the more conservative figures, in the same transaction
 * (serialised with wagers via the wallet lock).
 */
export async function setTimezone(userId: string, timezone: string, now = new Date()) {
  if (!isValidTimeZone(timezone)) throw new AppError('VALIDATION', 'Unknown timezone');
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const settings = await getEffectiveSettings(tx, userId, now);
    if (settings.timezone === timezone) return;
    const oldDate = localDateAsUtcDate(settings.timezone, now);
    const newDate = localDateAsUtcDate(timezone, now);
    await tx.responsiblePlaySettings.update({ where: { userId }, data: { timezone } });
    if (oldDate.getTime() === newDate.getTime()) return;
    const [from, into] = await Promise.all([
      tx.dailyPlayAggregate.findUnique({ where: { userId_date: { userId, date: oldDate } } }),
      tx.dailyPlayAggregate.findUnique({ where: { userId_date: { userId, date: newDate } } }),
    ]);
    if (!from || (from.wagered === 0n && from.won === 0n)) return;
    const max = (a: bigint, b: bigint) => (a > b ? a : b);
    const wagered = max(from.wagered, into?.wagered ?? 0n);
    const lost = max(from.lost, into?.lost ?? 0n);
    const won = lost > 0n ? wagered - lost : max(from.won, into?.won ?? 0n);
    const data = { wagered, won, lost, net: won - wagered };
    await tx.dailyPlayAggregate.upsert({
      where: { userId_date: { userId, date: newDate } },
      create: { userId, date: newDate, ...data },
      update: data,
    });
  });
}

export function serializeLimitChange(c: {
  id: string;
  limitType: LimitType;
  oldValue: bigint | null;
  newValue: bigint | null;
  requestedAt: Date;
  effectiveAt: Date;
  status: string;
}) {
  return {
    id: c.id,
    limitType: c.limitType,
    oldValue: c.oldValue === null ? null : toNum(c.oldValue),
    newValue: c.newValue === null ? null : toNum(c.newValue),
    requestedAt: c.requestedAt.toISOString(),
    effectiveAt: c.effectiveAt.toISOString(),
    status: c.status,
  };
}
