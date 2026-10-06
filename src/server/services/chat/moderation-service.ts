import type { Prisma, Role } from '@prisma/client';
import { prisma, transaction, type Tx } from '@/server/db';
import { AppError } from '@/lib/errors';
import { emitToUser } from '@/server/realtime/events';
import { hasRole, ROLE_RANK } from '@/server/auth/tokens';
import { formatDuration } from '@/lib/format';
import { publishChat } from './bus';
import { getChatStatus, hydrate, MESSAGE_INCLUDE, USER_SELECT } from './chat-service';
import { CHAT_ROOM, MAX_MUTE_SECONDS, type ChatRole } from './types';

/**
 * Moderation actions. Every action:
 *   • re-reads the actor's role from the DB (never trusts a stale session),
 *   • enforces hierarchy (you can only act on users ranked strictly below you),
 *   • writes a ModerationLog row in the same transaction as the change,
 *   • notifies the affected user (Notification + live 'chat:status').
 */
type Actor = { id: string; role: Role; username: string };

async function loadActor(db: Tx | typeof prisma, actorId: string, min: Role = 'MODERATOR'): Promise<Actor> {
  const a = await db.user.findUnique({ where: { id: actorId }, select: { id: true, role: true, username: true, status: true } });
  if (!a || a.status === 'BANNED' || !hasRole(a.role, min)) throw new AppError('FORBIDDEN');
  return a;
}

async function loadTarget(db: Tx | typeof prisma, actor: Actor, targetId: string) {
  const t = await db.user.findUnique({ where: { id: targetId }, select: { id: true, role: true, username: true, status: true, suspendedUntil: true, statusReason: true } });
  if (!t) throw new AppError('NOT_FOUND', 'Player not found.');
  if (t.id === actor.id) throw new AppError('INVALID_ACTION', 'You can’t moderate yourself.');
  if (ROLE_RANK[t.role] >= ROLE_RANK[actor.role]) throw new AppError('FORBIDDEN', 'You can’t moderate a staff member of equal or higher rank.');
  return t;
}

const clean = (s?: string | null) => (s ? s.replace(/\s+/g, ' ').trim().slice(0, 300) : null) || null;

async function pushStatus(userId: string) {
  const status = await getChatStatus(userId);
  await emitToUser(userId, 'chat:status', status);
}

/** Soft-delete messages and broadcast removal. */
async function softDelete(tx: Tx, where: Prisma.ChatMessageWhereInput, actorId: string) {
  const rows = await tx.chatMessage.findMany({ where: { ...where, deletedAt: null }, select: { id: true } });
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  await tx.chatMessage.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: { deletedAt: new Date(), deletedBy: actorId } });
  // Deleting a message closes its open reports.
  await tx.chatReport.updateMany({ where: { messageId: { in: ids }, status: 'OPEN' }, data: { status: 'RESOLVED', resolvedBy: actorId } });
  return ids;
}

const PURGE_WINDOW_MS = 24 * 3600_000;

// ── Delete ────────────────────────────────────────────────

export async function deleteMessage(input: { actorId: string; messageId: string; reason?: string | null }) {
  const ids = await transaction(async (tx) => {
    const actor = await loadActor(tx, input.actorId);
    const msg = await tx.chatMessage.findUnique({ where: { id: input.messageId }, select: { id: true, userId: true, deletedAt: true, content: true, user: { select: { role: true } } } });
    if (!msg) throw new AppError('NOT_FOUND', 'Message not found.');
    if (msg.userId !== actor.id && ROLE_RANK[msg.user.role] >= ROLE_RANK[actor.role]) {
      throw new AppError('FORBIDDEN', 'You can’t remove messages from staff of equal or higher rank.');
    }
    if (msg.deletedAt) return [];
    const ids = await softDelete(tx, { id: msg.id }, actor.id);
    await tx.moderationLog.create({
      data: { moderatorId: actor.id, targetUserId: msg.userId, action: 'DELETE_MESSAGE', messageId: msg.id, reason: clean(input.reason), metadata: { content: msg.content } },
    });
    return ids;
  });
  if (ids.length) await publishChat({ t: 'deleted', room: CHAT_ROOM, ids });
  return { ok: true, deleted: ids };
}

// ── Warn ──────────────────────────────────────────────────

export async function warnUser(input: { actorId: string; userId: string; reason: string; messageId?: string | null }) {
  const reason = clean(input.reason);
  if (!reason) throw new AppError('VALIDATION', 'Add a reason for the warning.');
  await transaction(async (tx) => {
    const actor = await loadActor(tx, input.actorId);
    const target = await loadTarget(tx, actor, input.userId);
    await tx.moderationLog.create({ data: { moderatorId: actor.id, targetUserId: target.id, action: 'WARN', messageId: input.messageId ?? null, reason } });
    await tx.notification.create({
      data: { userId: target.id, type: 'MODERATION', title: 'Chat warning', body: `A moderator issued a warning: ${reason}. Please keep chat friendly and on-topic.`, link: '/support' },
    });
  });
  await emitToUser(input.userId, 'chat:warn', { reason });
  return { ok: true };
}

// ── Mute ──────────────────────────────────────────────────

export async function muteUser(input: { actorId: string; userId: string; durationSec: number; reason?: string | null; purge?: boolean }) {
  const dur = Math.floor(input.durationSec);
  if (!Number.isFinite(dur) || dur < 60 || dur > MAX_MUTE_SECONDS) throw new AppError('VALIDATION', 'Mute duration must be between 1 minute and 30 days.');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + dur * 1000);
  const reason = clean(input.reason);
  const purged = await transaction(async (tx) => {
    const actor = await loadActor(tx, input.actorId);
    const target = await loadTarget(tx, actor, input.userId);
    // A new mute replaces any active one (so a shorter mute can shorten it).
    await tx.chatMute.updateMany({ where: { userId: target.id, liftedAt: null, expiresAt: { gt: now } }, data: { liftedAt: now } });
    await tx.chatMute.create({ data: { userId: target.id, mutedById: actor.id, reason, expiresAt } });
    const ids = input.purge ? await softDelete(tx, { userId: target.id, createdAt: { gt: new Date(now.getTime() - PURGE_WINDOW_MS) } }, actor.id) : [];
    await tx.moderationLog.create({
      data: { moderatorId: actor.id, targetUserId: target.id, action: 'MUTE', reason, durationSec: dur, metadata: { expiresAt: expiresAt.toISOString(), purged: ids.length } },
    });
    await tx.notification.create({
      data: { userId: target.id, type: 'MODERATION', title: 'You’ve been muted in chat', body: `You can chat again in ${formatDuration(dur * 1000)}.${reason ? ` Reason: ${reason}` : ''}`, link: null },
    });
    return ids;
  });
  if (purged.length) await publishChat({ t: 'deleted', room: CHAT_ROOM, ids: purged });
  await pushStatus(input.userId);
  return { ok: true, expiresAt: expiresAt.toISOString(), purged: purged.length };
}

export async function unmuteUser(input: { actorId: string; userId: string; reason?: string | null }) {
  const now = new Date();
  await transaction(async (tx) => {
    const actor = await loadActor(tx, input.actorId);
    const target = await loadTarget(tx, actor, input.userId);
    const res = await tx.chatMute.updateMany({ where: { userId: target.id, liftedAt: null, expiresAt: { gt: now } }, data: { liftedAt: now } });
    if (res.count === 0) throw new AppError('INVALID_ACTION', 'This player isn’t muted.');
    await tx.moderationLog.create({ data: { moderatorId: actor.id, targetUserId: target.id, action: 'UNMUTE', reason: clean(input.reason) } });
  });
  await pushStatus(input.userId);
  return { ok: true };
}

// ── Chat ban ──────────────────────────────────────────────

export async function banUser(input: { actorId: string; userId: string; reason?: string | null; purge?: boolean }) {
  const reason = clean(input.reason);
  const now = new Date();
  const purged = await transaction(async (tx) => {
    const actor = await loadActor(tx, input.actorId);
    const target = await loadTarget(tx, actor, input.userId);
    const existing = await tx.chatBan.findFirst({ where: { userId: target.id, liftedAt: null } });
    if (existing) throw new AppError('INVALID_ACTION', 'This player is already banned from chat.');
    await tx.chatBan.create({ data: { userId: target.id, bannedById: actor.id, reason } });
    const ids = input.purge ? await softDelete(tx, { userId: target.id, createdAt: { gt: new Date(now.getTime() - PURGE_WINDOW_MS) } }, actor.id) : [];
    await tx.moderationLog.create({ data: { moderatorId: actor.id, targetUserId: target.id, action: 'CHAT_BAN', reason, metadata: { purged: ids.length } } });
    await tx.notification.create({
      data: { userId: target.id, type: 'MODERATION', title: 'Chat access removed', body: `You’ve been banned from chat.${reason ? ` Reason: ${reason}` : ''} You can still play and read chat.`, link: '/support' },
    });
    return ids;
  });
  if (purged.length) await publishChat({ t: 'deleted', room: CHAT_ROOM, ids: purged });
  await pushStatus(input.userId);
  return { ok: true, purged: purged.length };
}

export async function unbanUser(input: { actorId: string; userId: string; reason?: string | null }) {
  await transaction(async (tx) => {
    const actor = await loadActor(tx, input.actorId);
    const target = await loadTarget(tx, actor, input.userId);
    const res = await tx.chatBan.updateMany({ where: { userId: target.id, liftedAt: null }, data: { liftedAt: new Date() } });
    if (res.count === 0) throw new AppError('INVALID_ACTION', 'This player isn’t banned from chat.');
    await tx.moderationLog.create({ data: { moderatorId: actor.id, targetUserId: target.id, action: 'CHAT_UNBAN', reason: clean(input.reason) } });
    await tx.notification.create({ data: { userId: target.id, type: 'MODERATION', title: 'Chat access restored', body: 'Your chat ban has been lifted. Welcome back.', link: null } });
  });
  await pushStatus(input.userId);
  return { ok: true };
}

// ── Account suspension (ADMIN+) ───────────────────────────

export async function suspendAccount(input: { actorId: string; userId: string; durationSec: number | null; reason: string; ip?: string | null }) {
  const reason = clean(input.reason);
  if (!reason) throw new AppError('VALIDATION', 'A reason is required to suspend an account.');
  if (input.durationSec !== null && (input.durationSec < 3600 || input.durationSec > 365 * 86_400)) {
    throw new AppError('VALIDATION', 'Suspension must be between 1 hour and 1 year, or indefinite.');
  }
  const until = input.durationSec === null ? null : new Date(Date.now() + input.durationSec * 1000);
  await transaction(async (tx) => {
    const actor = await loadActor(tx, input.actorId, 'ADMIN');
    const target = await loadTarget(tx, actor, input.userId);
    if (target.status === 'BANNED') throw new AppError('INVALID_ACTION', 'This account is banned.');
    const before = { status: target.status, suspendedUntil: target.suspendedUntil?.toISOString() ?? null, statusReason: target.statusReason };
    await tx.user.update({ where: { id: target.id }, data: { status: 'SUSPENDED', suspendedUntil: until, statusReason: reason } });
    const after = { status: 'SUSPENDED', suspendedUntil: until?.toISOString() ?? null, statusReason: reason };
    await tx.moderationLog.create({
      data: { moderatorId: actor.id, targetUserId: target.id, action: 'SUSPEND', reason, durationSec: input.durationSec, metadata: { until: after.suspendedUntil } },
    });
    await tx.adminAuditLog.create({
      data: { adminUserId: actor.id, action: 'USER_SUSPEND', targetType: 'USER', targetId: target.id, before, after, reason, ip: input.ip?.slice(0, 64) ?? null },
    });
    await tx.notification.create({
      data: {
        userId: target.id,
        type: 'MODERATION',
        title: 'Account suspended',
        body: until ? `Your account is suspended until ${until.toUTCString()}. Reason: ${reason}` : `Your account is suspended. Reason: ${reason}`,
        link: '/support',
      },
    });
  });
  await Promise.all([pushStatus(input.userId), emitToUser(input.userId, 'play:status', { changed: true })]);
  return { ok: true, until: until?.toISOString() ?? null };
}

// ── Reports queue ─────────────────────────────────────────

export type ReportStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED';

export async function listReports(input: { actorId: string; status: ReportStatus; limit?: number }) {
  await loadActor(prisma, input.actorId);
  const reports = await prisma.chatReport.findMany({
    where: { status: input.status },
    orderBy: { createdAt: 'desc' },
    take: 400,
    include: { reporter: { select: { id: true, username: true, displayName: true } } },
  });
  // Group by message: one queue item per reported message.
  const byMsg = new Map<string, typeof reports>();
  for (const r of reports) byMsg.set(r.messageId, [...(byMsg.get(r.messageId) ?? []), r]);
  const ids = [...byMsg.keys()].slice(0, input.limit ?? 50);
  const rows = await prisma.chatMessage.findMany({ where: { id: { in: ids } }, include: MESSAGE_INCLUDE });
  const dtos = new Map((await hydrate(prisma, rows)).map((d) => [d.id, d]));
  const deleted = new Map(rows.map((r) => [r.id, r.deletedAt?.toISOString() ?? null]));
  const authorIds = [...new Set(rows.map((r) => r.userId))];
  const [mutes, bans, priorCounts] = await Promise.all([
    prisma.chatMute.findMany({ where: { userId: { in: authorIds }, liftedAt: null, expiresAt: { gt: new Date() } }, select: { userId: true, expiresAt: true } }),
    prisma.chatBan.findMany({ where: { userId: { in: authorIds }, liftedAt: null }, select: { userId: true } }),
    prisma.moderationLog.groupBy({ by: ['targetUserId'], where: { targetUserId: { in: authorIds } }, _count: { _all: true } }),
  ]);
  const muted = new Map(mutes.map((m) => [m.userId, m.expiresAt.toISOString()]));
  const banned = new Set(bans.map((b) => b.userId));
  const prior = new Map(priorCounts.map((p) => [p.targetUserId, p._count._all]));
  return {
    items: ids
      .filter((id) => dtos.has(id))
      .map((id) => {
        const msg = dtos.get(id)!;
        const group = byMsg.get(id)!;
        return {
          messageId: id,
          message: msg,
          deletedAt: deleted.get(id) ?? null,
          author: { ...msg.user, mutedUntil: muted.get(msg.user.id) ?? null, chatBanned: banned.has(msg.user.id), priorActions: prior.get(msg.user.id) ?? 0 },
          reports: group.map((r) => ({ id: r.id, reason: r.reason, createdAt: r.createdAt.toISOString(), reporter: r.reporter })),
          firstReportedAt: group[group.length - 1].createdAt.toISOString(),
          lastReportedAt: group[0].createdAt.toISOString(),
        };
      }),
    /** Number of reported MESSAGES per status (a message with 3 reports counts once). */
    counts: (await prisma.chatReport.groupBy({ by: ['status', 'messageId'] })).reduce<Partial<Record<ReportStatus, number>>>((acc, g) => {
      const k = g.status as ReportStatus;
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {}),
  };
}

export async function resolveReports(input: { actorId: string; messageId: string; status: 'RESOLVED' | 'DISMISSED' }) {
  const res = await transaction(async (tx) => {
    const actor = await loadActor(tx, input.actorId);
    const r = await tx.chatReport.updateMany({ where: { messageId: input.messageId, status: 'OPEN' }, data: { status: input.status, resolvedBy: actor.id } });
    if (r.count === 0) throw new AppError('ACTION_UNAVAILABLE', 'These reports were already handled.');
    return r.count;
  });
  return { ok: true, updated: res };
}

// ── Log + per-user moderation snapshot ────────────────────

export async function listModerationLog(input: { actorId: string; userId?: string; limit?: number }) {
  await loadActor(prisma, input.actorId);
  const rows = await prisma.moderationLog.findMany({
    where: input.userId ? { targetUserId: input.userId } : {},
    orderBy: { createdAt: 'desc' },
    take: Math.min(input.limit ?? 50, 200),
    include: { moderator: { select: { id: true, username: true, displayName: true } }, target: { select: { id: true, username: true, displayName: true } } },
  });
  return {
    items: rows.map((r) => ({
      id: r.id,
      action: r.action,
      reason: r.reason,
      durationSec: r.durationSec,
      messageId: r.messageId,
      createdAt: r.createdAt.toISOString(),
      moderator: r.moderator,
      target: r.target,
    })),
  };
}

/** Moderation snapshot shown to staff on player cards. */
export async function moderationSnapshot(userId: string) {
  const now = new Date();
  const [user, mute, ban, actions] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { status: true, suspendedUntil: true, role: true } }),
    prisma.chatMute.findFirst({ where: { userId, liftedAt: null, expiresAt: { gt: now } }, orderBy: { expiresAt: 'desc' } }),
    prisma.chatBan.findFirst({ where: { userId, liftedAt: null } }),
    prisma.moderationLog.count({ where: { targetUserId: userId } }),
  ]);
  return {
    accountStatus: user?.status ?? 'ACTIVE',
    suspendedUntil: user?.suspendedUntil?.toISOString() ?? null,
    mutedUntil: mute?.expiresAt.toISOString() ?? null,
    chatBanned: !!ban,
    priorActions: actions,
    role: (user?.role ?? 'USER') as ChatRole,
  };
}

export { USER_SELECT };
