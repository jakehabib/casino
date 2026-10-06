import { createHash, randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { prisma } from '@/server/db';
import { authenticate, changePassword, resetPassword } from '@/server/services/account/account-service';
import { hashToken } from '@/server/auth/tokens';
import { createTestUser } from './helpers';

const sha = (t: string) => createHash('sha256').update(t).digest('hex');

async function issueResetToken(userId: string) {
  const token = randomBytes(32).toString('base64url');
  await prisma.passwordResetToken.create({ data: { userId, tokenHash: sha(token), expiresAt: new Date(Date.now() + 3600_000) } });
  return token;
}

async function addSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 86400_000) } });
  return token;
}

describe('account security', () => {
  it('a reset link is single-use even when submitted concurrently', async () => {
    const user = await createTestUser();
    const token = await issueResetToken(user.id);
    const results = await Promise.allSettled([
      resetPassword(token, 'first-pass-123'),
      resetPassword(token, 'second-pass-123'),
      resetPassword(token, 'third-pass-123'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    // Exactly one of the passwords works.
    const works = await Promise.all(
      ['first-pass-123', 'second-pass-123', 'third-pass-123'].map((pw) => authenticate(user.username, pw).then(() => true, () => false)),
    );
    expect(works.filter(Boolean)).toHaveLength(1);
    await expect(resetPassword(token, 'fourth-pass-123')).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('a reset signs out every session', async () => {
    const user = await createTestUser();
    await addSession(user.id);
    await addSession(user.id);
    await resetPassword(await issueResetToken(user.id), 'brand-new-123');
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('changing the password signs out other sessions but keeps the current one', async () => {
    const user = await createTestUser();
    const current = await addSession(user.id);
    await addSession(user.id);
    await addSession(user.id);
    await changePassword(user.id, 'password123', 'changed-pass-123', hashToken(current));
    const left = await prisma.session.findMany({ where: { userId: user.id } });
    expect(left.map((s) => s.tokenHash)).toEqual([hashToken(current)]);
    await expect(authenticate(user.username, 'changed-pass-123')).resolves.toBeTruthy();
  });

  it('rejects a wrong current password without touching sessions', async () => {
    const user = await createTestUser();
    await addSession(user.id);
    await expect(changePassword(user.id, 'nope-nope', 'changed-pass-123', null)).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
  });
});
