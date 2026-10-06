import { randomBytes } from 'node:crypto';
import { prisma } from '@/server/db';
import { redis } from '@/server/redis';
import { registerUser } from '@/server/services/account/account-service';
import { invalidateSettings } from '@/server/services/settings/settings-service';

/** Truncate every table (fast, keeps schema). */
export async function resetDatabase() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  }
  await redis.flushdb();
  invalidateSettings();
}

let n = 0;
/** Create a fully-provisioned user (wallet, stats, seed, 100k signup grant). */
export async function createTestUser(opts: { balance?: number; role?: 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN'; timezone?: string } = {}) {
  n++;
  const suffix = `${n}${randomBytes(3).toString('hex')}`;
  const user = await registerUser({
    username: `u_${suffix}`.slice(0, 20),
    email: `u_${suffix}@test.local`,
    password: 'password123',
    timezone: opts.timezone ?? 'UTC',
    acceptTerms: true,
  });
  if (opts.balance !== undefined) {
    await prisma.wallet.update({ where: { userId: user.id }, data: { balance: BigInt(opts.balance) } });
    // Keep the ledger consistent with the forced balance for integrity checks.
    await prisma.walletTransaction.updateMany({
      where: { userId: user.id, idempotencyKey: 'signup-grant' },
      data: { amount: BigInt(opts.balance), balanceAfter: BigInt(opts.balance) },
    });
  }
  if (opts.role) await prisma.user.update({ where: { id: user.id }, data: { role: opts.role } });
  return user;
}

export async function balanceOf(userId: string) {
  const w = await prisma.wallet.findUniqueOrThrow({ where: { userId } });
  return Number(w.balance);
}

export function rid() {
  return randomBytes(12).toString('hex');
}
