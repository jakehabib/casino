import { route } from '@/server/api/handler';
import { prisma } from '@/server/db';

/** Distinct recently-played game ids (lobby "Recently Played"). */
export const GET = route({ auth: true }, async ({ user }) => {
  const rows = await prisma.gameHistory.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: { game: true, gameVariant: true, createdAt: true },
  });
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const r of rows) {
    const id = r.game === 'SLOTS' ? r.gameVariant ?? 'gilded-vault' : r.game === 'CRASH' ? 'crash' : r.game.toLowerCase();
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return { games: ids };
});
