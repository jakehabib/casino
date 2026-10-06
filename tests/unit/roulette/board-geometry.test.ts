import { describe, it, expect } from 'vitest';
import { BET_CATALOGUE, isInside } from '@/engines/roulette/bets';
import { anchorOf, spotAt, toLogical, toPercent } from '@/components/games/roulette/board-geometry';

const ES = 0.2;
const EK = 0.2;

describe('board geometry', () => {
  const inside = BET_CATALOGUE.filter((s) => isInside(s.type));

  it('every inside bet is reachable by pointing at its own chip anchor', () => {
    for (const spot of inside) {
      const a = anchorOf(spot);
      expect(spotAt(a.s, a.k, ES, EK)?.id, spot.id).toBe(spot.id);
    }
  });

  it('every anchor is unique (chips never stack on top of a different bet)', () => {
    const keys = inside.map((s) => {
      const a = anchorOf(s);
      return `${a.s.toFixed(3)},${a.k.toFixed(3)}`;
    });
    expect(new Set(keys).size).toBe(inside.length);
  });

  it('maps cell centres, edges and intersections to the expected bets', () => {
    expect(spotAt(0.5, 0.5, ES, EK)?.id).toBe('STRAIGHT:1');
    expect(spotAt(5.5, 2.5, ES, EK)?.id).toBe('STRAIGHT:18');
    expect(spotAt(0.5, 1.02, ES, EK)?.id).toBe('SPLIT:1-2');
    expect(spotAt(0.97, 0.5, ES, EK)?.id).toBe('SPLIT:1-4');
    expect(spotAt(1, 1, ES, EK)?.id).toBe('CORNER:1-2-4-5');
    expect(spotAt(0.5, 0.05, ES, EK)?.id).toBe('STREET:1-2-3');
    expect(spotAt(0.5, -0.1, ES, EK)?.id).toBe('STREET:1-2-3');
    expect(spotAt(1.02, 0, ES, EK)?.id).toBe('SIX_LINE:1-2-3-4-5-6');
    expect(spotAt(-0.5, 1.5, ES, EK)?.id).toBe('STRAIGHT:0');
    expect(spotAt(0, 0.5, ES, EK)?.id).toBe('SPLIT:0-1');
    expect(spotAt(0, 1, ES, EK)?.id).toBe('STREET:0-1-2');
    expect(spotAt(0, 2, ES, EK)?.id).toBe('STREET:0-2-3');
    expect(spotAt(0, 0, ES, EK)?.id).toBe('CORNER:0-1-2-3');
    expect(spotAt(11.5, 2.95, ES, EK)?.id).toBe('STRAIGHT:36');
    expect(spotAt(12.5, 1, ES, EK)).toBeNull();
  });

  it('orientation transforms round-trip', () => {
    for (const o of ['horizontal', 'vertical'] as const) {
      const p = toPercent(o, 4.25, 1.75);
      const l = toLogical(o, parseFloat(p.left) / 100, parseFloat(p.top) / 100);
      expect(l.s).toBeCloseTo(4.25);
      expect(l.k).toBeCloseTo(1.75);
    }
  });
});
