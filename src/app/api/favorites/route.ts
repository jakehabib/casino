import { z } from 'zod';
import { route } from '@/server/api/handler';
import { prisma } from '@/server/db';
import { GAMES } from '@/lib/games';

export const GET = route({ auth: true }, async ({ user }) => {
  const rows = await prisma.favoriteGame.findMany({ where: { userId: user.id }, select: { gameId: true } });
  return { favorites: rows.map((r) => r.gameId) };
});

export const POST = route(
  { auth: true, body: z.object({ gameId: z.enum(GAMES.map((g) => g.id) as [string, ...string[]]), favorite: z.boolean() }) },
  async ({ user, body }) => {
    if (body.favorite) {
      await prisma.favoriteGame.upsert({
        where: { userId_gameId: { userId: user.id, gameId: body.gameId } },
        create: { userId: user.id, gameId: body.gameId },
        update: {},
      });
    } else {
      await prisma.favoriteGame.deleteMany({ where: { userId: user.id, gameId: body.gameId } });
    }
    return { ok: true };
  },
);
