import type { Prisma, Role, UserStatus } from '@prisma/client';
import { prisma, transaction } from '@/server/db';
import { AppError } from '@/lib/errors';
import { toNum } from '@/lib/money';
import { ROLE_RANK } from '@/server/auth/tokens';
import { PostCommit } from '@/server/realtime/events';
import { applyLedgerEntry, listTransactions, lockWallet } from '@/server/services/wallet/wallet-service';
import { levelFromLifetimeXp, tierForLevel } from '@/lib/levels';
import { type Actor, type AuditContext, assertOutranks, cleanReason, requireRole, writeAudit } from './access';
import { getUserResponsiblePlay } from './responsible-play';

/** Largest single manual adjustment (play-money guard rail against fat-finger input). */
export const MAX_ADJUSTMENT = 1_000_000_000;

// ─────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────

export interface UserSearchInput {
  q?: string;
  role?: Role;
  status?: UserStatus;
  page?: number;
  pageSize?: number;
}

export async function searchUsers(actor: Actor, input: UserSearchInput) {
  requireRole(actor, 'ADMIN');
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, input.pageSize ?? 25));
  const q = input.q?.trim().toLowerCase();
  const where: Prisma.UserWhereInput = {
    ...(q
      ? {
          OR: [
            { username: { startsWith: q } },
            { email: { startsWith: q, mode: 'insensitive' } },
            ...(q.length >= 20 ? [{ id: q }] : []),
          ],
        }
      : {}),
    ...(input.role ? { role: input.role } : {}),
    ...(input.status ? { status: input.status } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        avatarUrl: true,
        role: true,
        status: true,
        suspendedUntil: true,
        level: true,
        createdAt: true,
        lastSeenAt: true,
        wallet: { select: { balance: true } },
        stats: { select: { gamesPlayed: true, totalWagered: true } },
      },
    }),
  ]);
  return {
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    items: rows.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      email: u.email,
      avatarUrl: u.avatarUrl,
      role: u.role,
      status: u.status,
      suspendedUntil: u.suspendedUntil?.toISOString() ?? null,
      level: u.level,
      balance: toNum(u.wallet?.balance ?? 0n),
      gamesPlayed: u.stats?.gamesPlayed ?? 0,
      totalWagered: toNum(u.stats?.totalWagered ?? 0n),
      createdAt: u.createdAt.toISOString(),
      lastSeenAt: u.lastSeenAt.toISOString(),
    })),
  };
}

export async function getUserDetail(actor: Actor, userId: string) {
  requireRole(actor, 'ADMIN');
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { wallet: true, stats: true },
  });
  if (!user) throw new AppError('NOT_FOUND', 'User not found');
  const [sessions, rp, moderation, audit, ledgerTotals] = await Promise.all([
    prisma.session.count({ where: { userId, expiresAt: { gt: new Date() } } }),
    getUserResponsiblePlay(userId),
    prisma.moderationLog.findMany({
      where: { targetUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { moderator: { select: { username: true } } },
    }),
    prisma.adminAuditLog.findMany({
      where: { targetType: 'USER', targetId: userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { admin: { select: { username: true } } },
    }),
    prisma.walletTransaction.groupBy({ by: ['type'], where: { userId }, _sum: { amount: true }, _count: true }),
  ]);
  const s = user.stats;
  const prog = levelFromLifetimeXp(toNum(user.lifetimeXp));
  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role,
      status: user.status,
      statusReason: user.statusReason,
      suspendedUntil: user.suspendedUntil?.toISOString() ?? null,
      privacy: user.privacy,
      createdAt: user.createdAt.toISOString(),
      lastSeenAt: user.lastSeenAt.toISOString(),
      level: prog.level,
      tier: tierForLevel(prog.level),
      lifetimeXp: toNum(user.lifetimeXp),
      activeSessions: sessions,
    },
    permissions: {
      canAct: actor.id !== user.id && ROLE_RANK[user.role] < ROLE_RANK[actor.role],
      canChangeRole: actor.role === 'SUPER_ADMIN' && actor.id !== user.id && ROLE_RANK[user.role] < ROLE_RANK.SUPER_ADMIN,
      canReinstate: actor.role === 'SUPER_ADMIN',
    },
    balance: toNum(user.wallet?.balance ?? 0n),
    ledgerTotals: ledgerTotals.map((t) => ({ type: t.type, count: t._count, sum: toNum(t._sum.amount ?? 0n) })),
    stats: s
      ? {
          gamesPlayed: s.gamesPlayed,
          totalWagered: toNum(s.totalWagered),
          totalWon: toNum(s.totalWon),
          net: toNum(s.totalWon - s.totalWagered),
          largestWin: toNum(s.largestWin),
          largestWinGame: s.largestWinGame,
          plays: {
            BLACKJACK: s.playsBlackjack,
            BACCARAT: s.playsBaccarat,
            ROULETTE: s.playsRoulette,
            CRASH: s.playsCrash,
            SLOTS: s.playsSlots,
          },
          blackjack: { hands: s.bjHands, wins: s.bjWins, losses: s.bjLosses, pushes: s.bjPushes, blackjacks: s.bjBlackjacks },
          baccarat: { hands: s.bacHands, player: s.bacPlayerWins, banker: s.bacBankerWins, ties: s.bacTies },
          roulette: { spins: s.rouSpins, largestWin: toNum(s.rouLargestWin) },
          crash: { rounds: s.crashRounds, highestCashoutX100: s.crashHighestCashout, largestWin: toNum(s.crashLargestWin) },
          slots: { spins: s.slotSpins, largestWin: toNum(s.slotLargestWin) },
        }
      : null,
    responsiblePlay: rp,
    moderation: moderation.map((m) => ({
      id: m.id,
      action: m.action,
      reason: m.reason,
      durationSec: m.durationSec,
      moderator: m.moderator.username,
      createdAt: m.createdAt.toISOString(),
    })),
    audit: audit.map((a) => ({
      id: a.id,
      action: a.action,
      admin: a.admin.username,
      reason: a.reason,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

export type AdminUserDetail = Awaited<ReturnType<typeof getUserDetail>>;

export async function getUserLedger(actor: Actor, userId: string, opts: { cursor?: string; take?: number }) {
  requireRole(actor, 'ADMIN');
  return listTransactions(userId, opts);
}

export async function getUserGames(actor: Actor, userId: string, opts: { cursor?: string; take?: number; game?: string }) {
  requireRole(actor, 'ADMIN');
  const take = Math.min(opts.take ?? 25, 100);
  const rows = await prisma.gameHistory.findMany({
    where: { userId, ...(opts.game ? { game: opts.game } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  return {
    items: rows.slice(0, take).map((r) => ({
      id: r.id,
      game: r.game,
      gameVariant: r.gameVariant,
      referenceId: r.referenceId,
      wager: toNum(r.wager),
      payout: toNum(r.payout),
      net: toNum(r.net),
      multiplier: r.multiplier,
      resultSummary: r.resultSummary,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? rows[take - 1].id : null,
  };
}

// ─────────────────────────────────────────────────────────────
// Mutations (each writes AdminAuditLog in the same transaction)
// ─────────────────────────────────────────────────────────────

async function loadTarget(tx: Parameters<Parameters<typeof transaction>[0]>[0], userId: string) {
  const target = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, status: true, statusReason: true, suspendedUntil: true, username: true },
  });
  if (!target) throw new AppError('NOT_FOUND', 'User not found');
  return target;
}

export interface CreditAdjustmentInput {
  userId: string;
  /** Signed integer Credits: positive credits the player, negative debits. */
  amount: number;
  reason: string;
  requestId: string;
}

/**
 * Manual credit adjustment. Idempotent by the client requestId (ledger key
 * `admin-adjust:<requestId>`): a replay returns the original entry without a
 * second movement or a second audit row. Never drives a balance negative.
 */
export async function adjustCredits(actor: Actor, input: CreditAdjustmentInput, ctx: Omit<AuditContext, 'reason'> = {}) {
  requireRole(actor, 'ADMIN');
  const reason = cleanReason(input.reason);
  if (!Number.isSafeInteger(input.amount) || input.amount === 0) {
    throw new AppError('VALIDATION', 'Enter a non-zero whole number of Credits.');
  }
  if (Math.abs(input.amount) > MAX_ADJUSTMENT) {
    throw new AppError('VALIDATION', `Adjustments are capped at ${MAX_ADJUSTMENT.toLocaleString('en-US')} Credits.`);
  }
  const amount = BigInt(input.amount);
  const idempotencyKey = `admin-adjust:${input.requestId}`;
  const post = new PostCommit();

  const result = await transaction(async (tx) => {
    const target = await loadTarget(tx, input.userId);
    assertOutranks(actor, target);
    const before = await lockWallet(tx, target.id);

    const existing = await tx.walletTransaction.findUnique({
      where: { userId_idempotencyKey: { userId: target.id, idempotencyKey } },
    });
    if (existing) {
      return { duplicate: true, entryId: existing.id, amount: toNum(existing.amount), balance: toNum(before) };
    }
    if (before + amount < 0n) {
      throw new AppError(
        'VALIDATION',
        `This adjustment would make the balance negative (current balance ${toNum(before).toLocaleString('en-US')}).`,
        { balance: toNum(before) },
      );
    }
    const { entry, balance } = await applyLedgerEntry(
      tx,
      {
        userId: target.id,
        type: 'ADMIN_ADJUSTMENT',
        amount,
        referenceType: 'ADMIN_ADJUSTMENT',
        referenceId: input.requestId,
        idempotencyKey,
        metadata: { adminUserId: actor.id, reason },
      },
      post,
    );
    await writeAudit(
      tx,
      actor,
      {
        action: 'USER_CREDIT_ADJUST',
        targetType: 'USER',
        targetId: target.id,
        before: { balance: toNum(before) },
        after: { balance: toNum(balance), amount: input.amount, ledgerEntryId: entry.id },
      },
      { reason, ip: ctx.ip },
    );
    await tx.notification.create({
      data: {
        userId: target.id,
        type: 'SYSTEM',
        title: amount > 0n ? 'Credits added to your balance' : 'Balance adjusted',
        body:
          amount > 0n
            ? `${input.amount.toLocaleString('en-US')} Credits were added by the NOVA team.`
            : `${Math.abs(input.amount).toLocaleString('en-US')} Credits were removed by the NOVA team.`,
        link: '/wallet',
      },
    });
    post.user(target.id, 'notification:new', {});
    return { duplicate: false, entryId: entry.id, amount: input.amount, balance: toNum(balance) };
  });
  await post.flush();
  return result;
}

export type StatusAction = 'SUSPEND' | 'BAN' | 'REINSTATE';

export interface StatusChangeInput {
  userId: string;
  action: StatusAction;
  /** SUSPEND only: end of suspension; null/undefined = indefinite. */
  until?: Date | null;
  reason: string;
}

/** Suspend (timed or indefinite), ban, or restore (unban / unsuspend) an account. */
export async function setUserStatus(actor: Actor, input: StatusChangeInput, ctx: Omit<AuditContext, 'reason'> = {}, now = new Date()) {
  requireRole(actor, 'ADMIN');
  const reason = cleanReason(input.reason);
  if (input.action === 'SUSPEND' && input.until && input.until.getTime() <= now.getTime() + 60_000) {
    throw new AppError('VALIDATION', 'Suspension end must be in the future.');
  }
  const post = new PostCommit();
  const result = await transaction(async (tx) => {
    const target = await loadTarget(tx, input.userId);
    assertOutranks(actor, target);
    const before = { status: target.status, suspendedUntil: target.suspendedUntil, statusReason: target.statusReason };

    let data: Prisma.UserUpdateInput;
    let action: string;
    switch (input.action) {
      case 'SUSPEND':
        if (target.status === 'BANNED') throw new AppError('INVALID_ACTION', 'This account is banned. Unban it first.');
        data = { status: 'SUSPENDED', suspendedUntil: input.until ?? null, statusReason: reason };
        action = 'USER_SUSPEND';
        break;
      case 'BAN':
        if (target.status === 'BANNED') throw new AppError('INVALID_ACTION', 'This account is already banned.');
        data = { status: 'BANNED', suspendedUntil: null, statusReason: reason };
        action = 'USER_BAN';
        break;
      case 'REINSTATE':
        if (target.status === 'ACTIVE') throw new AppError('INVALID_ACTION', 'This account is already active.');
        data = { status: 'ACTIVE', suspendedUntil: null, statusReason: null };
        action = target.status === 'BANNED' ? 'USER_UNBAN' : 'USER_UNSUSPEND';
        break;
    }
    // Conditional on the status we read, so concurrent admin actions cannot interleave.
    const updated = await tx.user.updateMany({
      where: { id: target.id, status: target.status },
      data: data as Prisma.UserUpdateManyMutationInput,
    });
    if (updated.count !== 1) throw new AppError('CONFLICT', 'The account changed while you were editing. Refresh and try again.');
    if (input.action === 'BAN') {
      // A banned account cannot sign in; end its existing sessions immediately.
      await tx.session.deleteMany({ where: { userId: target.id } });
    }
    const after = await tx.user.findUniqueOrThrow({
      where: { id: target.id },
      select: { status: true, suspendedUntil: true, statusReason: true },
    });
    await writeAudit(tx, actor, { action, targetType: 'USER', targetId: target.id, before, after }, { reason, ip: ctx.ip });
    post.user(target.id, 'play:status', { changed: true });
    return {
      status: after.status,
      suspendedUntil: after.suspendedUntil?.toISOString() ?? null,
      statusReason: after.statusReason,
    };
  });
  await post.flush();
  return result;
}

/** SUPER_ADMIN only. Roles up to ADMIN can be granted; SUPER_ADMIN is provisioned out of band. */
export async function changeUserRole(actor: Actor, input: { userId: string; role: Role; reason: string }, ctx: Omit<AuditContext, 'reason'> = {}) {
  requireRole(actor, 'SUPER_ADMIN');
  const reason = cleanReason(input.reason);
  if (ROLE_RANK[input.role] >= ROLE_RANK[actor.role]) {
    throw new AppError('FORBIDDEN', 'You cannot grant a role equal to or above your own.');
  }
  return transaction(async (tx) => {
    const target = await loadTarget(tx, input.userId);
    assertOutranks(actor, target);
    if (target.role === input.role) throw new AppError('INVALID_ACTION', 'The user already has this role.');
    const updated = await tx.user.updateMany({ where: { id: target.id, role: target.role }, data: { role: input.role } });
    if (updated.count !== 1) throw new AppError('CONFLICT', 'The account changed while you were editing. Refresh and try again.');
    await writeAudit(
      tx,
      actor,
      { action: 'USER_ROLE_CHANGE', targetType: 'USER', targetId: target.id, before: { role: target.role }, after: { role: input.role } },
      { reason, ip: ctx.ip },
    );
    return { role: input.role };
  });
}
