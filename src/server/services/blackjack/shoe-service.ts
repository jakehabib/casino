import type { CardShoe } from '@prisma/client';
import { type Tx } from '@/server/db';
import { AppError } from '@/lib/errors';
import { drawSeed } from '@/server/services/fairness/seed-service';
import { newBlackjackShoe, shoeNeedsReshuffle, type Card } from '@/engines/blackjack';

/**
 * Per-user Blackjack shoe (CardShoe, game = 'BLACKJACK').
 *
 *  • Shuffled ONCE from the user's fairness seed pair (drawSeed reserves a
 *    nonce) with buildShoe(decks, rng); the order is never sent to clients.
 *  • Dealt sequentially from `position`. Reshuffles (retire + new shoe) only
 *    happen BETWEEN rounds, once the cut card is reached, the table's deck
 *    count changed, or the shoe was retired by a seed rotation.
 *  • Every position change is version-checked (optimistic concurrency) on top
 *    of the wallet row lock that already serialises a user's requests.
 */
export const SHOE_GAME = 'BLACKJACK';

export interface ShoeInfo {
  id: string | null;
  number: number;
  decks: number;
  total: number;
  dealt: number;
  remaining: number;
  cutCard: number;
  /** 0–1 share of the shoe already dealt. */
  penetration: number;
  /** The cut card has been reached: the next round opens a fresh shoe. */
  reshuffleNext: boolean;
}

export function shoeCards(shoe: Pick<CardShoe, 'cards'>): Card[] {
  return shoe.cards as unknown as Card[];
}

export async function openShoe(tx: Tx, userId: string, decks: number, penetration: number): Promise<CardShoe> {
  const draw = await drawSeed(tx, userId);
  const { cards, cutCard } = newBlackjackShoe(decks, penetration, draw.rng);
  return tx.cardShoe.create({
    data: { userId, game: SHOE_GAME, decks, cards, cutCard, position: 0, serverSeedId: draw.seedId, nonce: draw.nonce },
  });
}

export async function retireShoe(tx: Tx, shoeId: string) {
  await tx.cardShoe.updateMany({
    where: { id: shoeId, status: 'ACTIVE' },
    data: { status: 'RETIRED', retiredAt: new Date(), version: { increment: 1 } },
  });
}

export function activeShoe(tx: Tx, userId: string) {
  return tx.cardShoe.findFirst({ where: { userId, game: SHOE_GAME, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } });
}

/**
 * The shoe the next round is dealt from. Called at deal time only (between
 * rounds), so this is the only place a reshuffle can happen.
 */
export async function shoeForNewRound(tx: Tx, userId: string, cfg: { decks: number; penetration: number }): Promise<{ shoe: CardShoe; reshuffled: boolean }> {
  const current = await activeShoe(tx, userId);
  if (current) {
    const seed = await tx.serverSeed.findUnique({ where: { id: current.serverSeedId }, select: { status: true } });
    const total = shoeCards(current).length;
    const stale =
      seed?.status !== 'ACTIVE' || current.decks !== cfg.decks || shoeNeedsReshuffle(current.position, current.cutCard, total);
    if (!stale) return { shoe: current, reshuffled: false };
    await retireShoe(tx, current.id);
  }
  // Defensive: never leave more than one active shoe behind.
  await tx.cardShoe.updateMany({
    where: { userId, game: SHOE_GAME, status: 'ACTIVE' },
    data: { status: 'RETIRED', retiredAt: new Date() },
  });
  return { shoe: await openShoe(tx, userId, cfg.decks, cfg.penetration), reshuffled: current !== null };
}

/** Advance a shoe's position by `count`, version-checked. */
export async function advanceShoe(tx: Tx, shoe: Pick<CardShoe, 'id' | 'version'>, count: number, opts: { newRound?: boolean } = {}) {
  if (count <= 0 && !opts.newRound) return;
  const res = await tx.cardShoe.updateMany({
    where: { id: shoe.id, version: shoe.version },
    data: {
      position: { increment: count },
      version: { increment: 1 },
      ...(opts.newRound ? { roundsDealt: { increment: 1 } } : {}),
    },
  });
  if (res.count !== 1) throw new AppError('CONFLICT', 'The shoe changed during this request. Please retry.');
}

export async function shoeNumber(tx: Tx, userId: string, createdAt?: Date) {
  return tx.cardShoe.count({ where: { userId, game: SHOE_GAME, ...(createdAt ? { createdAt: { lte: createdAt } } : {}) } });
}

/** Public shoe status (no card order). With no shoe yet, describes the next fresh shoe. */
export async function shoeInfo(tx: Tx, userId: string, cfg: { decks: number; penetration: number }): Promise<ShoeInfo> {
  const shoe = await activeShoe(tx, userId);
  if (!shoe) {
    const total = cfg.decks * 52;
    const n = await shoeNumber(tx, userId);
    const cutCard = Math.floor(total * cfg.penetration);
    return { id: null, number: n + 1, decks: cfg.decks, total, dealt: 0, remaining: total, cutCard, penetration: 0, reshuffleNext: false };
  }
  const total = shoeCards(shoe).length;
  const n = await shoeNumber(tx, userId, shoe.createdAt);
  return {
    id: shoe.id,
    number: n,
    decks: shoe.decks,
    total,
    dealt: shoe.position,
    remaining: total - shoe.position,
    cutCard: shoe.cutCard,
    penetration: total ? shoe.position / total : 0,
    reshuffleNext: shoeNeedsReshuffle(shoe.position, shoe.cutCard, total) || shoe.decks !== cfg.decks,
  };
}
