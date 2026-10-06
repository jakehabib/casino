import { NextResponse } from 'next/server';
import { route } from '@/server/api/handler';
import { devToolsEnabled } from '@/server/env';
import { prisma } from '@/server/db';
import { activeShoe, shoeCards, shoeNumber } from '@/server/services/blackjack/shoe-service';

/** GET /api/games/blackjack/dev/shoe — DEV ONLY: the active shoe's next cards for the dev panel. */
export const GET = route({ devOnly: true, auth: true }, async ({ user }) => {
  if (!devToolsEnabled()) return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
  const shoe = await activeShoe(prisma, user.id);
  if (!shoe) return { shoe: null };
  const cards = shoeCards(shoe);
  return {
    shoe: {
      id: shoe.id,
      number: await shoeNumber(prisma, user.id, shoe.createdAt),
      decks: shoe.decks,
      position: shoe.position,
      cutCard: shoe.cutCard,
      total: cards.length,
      remaining: cards.length - shoe.position,
      roundsDealt: shoe.roundsDealt,
      next: cards.slice(shoe.position, shoe.position + 10),
    },
  };
});
