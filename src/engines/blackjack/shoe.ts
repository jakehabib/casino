import { buildShoe, cutCardPosition, type Card } from '../cards/cards';
import type { Rng } from '../fairness/rng';

/**
 * Shoe lifecycle (pure). A shoe is shuffled once from the fairness RNG and
 * dealt sequentially. The cut card sits at `penetration` of the shoe; once the
 * position reaches it the NEXT deal opens a fresh shoe (never mid-round).
 */

/** Below this many cards a new round always starts from a fresh shoe. */
export const MIN_CARDS_FOR_ROUND = 20;

export function newBlackjackShoe(decks: number, penetration: number, rng: Rng): { cards: Card[]; cutCard: number } {
  const cards = buildShoe(decks, rng);
  const cut = cutCardPosition(cards.length, penetration);
  return { cards, cutCard: Math.max(1, Math.min(cut, cards.length - MIN_CARDS_FOR_ROUND)) };
}

export function shoeNeedsReshuffle(position: number, cutCard: number, totalCards: number): boolean {
  return position >= cutCard || totalCards - position < MIN_CARDS_FOR_ROUND;
}

/** Thrown by a card source that has run out mid-round (handled by the service). */
export class ShoeExhaustedError extends Error {
  constructor() {
    super('Shoe exhausted');
  }
}

/**
 * Sequential card source: forced (dev) cards first, then the shoe segments in
 * order. Throws ShoeExhaustedError when every segment is spent so the caller
 * can open a continuation shoe and replay the (pure) step.
 */
export class CardSource {
  private forced: Card[];
  private seg = 0;
  readonly consumed: number[];
  forcedUsed = 0;

  constructor(
    private readonly segments: { cards: Card[]; position: number }[],
    forced: Card[] = [],
  ) {
    this.forced = [...forced];
    this.consumed = segments.map(() => 0);
  }

  draw = (): Card => {
    if (this.forced.length) {
      this.forcedUsed++;
      return this.forced.shift()!;
    }
    while (this.seg < this.segments.length) {
      const s = this.segments[this.seg];
      const at = s.position + this.consumed[this.seg];
      if (at < s.cards.length) {
        this.consumed[this.seg]++;
        return s.cards[at];
      }
      this.seg++;
    }
    throw new ShoeExhaustedError();
  };

  remainingForced(): Card[] {
    return [...this.forced];
  }
}
