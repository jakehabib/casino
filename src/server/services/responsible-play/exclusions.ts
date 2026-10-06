import type { SelfExclusion, SelfExclusionType } from '@prisma/client';
import { prisma, type Tx } from '@/server/db';
import { AppError } from '@/lib/errors';

export type ExclusionKind = 'COOLDOWN' | 'SELF_EXCLUSION';

export const EXCLUSION_OPTIONS: Record<
  SelfExclusionType,
  { label: string; kind: ExclusionKind; durationMs?: number; months?: number; userSelectable: boolean }
> = {
  COOLDOWN_24H: { label: '24-hour break', kind: 'COOLDOWN', durationMs: 24 * 3600_000, userSelectable: true },
  COOLDOWN_72H: { label: '72-hour break', kind: 'COOLDOWN', durationMs: 72 * 3600_000, userSelectable: true },
  LOCK_1W: { label: '1-week lock', kind: 'COOLDOWN', durationMs: 7 * 24 * 3600_000, userSelectable: true },
  EXCLUSION_1M: { label: '1-month self-exclusion', kind: 'SELF_EXCLUSION', months: 1, userSelectable: true },
  EXCLUSION_3M: { label: '3-month self-exclusion', kind: 'SELF_EXCLUSION', months: 3, userSelectable: true },
  EXCLUSION_6M: { label: '6-month self-exclusion', kind: 'SELF_EXCLUSION', months: 6, userSelectable: true },
  EXCLUSION_1Y: { label: '1-year self-exclusion', kind: 'SELF_EXCLUSION', months: 12, userSelectable: true },
  EXCLUSION_INDEFINITE: { label: 'Indefinite self-exclusion', kind: 'SELF_EXCLUSION', userSelectable: true },
};

/** Minimum wait between an indefinite-exclusion reinstatement request and approval. */
export const REINSTATEMENT_WAIT_MS = 7 * 24 * 3600_000;

export function computeEndsAt(type: SelfExclusionType, start: Date): Date | null {
  const opt = EXCLUSION_OPTIONS[type];
  if (opt.durationMs) return new Date(start.getTime() + opt.durationMs);
  if (opt.months) {
    const d = new Date(start.getTime());
    const day = d.getUTCDate();
    d.setUTCMonth(d.getUTCMonth() + opt.months);
    // Clamp month overflow (e.g. Jan 31 + 1 month → Feb 28/29)
    if (d.getUTCDate() < day) d.setUTCDate(0);
    return d;
  }
  return null; // indefinite
}

export function exclusionKind(type: SelfExclusionType): ExclusionKind {
  return EXCLUSION_OPTIONS[type].kind;
}

function isActiveAt(e: SelfExclusion, now: Date) {
  if (e.status === 'EXPIRED' || e.status === 'REINSTATED') return false;
  if (e.startsAt > now) return false;
  return e.endsAt === null || e.endsAt > now;
}

/**
 * Returns the strongest active restriction (latest end; indefinite wins;
 * self-exclusion outranks cooldown at equal end). Expired rows are lazily
 * marked EXPIRED so status survives restarts without a scheduler.
 */
export async function getActiveExclusion(db: Tx | typeof prisma, userId: string, now = new Date()) {
  const rows = await db.selfExclusion.findMany({
    where: { userId, status: { in: ['ACTIVE', 'REINSTATEMENT_REQUESTED'] } },
    orderBy: { createdAt: 'desc' },
  });
  const expired = rows.filter((r) => r.endsAt !== null && r.endsAt <= now);
  if (expired.length) {
    await db.selfExclusion.updateMany({
      where: { id: { in: expired.map((r) => r.id) } },
      data: { status: 'EXPIRED' },
    });
  }
  const active = rows.filter((r) => isActiveAt(r, now));
  if (!active.length) return null;
  active.sort((a, b) => {
    const ea = a.endsAt?.getTime() ?? Infinity;
    const eb = b.endsAt?.getTime() ?? Infinity;
    if (eb !== ea) return eb - ea;
    return exclusionKind(a.type) === 'SELF_EXCLUSION' ? -1 : 1;
  });
  return active[0];
}

export function serializeExclusion(e: SelfExclusion) {
  return {
    id: e.id,
    type: e.type,
    label: EXCLUSION_OPTIONS[e.type].label,
    kind: exclusionKind(e.type),
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt?.toISOString() ?? null,
    status: e.status,
    reinstatementRequestedAt: e.reinstatementRequestedAt?.toISOString() ?? null,
  };
}

/**
 * Activate a break / lock / self-exclusion. Cannot be cancelled or shortened
 * by the user. A request that would not extend an existing restriction is
 * idempotent and returns the existing one.
 */
export async function createExclusion(userId: string, type: SelfExclusionType, now = new Date()) {
  if (!EXCLUSION_OPTIONS[type]?.userSelectable) throw new AppError('VALIDATION', 'Unsupported option');
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const endsAt = computeEndsAt(type, now);
    const current = await getActiveExclusion(tx, userId, now);
    if (current) {
      const curEnd = current.endsAt?.getTime() ?? Infinity;
      const newEnd = endsAt?.getTime() ?? Infinity;
      if (newEnd <= curEnd) {
        return { exclusion: current, created: false };
      }
    }
    const exclusion = await tx.selfExclusion.create({
      data: { userId, type, startsAt: now, endsAt, status: 'ACTIVE' },
    });
    await tx.notification.create({
      data: {
        userId,
        type: 'LIMIT',
        title: EXCLUSION_OPTIONS[type].label + ' started',
        body: endsAt
          ? `Casino play is disabled until ${endsAt.toUTCString()}.`
          : 'Casino play is disabled indefinitely. Contact support to request a review.',
        link: '/responsible-play',
      },
    });
    return { exclusion, created: true };
  });
}

/** Indefinite exclusions only: the user may request a reinstatement review. */
export async function requestReinstatement(userId: string) {
  const ex = await prisma.selfExclusion.findFirst({
    where: { userId, type: 'EXCLUSION_INDEFINITE', status: 'ACTIVE' },
  });
  if (!ex) throw new AppError('NOT_ELIGIBLE', 'No indefinite self-exclusion to review.');
  return prisma.selfExclusion.update({
    where: { id: ex.id },
    data: { status: 'REINSTATEMENT_REQUESTED', reinstatementRequestedAt: new Date() },
  });
}
