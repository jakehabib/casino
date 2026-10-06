import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma, isUniqueViolation } from '@/server/db';
import { AppError } from '@/lib/errors';
import { hashPassword, verifyPassword, dummyVerify } from '@/server/auth/password';
import { applyLedgerEntry, createWallet } from '@/server/services/wallet/wallet-service';
import { getSetting } from '@/server/services/settings/settings-service';
import { newServerSeed, defaultClientSeed } from '@/server/services/fairness/seed-service';
import { isValidTimeZone } from '@/lib/time';
import { logger } from '@/server/logger';
import { devToolsEnabled, env } from '@/server/env';
import { PostCommit } from '@/server/realtime/events';

export const UsernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(20, 'Username must be at most 20 characters')
  .regex(/^[A-Za-z0-9_]+$/, 'Use letters, numbers and underscores only');

export const PasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long');

export const RegisterSchema = z.object({
  username: UsernameSchema,
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(254),
  password: PasswordSchema,
  timezone: z.string().max(64).optional(),
  acceptTerms: z.literal(true, { message: 'Please confirm you understand Credits have no value' }),
});

export const RESERVED_USERNAMES = new Set(['admin', 'nova', 'support', 'moderator', 'system', 'root', 'staff']);

export async function registerUser(input: z.infer<typeof RegisterSchema>) {
  const system = await getSetting('system');
  if (!system.registrationOpen) throw new AppError('FORBIDDEN', 'Registration is currently closed.');
  const username = input.username.toLowerCase();
  if (RESERVED_USERNAMES.has(username)) throw new AppError('VALIDATION', 'That username is reserved', { field: 'username' });

  const passwordHash = await hashPassword(input.password);
  const { signupGrant } = await getSetting('rewards');
  const timezone = input.timezone && isValidTimeZone(input.timezone) ? input.timezone : 'UTC';
  const post = new PostCommit();

  try {
    const user = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { username, displayName: input.username, email: input.email, passwordHash, avatarUrl: `preset:${Math.floor(Math.random() * 12)}` },
      });
      await createWallet(tx, user.id);
      await tx.playerStats.create({ data: { userId: user.id } });
      await tx.playerLevel.create({ data: { userId: user.id } });
      await tx.responsiblePlaySettings.create({ data: { userId: user.id, timezone } });
      const { seed, seedHash } = newServerSeed();
      await tx.serverSeed.create({ data: { userId: user.id, seed, seedHash, clientSeed: defaultClientSeed() } });
      if (signupGrant > 0) {
        await applyLedgerEntry(
          tx,
          {
            userId: user.id,
            type: 'SIGNUP_GRANT',
            amount: BigInt(signupGrant),
            referenceType: 'USER',
            referenceId: user.id,
            idempotencyKey: 'signup-grant',
          },
          post,
        );
      }
      await tx.notification.create({
        data: {
          userId: user.id,
          type: 'SYSTEM',
          title: 'Welcome to NOVA',
          body: `We've added ${signupGrant.toLocaleString('en-US')} Credits to your balance. Credits are play money and have no cash value.`,
          link: '/casino',
        },
      });
      return user;
    });
    await post.flush();
    return user;
  } catch (err) {
    if (isUniqueViolation(err)) {
      const target = String((err as { meta?: { target?: unknown } }).meta?.target ?? '');
      if (target.includes('email')) throw new AppError('VALIDATION', 'An account with that email already exists', { field: 'email' });
      throw new AppError('VALIDATION', 'That username is taken', { field: 'username' });
    }
    throw err;
  }
}

export const LoginSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your email or username').max(254),
  password: z.string().min(1, 'Enter your password').max(128),
});

export async function authenticate(identifier: string, password: string) {
  const id = identifier.toLowerCase();
  const user = await prisma.user.findFirst({
    where: id.includes('@') ? { email: id } : { username: id },
  });
  if (!user) {
    await dummyVerify(password);
    throw new AppError('UNAUTHENTICATED', 'Incorrect email/username or password');
  }
  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok) throw new AppError('UNAUTHENTICATED', 'Incorrect email/username or password');
  if (user.status === 'BANNED') throw new AppError('ACCOUNT_LOCKED', 'This account has been banned.');
  return user;
}

// ── Password reset architecture ─────────────────────────────

const hash = (t: string) => createHash('sha256').update(t).digest('hex');

/**
 * Creates a single-use reset token (1h). In production this hands the link to
 * a Mailer; in development the link is printed by the dev mailer. Always
 * resolves the same way whether or not the email exists (no enumeration).
 */
export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return;
  const token = randomBytes(32).toString('base64url');
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + 3600_000) },
  });
  const link = `${env().APP_URL}/reset-password?token=${token}`;
  if (devToolsEnabled()) {
    // Dev mailer — never enabled in production.
    // eslint-disable-next-line no-console
    console.info(`\n[dev-mailer] Password reset for ${user.email}: ${link}\n`);
  } else {
    logger.info({ userId: user.id }, 'password reset requested (mailer not configured)');
  }
}

export async function resetPassword(token: string, password: string) {
  const invalid = () => new AppError('VALIDATION', 'This reset link is invalid or has expired.');
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hash(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) throw invalid();
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    // Single use: claim the token conditionally so concurrent submissions of
    // the same link cannot both succeed.
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw invalid();
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: row.userId } });
  });
}

/**
 * Change password and sign out every OTHER session (the caller's current
 * session, identified by its token hash, stays signed in).
 */
export async function changePassword(userId: string, current: string, next: string, keepSessionTokenHash?: string | null) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, current))) throw new AppError('VALIDATION', 'Current password is incorrect', { field: 'currentPassword' });
  const passwordHash = await hashPassword(next);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.session.deleteMany({
      where: { userId, ...(keepSessionTokenHash ? { tokenHash: { not: keepSessionTokenHash } } : {}) },
    }),
  ]);
}
