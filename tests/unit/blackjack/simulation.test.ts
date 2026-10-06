import { describe, it, expect } from 'vitest';
import { FastRng } from '@/engines/fairness/rng';
import { buildShoe } from '@/engines/cards/cards';
import {
  DEFAULT_RULES,
  applyAction,
  handValue,
  isBlackjack,
  legalActions,
  startRound,
  type BlackjackRules,
} from '@/engines/blackjack';

/**
 * Randomised invariants over many rounds with random legal decisions:
 * money conservation, dealer drawing rules, card accounting.
 */
function simulate(rules: BlackjackRules, rounds: number, seed: number) {
  const rng = new FastRng(seed);
  let shoe = buildShoe(rules.decks, rng);
  let pos = 0;
  const draw = () => {
    if (pos >= shoe.length) {
      shoe = buildShoe(rules.decks, rng);
      pos = 0;
    }
    return shoe[pos++];
  };
  for (let r = 0; r < rounds; r++) {
    const bet = BigInt(100 + rng.int(5000));
    let { state, stake } = startRound(rules, bet, draw);
    let staked = stake;
    let guard = 0;
    while (state.phase !== 'SETTLED') {
      const legal = legalActions(state);
      expect(legal.length).toBeGreaterThan(0);
      const a = legal[rng.int(legal.length)];
      const step = applyAction(state, a, draw);
      staked += step.stake;
      state = step.state;
      if (++guard > 60) throw new Error('round did not terminate');
    }
    // Money: stakes equal totalWagered; payout equals the sum of components.
    expect(BigInt(state.totalWagered)).toBe(staked);
    const sum = state.hands.reduce((a, h) => a + BigInt(h.payout), 0n) + BigInt(state.insurance.payout);
    expect(BigInt(state.totalPayout)).toBe(sum);
    expect(state.hands.length).toBeLessThanOrEqual(rules.maxHands);
    // Card accounting: every drawn id appears exactly once.
    const ids = [...state.dealer.ids, ...state.hands.flatMap((h) => h.ids)].sort((a, b) => a - b);
    expect(ids).toEqual(Array.from({ length: state.drawn }, (_, i) => i));
    // Dealer rule: if the dealer drew past the initial two, they finished ≥ 17.
    const dv = handValue(state.dealer.cards);
    if (state.dealer.cards.length > 2) {
      expect(dv.total).toBeGreaterThanOrEqual(17);
      const before = handValue(state.dealer.cards.slice(0, -1));
      expect(before.total < 17 || (rules.dealerHitsSoft17 && before.total === 17 && before.soft)).toBe(true);
    }
    for (const h of state.hands) {
      const pv = handValue(h.cards).total;
      if (h.outcome === 'BUST') expect(pv).toBeGreaterThan(21);
      if (h.outcome === 'BLACKJACK') expect(isBlackjack(h.cards) && !h.fromSplit).toBe(true);
      if (h.splitAces && !rules.hitSplitAces) expect(h.cards.length).toBe(2);
      if (h.doubled) expect(h.cards.length).toBe(3);
    }
  }
}

describe('blackjack engine simulation', () => {
  it('holds invariants over 20k random rounds (S17, 3:2)', () => {
    simulate(DEFAULT_RULES, 20_000, 1);
  });
  it('holds invariants with H17, 6:5, resplit/hit aces, 1 deck', () => {
    simulate({ ...DEFAULT_RULES, decks: 1, dealerHitsSoft17: true, blackjackPayout: '6:5', resplitAces: true, hitSplitAces: true }, 10_000, 7);
  });
  it('holds invariants with max 2 hands, no DAS, no insurance', () => {
    simulate({ ...DEFAULT_RULES, maxHands: 2, doubleAfterSplit: false, insurance: false }, 10_000, 99);
  });
});
