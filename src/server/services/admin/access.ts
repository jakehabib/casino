import type { Prisma, Role } from '@prisma/client';
import type { Tx } from '@/server/db';
import { AppError } from '@/lib/errors';
import { ROLE_RANK, hasRole } from '@/server/auth/tokens';

/**
 * Shared admin plumbing: who may do what, and the audit trail.
 *
 * Every admin service function takes the ACTING user explicitly and performs
 * its own authorisation, so route-level guards are defence in depth rather
 * than the only line (tests call the services directly).
 */
export interface Actor {
  id: string;
  role: Role;
}

export interface AuditContext {
  reason: string;
  ip?: string | null;
}

export function requireRole(actor: Actor | null | undefined, min: Role): asserts actor is Actor {
  if (!actor || !hasRole(actor.role, min)) throw new AppError('FORBIDDEN');
}

/** Staff may only act on accounts strictly below their own rank (never on themselves). */
export function assertOutranks(actor: Actor, target: { id: string; role: Role }) {
  if (actor.id === target.id) throw new AppError('FORBIDDEN', 'You cannot perform this action on your own account.');
  if (ROLE_RANK[target.role] >= ROLE_RANK[actor.role]) {
    throw new AppError('FORBIDDEN', 'You cannot act on an account with an equal or higher role.');
  }
}

export function cleanReason(reason: string | undefined | null): string {
  const r = (reason ?? '').trim();
  if (r.length < 3) throw new AppError('VALIDATION', 'A reason (at least 3 characters) is required.');
  if (r.length > 500) throw new AppError('VALIDATION', 'Reason is too long (max 500 characters).');
  return r;
}

/** JSON-safe snapshot (bigint → string, Date → ISO) for before/after columns. */
export function snapshot(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
  ) as Prisma.InputJsonValue;
}

/** Append an AdminAuditLog row. MUST be called inside the mutation's transaction. */
export async function writeAudit(
  tx: Tx,
  actor: Actor,
  entry: {
    action: string;
    targetType: string;
    targetId?: string | null;
    before?: unknown;
    after?: unknown;
  },
  ctx: AuditContext,
) {
  return tx.adminAuditLog.create({
    data: {
      adminUserId: actor.id,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId ?? null,
      before: snapshot(entry.before),
      after: snapshot(entry.after),
      reason: ctx.reason,
      ip: ctx.ip?.slice(0, 64) ?? null,
    },
  });
}
