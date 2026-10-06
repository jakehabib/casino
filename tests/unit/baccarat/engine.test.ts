import { describe, it, expect } from 'vitest';
import { resolveBaccarat, dealOrderFromHands, playBaccarat, MAX_CARDS_PER_ROUND } from '@/engines/baccarat/engine';
import { bankerDraws, cardValue } from '@/engines/baccarat/rules';
import { RANKS } from '@/engines/cards/cards';
import { FastRng } from '@/engines/fairness/rng';
import { buildShoe } from '@/engines/cards/cards';

/** Card of a given baccarat value in a given suit. */
const v = (n: number, s = 'S') => (n === 0 ? 'K' : n === 1 ? 'A' : String(n)) + s;

describe('naturals', () => {
  it('player natural 9 — both stand, player wins', () => {
    const r = resolveBaccarat(['4S', '2H', '5D', '3C', '9S', '9H']);
    expect(r.playerTotal).toBe(9);
    expect(r.bankerTotal).toBe(5);
    expect(r.natural).toBe(true);
    expect(r.naturalSide).toBe('PLAYER');
    expect(r.playerCards).toHaveLength(2);
    expect(r.bankerCards).toHaveLength(2);
    expect(r.outcome).toBe('PLAYER');
    expect(r.used).toBe(4);
  });
  it('player natural 8 — banker with 0 still stands', () => {
    const r = resolveBaccarat(['4S', 'KH', '4D', 'QC', '9S', '9H']);
    expect(r.playerTotal).toBe(8);
    expect(r.bankerTotal).toBe(0);
    expect(r.bankerDrew).toBe(false);
    expect(r.outcome).toBe('PLAYER');
  });
  it('banker natural 9 — player with 0 does not draw', () => {
    const r = resolveBaccarat(['KS', '4H', 'QD', '5C', '9S']);
    expect(r.naturalSide).toBe('BANKER');
    expect(r.playerDrew).toBe(false);
    expect(r.outcome).toBe('BANKER');
  });
  it('banker natural 8 vs player 7', () => {
    const r = resolveBaccarat(['3S', '4H', '4D', '4C']);
    expect(r.bankerTotal).toBe(8);
    expect(r.playerTotal).toBe(7);
    expect(r.outcome).toBe('BANKER');
    expect(r.natural).toBe(true);
  });
  it('both naturals: 8 vs 9 and equal-natural tie', () => {
    const a = resolveBaccarat(['4S', '4H', '4D', '5C']);
    expect(a.naturalSide).toBe('BOTH');
    expect(a.outcome).toBe('BANKER');
    const b = resolveBaccarat(['9S', '9H', 'KD', 'KC']);
    expect(b.outcome).toBe('TIE');
    expect(b.playerTotal).toBe(9);
    expect(b.naturalSide).toBe('BOTH');
  });
});

describe('player stand / draw', () => {
  it('player 6 stands; banker 5 draws (player stood)', () => {
    const r = resolveBaccarat(['3S', '2H', '3D', '3C', 'AS']);
    expect(r.playerDrew).toBe(false);
    expect(r.bankerDrew).toBe(true);
    expect(r.bankerTotal).toBe(6);
    expect(r.outcome).toBe('TIE');
  });
  it('player 7 stands; banker 6 stands', () => {
    const r = resolveBaccarat(['3S', '3H', '4D', '3C', '9S']);
    expect(r.playerDrew).toBe(false);
    expect(r.bankerDrew).toBe(false);
    expect(r.outcome).toBe('PLAYER');
    expect(r.used).toBe(4);
  });
  it('player 5 draws; third card dealt to player first, totals tracked per step', () => {
    const r = resolveBaccarat(['2S', '3H', '3D', '4C', '2H', 'KD']);
    expect(r.playerDrew).toBe(true);
    expect(r.playerCards).toEqual(['2S', '3D', '2H']);
    // banker 7 stands
    expect(r.bankerDrew).toBe(false);
    expect(r.deal.map((d) => d.side)).toEqual(['PLAYER', 'BANKER', 'PLAYER', 'BANKER', 'PLAYER']);
    expect(r.deal.map((d) => d.third)).toEqual([false, false, false, false, true]);
    expect(r.deal.map((d) => [d.playerTotal, d.bankerTotal])).toEqual([[2, 0], [2, 3], [5, 3], [5, 7], [7, 7]]);
    expect(r.outcome).toBe('TIE');
  });
  it('player 0 draws for every banker non-natural total', () => {
    for (let b = 0; b <= 7; b++) {
      const r = resolveBaccarat(['KS', v(b === 0 ? 0 : 1, 'H'), 'QD', v(b === 0 ? 0 : b - 1, 'C'), '5S', '5H']);
      expect(r.bankerInitial).toBe(b);
      expect(r.playerDrew).toBe(true);
    }
  });
});

describe('full round: banker third-card decision matches the tableau for every case', () => {
  // Construct every combination of banker two-card total (0–7) and player
  // third card value (0–9) via an actual dealt round.
  for (let b = 0; b <= 7; b++) {
    for (let p3 = 0; p3 <= 9; p3++) {
      it(`banker ${b} vs player third ${p3}`, () => {
        // Player two-card total 0 (draws). Banker: b split as (b, 0).
        const cards = ['KS', v(b, 'H'), 'QS', 'KD', v(p3, 'C'), '9D'];
        const r = resolveBaccarat(cards);
        expect(r.playerInitial).toBe(0);
        expect(r.bankerInitial).toBe(b);
        expect(r.playerDrew).toBe(true);
        expect(cardValue(r.playerCards[2])).toBe(p3);
        expect(r.bankerDrew).toBe(bankerDraws(b, p3));
        expect(r.used).toBe(r.bankerDrew ? 6 : 5);
      });
    }
  }
});

describe('ties and sequence handling', () => {
  it('tie after both draw', () => {
    const r = resolveBaccarat(['AS', '2H', 'AD', '2C', '4S', '3H']);
    // P: 1+1=2 draws 4 → 6. B: 4, P3=4 → draws 3 → 7. Banker wins.
    expect(r.outcome).toBe('BANKER');
    const t = resolveBaccarat(['AS', '2H', 'AD', '2C', '4S', '2D']);
    expect(t.playerTotal).toBe(6);
    expect(t.bankerTotal).toBe(6);
    expect(t.outcome).toBe('TIE');
  });
  it('detects pairs on the first two cards (future side bets)', () => {
    const r = resolveBaccarat(['8S', '3H', '8D', '3C']);
    expect(r.playerPair).toBe(true);
    expect(r.bankerPair).toBe(true);
  });
  it('throws when the sequence runs out', () => {
    expect(() => resolveBaccarat(['AS', '2H', 'AD'])).toThrow();
    expect(() => resolveBaccarat(['AS', '2H', 'AD', '2C'])).toThrow(); // player 2 must draw
  });
  it('dealOrderFromHands reproduces the deal sequence', () => {
    for (let i = 0; i < 300; i++) {
      const shoe = buildShoe(1, new FastRng(i + 1));
      const r = resolveBaccarat(shoe);
      expect(dealOrderFromHands(r.playerCards, r.bankerCards)).toEqual(shoe.slice(0, r.used));
      expect(resolveBaccarat(dealOrderFromHands(r.playerCards, r.bankerCards))).toEqual(r);
    }
  });
});

describe('simulation sanity (8-deck, FastRng)', () => {
  it('outcome frequencies are close to theory (B 45.86%, P 44.62%, T 9.52%)', () => {
    const rng = new FastRng(12345);
    const counts = { PLAYER: 0, BANKER: 0, TIE: 0 };
    let n = 0;
    for (let s = 0; s < 60; s++) {
      const shoe = buildShoe(8, rng);
      let pos = 0;
      while (pos < 330) {
        const r = playBaccarat(() => shoe[pos++]);
        expect(r.used).toBeLessThanOrEqual(MAX_CARDS_PER_ROUND);
        counts[r.outcome]++;
        n++;
      }
    }
    expect(counts.BANKER / n).toBeGreaterThan(0.44);
    expect(counts.BANKER / n).toBeLessThan(0.475);
    expect(counts.PLAYER / n).toBeGreaterThan(0.43);
    expect(counts.PLAYER / n).toBeLessThan(0.462);
    expect(counts.TIE / n).toBeGreaterThan(0.085);
    expect(counts.TIE / n).toBeLessThan(0.106);
  });
  it('uses ranks from the full range', () => {
    expect(RANKS).toHaveLength(13);
  });
});
