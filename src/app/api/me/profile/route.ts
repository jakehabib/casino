import { z } from 'zod';
import { route } from '@/server/api/handler';
import { prisma, isUniqueViolation } from '@/server/db';
import { AppError } from '@/lib/errors';
import { UsernameSchema } from '@/server/services/account/account-service';

const Body = z.object({
  username: UsernameSchema.optional(),
  avatarUrl: z.string().regex(/^preset:\d{1,2}$/).optional(),
  privacy: z.enum(['PUBLIC', 'LIMITED', 'PRIVATE']).optional(),
  hideNetResult: z.boolean().optional(),
  hideTotalWagered: z.boolean().optional(),
  hideTotalWon: z.boolean().optional(),
  hideLargestWin: z.boolean().optional(),
});

export const GET = route({ auth: true }, async ({ user }) => {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: {
      username: true,
      displayName: true,
      avatarUrl: true,
      privacy: true,
      hideNetResult: true,
      hideTotalWagered: true,
      hideTotalWon: true,
      hideLargestWin: true,
      email: true,
    },
  });
  return u;
});

export const PATCH = route({ auth: true, body: Body, rateLimit: { bucket: 'profile', limit: 30, windowSec: 60 } }, async ({ user, body }) => {
  const { username, ...rest } = body;
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        ...rest,
        ...(username ? { username: username.toLowerCase(), displayName: username } : {}),
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError('VALIDATION', 'That username is taken', { field: 'username' });
    throw err;
  }
  return { ok: true };
});
