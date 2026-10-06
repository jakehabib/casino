import { describe, it, expect } from 'vitest';
import { compile, evaluateClusters, evaluateLines, evaluateWays, gravityPlan } from '@/engines/slots/engine';
import { gildedVault } from '@/engines/slots/definitions';
import type { SpinWin } from '@/engines/slots/types';
import { gridFromRows, testDef } from './helpers';

const lines = (rows: string[], bet = 100) => {
  const out: SpinWin[] = [];
  evaluateLines(compile(gildedVault), gridFromRows(rows), bet, 1, out);
  return out;
};

describe('paylines (Gilded Vault)', () => {
  it('pays a 3-of-a-kind on the middle line, left to right', () => {
    const wins = lines(['BAR BELL BAR BELL DIAMOND', 'SEVEN SEVEN SEVEN BAR BELL', 'BELL BAR BELL DIAMOND BAR']);
    const mid = wins.find((w) => w.lineIndex === 0)!;
    expect(mid).toMatchObject({ kind: 'line', symbol: 'SEVEN', count: 3, pay: gildedVault.paytable.SEVEN[3] });
    expect(mid.positions).toEqual([
      [0, 1],
      [1, 1],
      [2, 1],
    ]);
    expect(mid.amount).toBe(Math.floor((100 * gildedVault.paytable.SEVEN[3]) / 100));
  });

  it('only pays runs that start on the leftmost reel', () => {
    const wins = lines(['BAR BELL BAR BELL DIAMOND', 'BELL SEVEN SEVEN SEVEN SEVEN', 'BELL BAR BELL DIAMOND BAR']);
    expect(wins.find((w) => w.lineIndex === 0)).toBeUndefined();
  });

  it('wilds substitute for paying symbols but not the scatter', () => {
    const wins = lines(['BAR BELL BAR BELL DIAMOND', 'CROWN WILD WILD CROWN BELL', 'BELL BAR BELL DIAMOND BAR']);
    const mid = wins.find((w) => w.lineIndex === 0)!;
    expect(mid).toMatchObject({ symbol: 'CROWN', count: 4, pay: gildedVault.paytable.CROWN[4] });

    const sc = lines(['BAR BELL BAR BELL DIAMOND', 'VAULT WILD WILD BAR BELL', 'BELL BAR BELL DIAMOND BAR']);
    expect(sc.find((w) => w.lineIndex === 0)?.symbol).not.toBe('VAULT');
  });

  it('a wild leading run takes the first real symbol', () => {
    const def = testDef({ mode: 'lines', paylines: [[0, 0, 0]], paytable: { A: { 3: 100 }, B: { 3: 200 }, W: { 3: 1000 } } });
    const c = compile(def);
    const out: SpinWin[] = [];
    evaluateLines(c, gridFromRows(['W W B']), 100, 1, out);
    expect(out[0]).toMatchObject({ symbol: 'B', count: 3, amount: 200 });
    const out2: SpinWin[] = [];
    evaluateLines(c, gridFromRows(['W W W']), 100, 1, out2);
    expect(out2[0]).toMatchObject({ symbol: 'W', count: 3, amount: 1000 });
  });

  it('multiplier wilds multiply line wins (product)', () => {
    const def = testDef({
      mode: 'lines',
      paylines: [[0, 0, 0]],
      symbols: [
        { id: 'A', name: 'A', kind: 'regular' },
        { id: 'W2', name: 'W2', kind: 'wild', multiplier: 2 },
        { id: 'W3', name: 'W3', kind: 'wild', multiplier: 3 },
        { id: 'S', name: 'S', kind: 'scatter' },
      ],
      paytable: { A: { 3: 100 } },
      wildRules: { symbols: ['W2', 'W3'] },
    });
    const out: SpinWin[] = [];
    evaluateLines(compile(def), gridFromRows(['A W2 W3']), 100, 1, out);
    expect(out[0]).toMatchObject({ symbol: 'A', multiplier: 6, amount: 600 });
  });

  it('integer math: floor(bet × pay × mult / 100)', () => {
    const def = testDef({ mode: 'lines', paylines: [[0, 0, 0]], paytable: { A: { 3: 15 } } });
    const out: SpinWin[] = [];
    evaluateLines(compile(def), gridFromRows(['A A A']), 333, 1, out);
    expect(out[0].amount).toBe(Math.floor((333 * 15) / 100)); // 49
    expect(Number.isInteger(out[0].amount)).toBe(true);
  });
});

describe('ways', () => {
  const def = testDef({ reels: 4, rows: 3, mode: 'ways', paytable: { A: { 3: 10, 4: 40 }, B: { 3: 20 } } });
  const c = compile(def);
  it('counts ways as the product of matches per adjacent reel', () => {
    const out: SpinWin[] = [];
    // reel0: A×2, reel1: A×1, reel2: A×3, reel3: none
    evaluateWays(c, gridFromRows(['A A A B', 'A B A B', 'B B A B']), 100, 1, out);
    const a = out.find((w) => w.symbol === 'A')!;
    expect(a).toMatchObject({ kind: 'ways', count: 3, ways: 6, pay: 10, amount: 60 });
    expect(a.positions).toHaveLength(6);
  });

  it('wilds count as matches; requires the symbol itself in the run', () => {
    const out: SpinWin[] = [];
    evaluateWays(c, gridFromRows(['A W W W', 'B B B B', 'B B B B']), 100, 1, out);
    const a = out.find((w) => w.symbol === 'A')!;
    expect(a).toMatchObject({ count: 4, ways: 1, amount: 40 });
    // B: reel0 has B×2, reel1 B×2 + W, reel2 B×2 + W, reel3 B×2 + W → 2·3·3·3 = 54 ways but B has no 4-pay → no win
    expect(out.find((w) => w.symbol === 'B')).toBeUndefined();
  });

  it('a multiplier wild counts as N ways', () => {
    const d2 = testDef({
      reels: 3,
      rows: 2,
      mode: 'ways',
      symbols: [
        { id: 'A', name: 'A', kind: 'regular' },
        { id: 'B', name: 'B', kind: 'regular' },
        { id: 'W2', name: 'W2', kind: 'wild', multiplier: 2 },
        { id: 'S', name: 'S', kind: 'scatter' },
      ],
      paytable: { A: { 3: 10 } },
      wildRules: { symbols: ['W2'] },
    });
    const out: SpinWin[] = [];
    evaluateWays(compile(d2), gridFromRows(['A W2 A', 'B A B']), 100, 1, out);
    // reel0: 1, reel1: W2(2) + A(1) = 3, reel2: 1 → 3 ways
    expect(out[0]).toMatchObject({ ways: 3, amount: 30 });
  });
});

describe('clusters', () => {
  const def = testDef({
    reels: 5,
    rows: 4,
    mode: 'cluster',
    clusterMin: 5,
    paytable: { A: { 5: 100, 8: 300 }, B: { 5: 200 } },
  });
  const c = compile(def);
  const evalC = (rows: string[]) => {
    const out: SpinWin[] = [];
    evaluateClusters(c, gridFromRows(rows), 100, 1, out);
    return out;
  };

  it('finds orthogonally connected groups (flood fill), ignoring diagonals', () => {
    const out = evalC(['A A B S S', 'A B A S S', 'A A B S S', 'B S B A S']);
    // A cluster: (0,0)(1,0)(0,1)(0,2)(1,2) = 5 cells; (2,1) and (3,3) are only diagonal
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ symbol: 'A', count: 5, pay: 100, amount: 100 });
  });

  it('sizes between keys pay the nearest lower key', () => {
    const out = evalC(['A A A A S', 'A A A S S', 'B S S S S', 'S S S S S']);
    expect(out[0]).toMatchObject({ count: 7, pay: 100 });
    const out8 = evalC(['A A A A S', 'A A A A S', 'B S S S S', 'S S S S S']);
    expect(out8[0]).toMatchObject({ count: 8, pay: 300 });
  });

  it('wilds join clusters and are shared between clusters of different symbols', () => {
    const out = evalC(['A A B B S', 'A W W B S', 'S A B S S', 'S S S S S']);
    const a = out.find((w) => w.symbol === 'A')!;
    const b = out.find((w) => w.symbol === 'B')!;
    expect(a.count).toBe(6); // A×4 + W×2
    expect(b.count).toBe(6); // B×4 + W×2
    const key = (p: number[]) => p.join(',');
    expect(a.positions.map(key)).toContain('1,1');
    expect(b.positions.map(key)).toContain('1,1');
  });

  it('a pure-wild region does not pay on its own and below-minimum groups do not pay', () => {
    expect(evalC(['W W W W W', 'A A S S S', 'S S S S S', 'S S S S S'])).toHaveLength(1); // A(2)+W(5) = 7 → pays as A
    expect(evalC(['A A S S S', 'A A S S S', 'S S S S S', 'S S S S S'])).toHaveLength(0);
  });
});

describe('gravity plan', () => {
  it('drops survivors to the bottom and counts new cells per reel', () => {
    const plan = gravityPlan(4, 2, [
      [0, 3],
      [0, 1],
      [1, 0],
    ]);
    expect(plan.newCount).toEqual([2, 1]);
    expect(plan.moves.filter((m) => m.reel === 0)).toEqual([
      { reel: 0, from: 2, to: 3 },
      { reel: 0, from: 0, to: 2 },
    ]);
  });
});
