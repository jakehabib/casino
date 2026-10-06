/**
 * Seed: demo accounts + default site settings.
 *   demo@nova.test / demo12345           (USER)
 *   mod@nova.test / moderator123         (MODERATOR)
 *   admin@nova.test / admin12345         (ADMIN)
 *   super@nova.test / superadmin123      (SUPER_ADMIN)
 */
import 'dotenv/config';
import { PrismaClient, type Role } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import { SETTINGS } from '../src/server/services/settings/schemas';

const prisma = new PrismaClient();

async function upsertUser(username: string, email: string, password: string, role: Role, balance: bigint) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const passwordHash = await hash(password, { algorithm: 2, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { username: username.toLowerCase(), displayName: username, email, passwordHash, role, avatarUrl: `preset:${Math.abs(username.length * 7) % 12}` },
    });
    await tx.wallet.create({ data: { userId: user.id, balance } });
    await tx.walletTransaction.create({
      data: {
        userId: user.id,
        type: 'SIGNUP_GRANT',
        amount: balance,
        balanceBefore: 0n,
        balanceAfter: balance,
        referenceType: 'USER',
        referenceId: user.id,
        idempotencyKey: 'signup-grant',
      },
    });
    await tx.playerStats.create({ data: { userId: user.id } });
    await tx.playerLevel.create({ data: { userId: user.id } });
    await tx.responsiblePlaySettings.create({ data: { userId: user.id } });
    const seed = randomBytes(32).toString('hex');
    await tx.serverSeed.create({
      data: { userId: user.id, seed, seedHash: createHash('sha256').update(seed).digest('hex'), clientSeed: randomBytes(8).toString('hex') },
    });
    return user;
  });
}

async function main() {
  for (const [key, schema] of Object.entries(SETTINGS)) {
    await prisma.siteSetting.upsert({ where: { key }, create: { key, value: schema.parse({}) as object }, update: {} });
  }
  // Demo accounts: always in development; in production only with SEED_DEMO_USERS=true.
  if (process.env.NODE_ENV !== 'production' || process.env.SEED_DEMO_USERS === 'true') {
    await upsertUser('Demo', 'demo@nova.test', 'demo12345', 'USER', 100_000n);
    await upsertUser('Moderator', 'mod@nova.test', 'moderator123', 'MODERATOR', 100_000n);
    await upsertUser('Admin', 'admin@nova.test', 'admin12345', 'ADMIN', 100_000n);
    await upsertUser('SuperAdmin', 'super@nova.test', 'superadmin123', 'SUPER_ADMIN', 100_000n);
    console.log('Demo accounts ready. Demo login: demo@nova.test / demo12345');
  }
  // Owner account for a fresh deployment: ADMIN_EMAIL + ADMIN_PASSWORD (+ ADMIN_USERNAME).
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    if (process.env.ADMIN_PASSWORD.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters');
    await upsertUser(process.env.ADMIN_USERNAME || 'Owner', process.env.ADMIN_EMAIL.toLowerCase(), process.env.ADMIN_PASSWORD, 'SUPER_ADMIN', 100_000n);
    console.log(`Owner account ready: ${process.env.ADMIN_EMAIL}`);
  }
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
