import { buildShoe, cutCardPosition, type Card } from '../cards/cards';
import type { Rng } from '../fairness/rng';
import { MAX_CARDS_PER_ROUND } from './engine';

/**
 * Shoe lifecycle (pure). The shoe is shuffled once from the fairness RNG; the
 * cut card is placed at `penetration` of the shoe. Reshuffles happen only
 * BETWEEN rounds: once the position has reached the cut card (or too few cards
 * remain to guarantee a full round), the next deal opens a fresh shoe.
 */
export function newBaccaratShoe(decks: number, penetration: number, rng: Rng): { cards: Card[]; cutCard: number } {
  const cards = buildShoe(decks, rng);
  return { cards, cutCard: Math.min(cutCardPosition(cards.length, penetration), cards.length - MAX_CARDS_PER_ROUND) };
}

export function shoeNeedsReshuffle(position: number, cutCard: number, totalCards: number): boolean {
  return position >= cutCard || totalCards - position < MAX_CARDS_PER_ROUND;
}
