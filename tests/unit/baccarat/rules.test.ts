import { describe, it, expect } from 'vitest';
import { bankerDraws, cardValue, handTotal, isNatural, playerDraws } from '@/engines/baccarat/rules';
import { RANKS, SUITS } from '@/engines/cards/cards';

/**
 * Standard Punto Banco banker tableau, written out literally (independent of
 * the implementation). Rows: banker two-card total 0–7. Columns: player third
 * card value 0..9, then "player stood" (no third card).
 *   D = banker draws, S = banker stands
 */
const TABLEAU: Record<number, string> = {
  //   P3: 0 1 2 3 4 5 6 7 8 9  none
  0: 'D D D D D D D D D D  D',
  1: 'D D D D D D D D D D  D',
  2: 'D D D D D D D D D D  D',
  3: 'D D D D D D D D S D  D',
  4: 'S S D D D D D D S S  D',
  5: 'S S S S D D D D S S  D',
  6: 'S S S S S S D D S S  S',
  7: 'S S S S S S S S S S  S',
};

describe('card values', () => {
  it('Ace = 1, 2–9 face value, 10/J/Q/K = 0, for every suit', () => {
    const expected: Record<string, number> = { A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 0, J: 0, Q: 0, K: 0 };
    for (const r of RANKS) for (const s of SUITS) expect(cardValue(r + s)).toBe(expected[r]);
  });
  it('rejects invalid cards', () => {
    expect(() => cardValue('XS')).toThrow();
  });
  it('totals are modulo 10', () => {
    expect(handTotal(['9S', '9H'])).toBe(8);
    expect(handTotal(['KS', 'QH'])).toBe(0);
    expect(handTotal(['7S', '6H', '8D'])).toBe(1);
    expect(handTotal(['AS', 'TH'])).toBe(1);
    expect(handTotal(['5S', '5H'])).toBe(0);
  });
  it('naturals are 8 and 9 only', () => {
    for (let t = 0; t <= 9; t++) expect(isNatural(t)).toBe(t >= 8);
  });
});

describe('player rule', () => {
  it('draws on 0–5, stands on 6–7', () => {
    for (let t = 0; t <= 7; t++) expect(playerDraws(t)).toBe(t <= 5);
  });
});

describe('banker tableau — every banker total × every player third card', () => {
  for (let b = 0; b <= 7; b++) {
    const cells = TABLEAU[b].split(/\s+/);
    expect(cells).toHaveLength(11);
    for (let p3 = 0; p3 <= 9; p3++) {
      it(`banker ${b}, player third ${p3} → ${cells[p3] === 'D' ? 'draws' : 'stands'}`, () => {
        expect(bankerDraws(b, p3)).toBe(cells[p3] === 'D');
      });
    }
    it(`banker ${b}, player stood → ${cells[10] === 'D' ? 'draws' : 'stands'}`, () => {
      expect(bankerDraws(b, null)).toBe(cells[10] === 'D');
    });
  }
});
