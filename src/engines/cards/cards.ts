import { type Rng, shuffle } from '../fairness/rng';

/** Card code: rank + suit, e.g. "AS", "TD", "9H". T = ten. */
export type Card = string;
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'] as const;
export const SUITS = ['S', 'H', 'D', 'C'] as const;
export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];

export function rankOf(c: Card): Rank {
  return c[0] as Rank;
}
export function suitOf(c: Card): Suit {
  return c[1] as Suit;
}
export function isRed(c: Card): boolean {
  const s = suitOf(c);
  return s === 'H' || s === 'D';
}

/** Ordered (unshuffled) multi-deck shoe: deck-by-deck, suit-major, rank-minor. */
export function orderedShoe(decks: number): Card[] {
  const out: Card[] = [];
  for (let d = 0; d < decks; d++) for (const s of SUITS) for (const r of RANKS) out.push(r + s);
  return out;
}

/**
 * Build a shuffled shoe from the fairness RNG. Verifiable: given the seed
 * triple, anyone can rebuild the exact card order with this function.
 */
export function buildShoe(decks: number, rng: Rng): Card[] {
  return shuffle(orderedShoe(decks), rng);
}

/**
 * Cut-card position from penetration (0–1). E.g. 6 decks @ 0.75 → reshuffle
 * after 234 cards have been dealt (checked between rounds only).
 */
export function cutCardPosition(totalCards: number, penetration: number): number {
  return Math.floor(totalCards * Math.min(0.95, Math.max(0.5, penetration)));
}
