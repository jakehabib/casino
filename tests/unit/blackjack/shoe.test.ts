import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { FairRng, type HmacFn } from '@/engines/fairness/rng';
import { buildShoe } from '@/engines/cards/cards';
import {
  CardSource,
  MIN_CARDS_FOR_ROUND,
  ShoeExhaustedError,
  newBlackjackShoe,
  shoeNeedsReshuffle,
  verifyBlackjackShoe,
} from '@/engines/blackjack';

const nodeHmac: HmacFn = (key, message) => createHmac('sha256', key).update(message).digest();

describe('blackjack shoe', () => {
  it('verifier reproduces the server shuffle exactly (pure-JS HMAC vs node crypto)', () => {
    const server = buildShoe(6, new FairRng('server-seed-abc', 'client-xyz', 7, nodeHmac));
    const verified = verifyBlackjackShoe('server-seed-abc', 'client-xyz', 7, 6);
    expect(verified).toEqual(server);
    expect(verified).toHaveLength(312);
    expect(new Set(verified.filter((c) => c === 'AS')).size).toBe(1);
    expect(verified.filter((c) => c === 'AS')).toHaveLength(6);
  });

  it('different nonces give different shoes', () => {
    expect(verifyBlackjackShoe('s', 'c', 1, 6)).not.toEqual(verifyBlackjackShoe('s', 'c', 2, 6));
  });

  it('places the cut card at penetration and keeps a round reserve', () => {
    const { cards, cutCard } = newBlackjackShoe(6, 0.75, new FairRng('s', 'c', 0, nodeHmac));
    expect(cards).toHaveLength(312);
    expect(cutCard).toBe(234);
    const one = newBlackjackShoe(1, 0.9, new FairRng('s', 'c', 0, nodeHmac));
    expect(one.cutCard).toBe(52 - MIN_CARDS_FOR_ROUND);
  });

  it('reshuffles only once the cut card is reached', () => {
    expect(shoeNeedsReshuffle(233, 234, 312)).toBe(false);
    expect(shoeNeedsReshuffle(234, 234, 312)).toBe(true);
    expect(shoeNeedsReshuffle(250, 234, 312)).toBe(true);
    expect(shoeNeedsReshuffle(40, 46, 52)).toBe(true); // < reserve left
  });

  it('CardSource deals forced cards first, then sequentially, across segments', () => {
    const src = new CardSource(
      [
        { cards: ['2S', '3S', '4S'], position: 1 },
        { cards: ['5H', '6H'], position: 0 },
      ],
      ['AS'],
    );
    expect([src.draw(), src.draw(), src.draw(), src.draw(), src.draw()]).toEqual(['AS', '3S', '4S', '5H', '6H']);
    expect(src.consumed).toEqual([2, 2]);
    expect(src.forcedUsed).toBe(1);
    expect(() => src.draw()).toThrow(ShoeExhaustedError);
  });
});
