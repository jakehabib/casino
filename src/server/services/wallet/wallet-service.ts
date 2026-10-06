import type { TransactionType, WalletTransaction } from '@prisma/client';
import { prisma, type Tx, isUniqueViolation } from '@/server/db';
import { AppError } from '@/lib/errors';
import { logger } from '@/server/logger';
import type { PostCommit } from '@/server/realtime/events';
import { toNum } from '@/lib/money';

/**
 * WalletService — the ONLY code allowed to change a balance.
 *
 * Invariants
 *  • Every balance change appends exactly one WalletTransaction row in the same
 *    DB transaction (append-only ledger; Wallet.balance is a projection).
 *  • Balances never go negative (enforced by a conditional UPDATE).
 *  • Every movement carries an idempotency key, unique per user. Replaying the
 *    same key is a no-op that returns the original ledger row.
 *  • Integer Credits only (bigint).
 */

export interface LedgerEntryInput {
  userId: string;
  type: TransactionType;
  /** Signed amount: negative = debit, positive = credit. */
  amount: bigint;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface LedgerResult {
  entry: WalletTransaction;
  balance: bigint;
  duplicate: boolean;
}

const SIGN_RULES: Record<TransactionType, 'debit' | 'credit' | 'any'> = {
  SIGNUP_GRANT: 'credit',
  FREE_CREDIT_CLAIM: 'credit',
  BET: 'debit',
  WIN: 'credit',
  REFUND: 'credit',
  ADMIN_ADJUSTMENT: 'any',
};

/**
 * Lock the user's wallet row for the remainder of the transaction. Every
 * wager path calls this first, serialising a user's balance-affecting work so
 * eligibility checks (limits, balance) cannot race.
 */
export async function lockWallet(tx: Tx, userId: string): Promise<bigint> {
  const rows = await tx.$queryRaw<{ balance: bigint }[]>`
    SELECT balance FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
  if (rows.length === 0) throw new AppError('NOT_FOUND', 'Wallet not found');
  return rows[0].balance;
}

export async function applyLedgerEntry(tx: Tx, input: LedgerEntryInput, post?: PostCommit): Promise<LedgerResult> {
  const rule = SIGN_RULES[input.type];
  if (input.amount === 0n && input.type !== 'ADMIN_ADJUSTMENT') {
    throw new AppError('VALIDATION', 'Zero-amount ledger entry');
  }
  if (rule === 'debit' && input.amount >= 0n) throw new AppError('VALIDATION', `${input.type} must be a debit`);
  if (rule === 'credit' && input.amount <= 0n) throw new AppError('VALIDATION', `${input.type} must be a credit`);

  const existing = await tx.walletTransaction.findUnique({
    where: { userId_idempotencyKey: { userId: input.userId, idempotencyKey: input.idempotencyKey } },
  });
  if (existing) {
    const w = await tx.wallet.findUniqueOrThrow({ where: { userId: input.userId } });
    return { entry: existing, balance: w.balance, duplicate: true };
  }

  const updated = await tx.$queryRaw<{ balance: bigint }[]>`
    UPDATE "Wallet"
       SET balance = balance + ${input.amount}, version = version + 1, "updatedAt" = now()
     WHERE "userId" = ${input.userId} AND balance + ${input.amount} >= 0
     RETURNING balance`;
  if (updated.length !== 1) {
    const exists = await tx.wallet.findUnique({ where: { userId: input.userId }, select: { id: true } });
    if (!exists) throw new AppError('NOT_FOUND', 'Wallet not found');
    throw new AppError('INSUFFICIENT_BALANCE');
  }
  const balanceAfter = updated[0].balance;
  const balanceBefore = balanceAfter - input.amount;

  let entry: WalletTransaction;
  try {
    entry = await tx.walletTransaction.create({
      data: {
        userId: input.userId,
        type: input.type,
        amount: input.amount,
        balanceBefore,
        balanceAfter,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        idempotencyKey: input.idempotencyKey,
        metadata: (input.metadata ?? undefined) as object | undefined,
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      // A concurrent transaction committed the same key. Abort this one; the
      // caller's transaction rolls back including the balance update above.
      throw new AppError('CONFLICT', 'Duplicate ledger entry');
    }
    throw err;
  }

  post?.user(input.userId, 'wallet:update', {
    balance: toNum(balanceAfter),
    delta: toNum(input.amount),
    type: input.type,
    referenceType: input.referenceType,
    at: entry.createdAt.toISOString(),
  });

  return { entry, balance: balanceAfter, duplicate: false };
}

export async function getBalance(userId: string): Promise<bigint> {
  const w = await prisma.wallet.findUnique({ where: { userId }, select: { balance: true } });
  return w?.balance ?? 0n;
}

export async function createWallet(tx: Tx, userId: string) {
  return tx.wallet.create({ data: { userId, balance: 0n } });
}

/**
 * Integrity check: the cached balance must equal the ledger sum, and the
 * last entry's balanceAfter must equal the balance.
 */
export async function verifyWalletIntegrity(userId: string) {
  const [w, sum, last] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId } }),
    prisma.walletTransaction.aggregate({ where: { userId }, _sum: { amount: true } }),
    prisma.walletTransaction.findFirst({ where: { userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
  ]);
  const ledgerSum = sum._sum.amount ?? 0n;
  const balance = w?.balance ?? 0n;
  const ok = ledgerSum === balance && (!last || last.balanceAfter === balance);
  if (!ok) {
    logger.error({ userId, balance: balance.toString(), ledgerSum: ledgerSum.toString() }, 'wallet inconsistency detected');
  }
  return { ok, balance, ledgerSum };
}

export async function listTransactions(userId: string, opts: { take?: number; cursor?: string } = {}) {
  const take = Math.min(opts.take ?? 25, 100);
  const rows = await prisma.walletTransaction.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  return {
    items: rows.slice(0, take).map(serializeTransaction),
    nextCursor: hasMore ? rows[take - 1].id : null,
  };
}

export function serializeTransaction(t: WalletTransaction) {
  return {
    id: t.id,
    type: t.type,
    amount: toNum(t.amount),
    balanceBefore: toNum(t.balanceBefore),
    balanceAfter: toNum(t.balanceAfter),
    referenceType: t.referenceType,
    referenceId: t.referenceId,
    metadata: t.metadata,
    createdAt: t.createdAt.toISOString(),
  };
}
