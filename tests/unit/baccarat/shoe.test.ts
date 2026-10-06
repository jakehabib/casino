import { describe, it, expect } from 'vitest';
import { newBaccaratShoe, shoeNeedsReshuffle } from '@/engines/baccarat/shoe';
import { playBaccarat, resolveBaccarat } from '@/engines/baccarat/engine';
import { verifyBaccaratShoe } from '@/engines/baccarat/verify';
import { beadPlateColumns, shoeCounts } from '@/engines/baccarat/roadmap';
import { FairRng, jsHmac } from '@/engines/fairness/rng';
import { orderedShoe } from '@/engines/cards/cards';

describe('shoe', () => {
  it('8-deck shoe has 416 cards, each card exactly 8 times; cut card at 80%', () => {
    const { cards, cutCard } = newBaccaratShoe(8, 0.8, new FairRng('s', 'c', 0, jsHmac));
    expect(cards).toHaveLength(416);
    expect([...cards].sort()).toEqual(orderedShoe(8).sort());
    expect(cutCard).toBe(332);
  });
  it('cut card always leaves room for a full round', () => {
    const { cutCard } = newBaccaratShoe(1, 0.95, new FairRng('s', 'c', 0, jsHmac));
    expect(cutCard).toBeLessThanOrEqual(52 - 6);
  });
  it('is deterministic and verifiable from the seed triple', () => {
    const a = newBaccaratShoe(8, 0.8, new FairRng('server', 'client', 7, jsHmac)).cards;
    expect(verifyBaccaratShoe('server', 'client', 7, 8)).toEqual(a);
    expect(verifyBaccaratShoe('server', 'client', 8, 8)).not.toEqual(a);
  });
  it('reshuffles only between rounds once the cut card is reached (exhaustion)', () => {
    const { cards, cutCard } = newBaccaratShoe(8, 0.8, new FairRng('x', 'y', 1, jsHmac));
    let pos = 0;
    let rounds = 0;
    while (!shoeNeedsReshuffle(pos, cutCard, cards.length)) {
      const r = playBaccarat(() => {
        if (pos >= cards.length) throw new Error('exhausted');
        return cards[pos++];
      });
      expect(r.used).toBeGreaterThanOrEqual(4);
      rounds++;
    }
    // The round that crossed the cut card completes; dealing stops after it.
    expect(pos).toBeGreaterThanOrEqual(cutCard);
    expect(pos).toBeLessThan(cutCard + 6);
    expect(rounds).toBeGreaterThan(60);
    expect(shoeNeedsReshuffle(cutCard - 1, cutCard, cards.length)).toBe(false);
    expect(shoeNeedsReshuffle(cutCard, cutCard, cards.length)).toBe(true);
    // Too few cards left for a guaranteed round also forces a reshuffle.
    expect(shoeNeedsReshuffle(48, 1000, 52)).toBe(true);
  });
  it('verifier replays a round from shoe positions', () => {
    const shoe = verifyBaccaratShoe('abc', 'def', 3, 8);
    const r = resolveBaccarat(shoe.slice(10, 16));
    expect(r.deal[0].card).toBe(shoe[10]);
  });
});

describe('bead plate', () => {
  it('fills column-major, 6 rows per column', () => {
    const cols = beadPlateColumns([1, 2, 3, 4, 5, 6, 7, 8], 6);
    expect(cols).toEqual([[1, 2, 3, 4, 5, 6], [7, 8, null, null, null, null]]);
  });
  it('pads to a minimum width', () => {
    expect(beadPlateColumns([], 6, 3)).toHaveLength(3);
  });
  it('counts outcomes', () => {
    expect(shoeCounts([{ outcome: 'PLAYER', natural: true }, { outcome: 'TIE' }, { outcome: 'BANKER' }, { outcome: 'BANKER' }])).toEqual({
      player: 1,
      banker: 2,
      tie: 1,
      naturals: 1,
      total: 4,
    });
  });
});
