import type { SelfExclusion } from '@prisma/client';
import { prisma, transaction } from '@/server/db';
import { AppError } from '@/lib/errors';
import { toNum } from '@/lib/money';
import { localDateAsUtcDate } from '@/lib/time';
import { PostCommit } from '@/server/realtime/events';
import { EXCLUSION_OPTIONS, REINSTATEMENT_WAIT_MS, exclusionKind } from '@/server/services/responsible-play/exclusions';
import { serializeLimitChange } from '@/server/services/responsible-play/settings';
import { type Actor, type AuditContext, cleanReason, requireRole, writeAudit } from './access';

/**
 * Admin view of a player's responsible-play state. STRICTLY READ-ONLY:
 * no admin can end, shorten or override a cooldown or self-exclusion. The
 * single exception is `processReinstatement` below (SUPER_ADMIN, indefinite
 * exclusions only, after the user requested review and the waiting period).
 *
 * These reads deliberately avoid the lazy-activation helpers used by the
 * player-facing service so that viewing a profile never mutates RP state.
 */

function isActiveAt(e: SelfExclusion, now: Date) {
  if (e.status === 'EXPIRED' || e.status === 'REINSTATED') return false;
  if (e.startsAt > now) return false;
  return e.endsAt === null || e.endsAt > now;
}

export function reinstatementEligibleAt(e: Pick<SelfExclusion, 'reinstatementRequestedAt'>): Date | null {
  return e.reinstatementRequestedAt ? new Date(e.reinstatementRequestedAt.getTime() + REINSTATEMENT_WAIT_MS) : null;
}

export function serializeAdminExclusion(e: SelfExclusion, now = new Date()) {
  const opt = EXCLUSION_OPTIONS[e.type];
  const active = isActiveAt(e, now);
  const eligibleAt = reinstatementEligibleAt(e);
  const reinstatable =
    e.type === 'EXCLUSION_INDEFINITE' && e.status === 'REINSTATEMENT_REQUESTED' && !!eligibleAt && eligibleAt <= now;
  return {
    id: e.id,
    type: e.type,
    label: opt.label,
    kind: exclusionKind(e.type),
    status: active ? e.status : e.status === 'REINSTATED' ? 'REINSTATED' : 'EXPIRED',
    active,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
    reinstatementRequestedAt: e.reinstatementRequestedAt?.toISOString() ?? null,
    reinstatementEligibleAt: eligibleAt?.toISOString() ?? null,
    reinstatedAt: e.reinstatedAt?.toISOString() ?? null,
    reinstatedById: e.reinstatedById,
    /** Time-limited restrictions can never be overridden by anyone. */
    overridable: e.type === 'EXCLUSION_INDEFINITE',
    reinstatable,
  };
}

export async function getUserResponsiblePlay(userId: string, now = new Date()) {
  const [settings, changes, exclusions] = await Promise.all([
    prisma.responsiblePlaySettings.findUnique({ where: { userId } }),
    prisma.responsiblePlayLimitChange.findMany({ where: { userId }, orderBy: { requestedAt: 'desc' }, take: 25 }),
    prisma.selfExclusion.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 25 }),
  ]);
  const tz = settings?.timezone ?? 'UTC';
  const today = await prisma.dailyPlayAggregate.findUnique({
    where: { userId_date: { userId, date: localDateAsUtcDate(tz, now) } },
  });
  // Pending changes that have reached their effective time are shown as due (applied on the player's next read).
  const pending = changes.filter((c) => c.status === 'PENDING');
  const effective = (type: 'DAILY_WAGER' | 'DAILY_LOSS', current: bigint | null | undefined) => {
    const due = pending.filter((p) => p.limitType === type && p.effectiveAt <= now).sort((a, b) => +b.effectiveAt - +a.effectiveAt)[0];
    const v = due ? due.newValue : (current ?? null);
    return v === null ? null : toNum(v);
  };
  const serialized = exclusions.map((e) => serializeAdminExclusion(e, now));
  const active = serialized
    .filter((e) => e.active)
    .sort((a, b) => (b.endsAt ? Date.parse(b.endsAt) : Infinity) - (a.endsAt ? Date.parse(a.endsAt) : Infinity))[0];
  return {
    timezone: tz,
    limits: {
      dailyWager: effective('DAILY_WAGER', settings?.dailyWagerLimit),
      dailyLoss: effective('DAILY_LOSS', settings?.dailyLossLimit),
    },
    today: {
      wagered: toNum(today?.wagered ?? 0n),
      won: toNum(today?.won ?? 0n),
      lost: toNum(today?.lost ?? 0n),
      net: toNum(today?.net ?? 0n),
    },
    pendingChanges: pending.filter((p) => p.effectiveAt > now).map(serializeLimitChange),
    limitHistory: changes.map(serializeLimitChange),
    activeExclusion: active ?? null,
    exclusions: serialized,
  };
}

export type AdminRpView = Awaited<ReturnType<typeof getUserResponsiblePlay>>;

/** Overview for the Responsible Play tab: active restrictions and reinstatement queue. */
export async function getResponsiblePlayOverview(actor: Actor, now = new Date()) {
  requireRole(actor, 'ADMIN');
  const live = await prisma.selfExclusion.findMany({
    where: {
      status: { in: ['ACTIVE', 'REINSTATEMENT_REQUESTED'] },
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
  });
  const [pendingLimitChanges, recentReinstated] = await Promise.all([
    prisma.responsiblePlayLimitChange.count({ where: { status: 'PENDING', effectiveAt: { gt: now } } }),
    prisma.selfExclusion.findMany({
      where: { status: 'REINSTATED' },
      orderBy: { reinstatedAt: 'desc' },
      take: 10,
      include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true } } },
    }),
  ]);
  const withUser = (e: (typeof live)[number]) => ({ ...serializeAdminExclusion(e, now), user: e.user });
  const rows = live.map(withUser);
  return {
    counts: {
      cooldowns: rows.filter((r) => r.kind === 'COOLDOWN').length,
      exclusions: rows.filter((r) => r.kind === 'SELF_EXCLUSION').length,
      reinstatementRequests: rows.filter((r) => r.status === 'REINSTATEMENT_REQUESTED').length,
      pendingLimitChanges,
    },
    requests: rows.filter((r) => r.status === 'REINSTATEMENT_REQUESTED'),
    active: rows.filter((r) => r.status === 'ACTIVE'),
    reinstated: recentReinstated.map(withUser),
    waitMs: REINSTATEMENT_WAIT_MS,
  };
}

/**
 * The ONLY way an exclusion can be lifted early. Rules:
 *  • actor must be SUPER_ADMIN;
 *  • exclusion must be EXCLUSION_INDEFINITE (time-limited ones cannot be overridden by anyone);
 *  • the user must have requested review (status REINSTATEMENT_REQUESTED);
 *  • the request must be older than REINSTATEMENT_WAIT_MS.
 */
export async function processReinstatement(
  actor: Actor,
  input: { exclusionId: string; reason: string },
  ctx: Omit<AuditContext, 'reason'> = {},
  now = new Date(),
) {
  requireRole(actor, 'SUPER_ADMIN');
  const reason = cleanReason(input.reason);
  const post = new PostCommit();
  const result = await transaction(async (tx) => {
    const ex = await tx.selfExclusion.findUnique({ where: { id: input.exclusionId } });
    if (!ex) throw new AppError('NOT_FOUND', 'Exclusion not found');
    if (ex.userId === actor.id) throw new AppError('FORBIDDEN', 'You cannot process your own reinstatement.');
    if (ex.type !== 'EXCLUSION_INDEFINITE') {
      throw new AppError('FORBIDDEN', 'Time-limited cooldowns and self-exclusions cannot be overridden.');
    }
    if (ex.status !== 'REINSTATEMENT_REQUESTED' || !ex.reinstatementRequestedAt) {
      throw new AppError('NOT_ELIGIBLE', 'The player has not requested a reinstatement review.');
    }
    const eligibleAt = new Date(ex.reinstatementRequestedAt.getTime() + REINSTATEMENT_WAIT_MS);
    if (eligibleAt > now) {
      throw new AppError('NOT_ELIGIBLE', `The waiting period ends ${eligibleAt.toUTCString()}.`, { eligibleAt: eligibleAt.toISOString() });
    }
    const claimed = await tx.selfExclusion.updateMany({
      where: { id: ex.id, status: 'REINSTATEMENT_REQUESTED' },
      data: { status: 'REINSTATED', reinstatedAt: now, reinstatedById: actor.id },
    });
    if (claimed.count !== 1) throw new AppError('CONFLICT', 'This request was already processed.');
    const after = await tx.selfExclusion.findUniqueOrThrow({ where: { id: ex.id } });
    await writeAudit(
      tx,
      actor,
      {
        action: 'RP_REINSTATEMENT',
        targetType: 'SELF_EXCLUSION',
        targetId: ex.id,
        before: { userId: ex.userId, status: ex.status, endsAt: ex.endsAt, reinstatementRequestedAt: ex.reinstatementRequestedAt },
        after: { userId: ex.userId, status: after.status, endsAt: after.endsAt, reinstatedAt: after.reinstatedAt, reinstatedById: actor.id },
      },
      { reason, ip: ctx.ip },
    );
    await tx.notification.create({
      data: {
        userId: ex.userId,
        type: 'LIMIT',
        title: 'Self-exclusion review complete',
        body: 'Your reinstatement request was approved. Your existing limits remain in place — you can review them at any time.',
        link: '/responsible-play',
      },
    });
    post.user(ex.userId, 'notification:new', {});
    post.user(ex.userId, 'play:status', { changed: true });
    return serializeAdminExclusion(after, now);
  });
  await post.flush();
  return result;
}
