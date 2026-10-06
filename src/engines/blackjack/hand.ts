import { rankOf, type Card } from '../cards/cards';

/** Blackjack point value of a card (ace counted as 1; see handValue). */
export function cardPoints(c: Card): number {
  const r = rankOf(c);
  if (r === 'A') return 1;
  if (r === 'T' || r === 'J' || r === 'Q' || r === 'K') return 10;
  return Number(r);
}

export function isTenValue(c: Card): boolean {
  return cardPoints(c) === 10;
}

export function isAce(c: Card): boolean {
  return rankOf(c) === 'A';
}

export interface HandValue {
  /** Best total (≤ 21 when possible). */
  total: number;
  /** True when an ace is being counted as 11. */
  soft: boolean;
}

/** Best blackjack total of a set of cards; one ace may count as 11. */
export function handValue(cards: readonly Card[]): HandValue {
  let hard = 0;
  let aces = 0;
  for (const c of cards) {
    hard += cardPoints(c);
    if (isAce(c)) aces++;
  }
  if (aces > 0 && hard + 10 <= 21) return { total: hard + 10, soft: true };
  return { total: hard, soft: false };
}

/** A two-card 21 (natural). Whether it *pays* as blackjack also depends on split status. */
export function isBlackjack(cards: readonly Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

export function isBust(cards: readonly Card[]): boolean {
  return handValue(cards).total > 21;
}

/** Dealer drawing rule: hit below 17, and on soft 17 when H17 is in force. */
export function dealerShouldHit(cards: readonly Card[], hitsSoft17: boolean): boolean {
  const v = handValue(cards);
  if (v.total < 17) return true;
  return v.total === 17 && v.soft && hitsSoft17;
}

/** Splittable pair: identical ranks only (K-K yes, K-Q no). */
export function isPair(cards: readonly Card[]): boolean {
  return cards.length === 2 && rankOf(cards[0]) === rankOf(cards[1]);
}

/** Gross return of a winning blackjack: stake + floor(stake × ratio). */
export function blackjackReturn(bet: bigint, ratio: '3:2' | '6:5'): bigint {
  return ratio === '6:5' ? bet + (bet * 6n) / 5n : bet + (bet * 3n) / 2n;
}

/** Insurance stake: half the base bet (integer floor). */
export function insuranceStake(baseBet: bigint): bigint {
  return baseBet / 2n;
}
