import type { Prisma } from '@prisma/client';
import { prisma } from '@/server/db';
import { type Actor, requireRole } from './access';

export interface AuditQuery {
  action?: string;
  admin?: string; // username prefix or user id
  targetType?: string;
  targetId?: string;
  cursor?: string;
  take?: number;
}

export async function listAuditLog(actor: Actor, q: AuditQuery) {
  requireRole(actor, 'ADMIN');
  const take = Math.min(q.take ?? 30, 100);
  let adminIds: string[] | undefined;
  if (q.admin?.trim()) {
    const term = q.admin.trim().toLowerCase();
    const admins = await prisma.user.findMany({
      where: { OR: [{ id: q.admin.trim() }, { username: { startsWith: term } }], role: { not: 'USER' } },
      select: { id: true },
      take: 50,
    });
    adminIds = admins.map((a) => a.id);
  }
  const where: Prisma.AdminAuditLogWhereInput = {
    ...(q.action ? { action: q.action } : {}),
    ...(q.targetType ? { targetType: q.targetType } : {}),
    ...(q.targetId?.trim() ? { targetId: q.targetId.trim() } : {}),
    ...(adminIds ? { adminUserId: { in: adminIds } } : {}),
  };
  const rows = await prisma.adminAuditLog.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    include: { admin: { select: { id: true, username: true, role: true, avatarUrl: true } } },
  });
  const page = rows.slice(0, take);
  const userTargetIds = [...new Set(page.filter((r) => r.targetType === 'USER' && r.targetId).map((r) => r.targetId!))];
  const targets = userTargetIds.length
    ? await prisma.user.findMany({ where: { id: { in: userTargetIds } }, select: { id: true, username: true } })
    : [];
  const targetName = new Map(targets.map((t) => [t.id, t.username]));
  return {
    items: page.map((r) => ({
      id: r.id,
      action: r.action,
      targetType: r.targetType,
      targetId: r.targetId,
      targetLabel: r.targetType === 'USER' && r.targetId ? (targetName.get(r.targetId) ?? null) : r.targetId,
      before: r.before,
      after: r.after,
      reason: r.reason,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
      admin: r.admin,
    })),
    nextCursor: rows.length > take ? page[page.length - 1].id : null,
  };
}

export async function auditFacets(actor: Actor) {
  requireRole(actor, 'ADMIN');
  const [actions, targetTypes] = await Promise.all([
    prisma.adminAuditLog.groupBy({ by: ['action'], _count: true, orderBy: { action: 'asc' } }),
    prisma.adminAuditLog.groupBy({ by: ['targetType'], _count: true, orderBy: { targetType: 'asc' } }),
  ]);
  return {
    actions: actions.map((a) => ({ value: a.action, count: a._count })),
    targetTypes: targetTypes.map((a) => ({ value: a.targetType, count: a._count })),
  };
}

/** Recent chat moderation actions (MODERATOR and above). */
export async function listModerationLog(actor: Actor, q: { cursor?: string; take?: number; action?: string }) {
  requireRole(actor, 'MODERATOR');
  const take = Math.min(q.take ?? 30, 100);
  const rows = await prisma.moderationLog.findMany({
    where: q.action ? { action: q.action } : {},
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    include: {
      moderator: { select: { id: true, username: true, avatarUrl: true, role: true } },
      target: { select: { id: true, username: true, avatarUrl: true } },
    },
  });
  const page = rows.slice(0, take);
  return {
    items: page.map((r) => ({
      id: r.id,
      action: r.action,
      reason: r.reason,
      durationSec: r.durationSec,
      messageId: r.messageId,
      metadata: r.metadata,
      createdAt: r.createdAt.toISOString(),
      moderator: r.moderator,
      target: r.target,
    })),
    nextCursor: rows.length > take ? page[page.length - 1].id : null,
  };
}
