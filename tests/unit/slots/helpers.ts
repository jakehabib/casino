import type { Rng } from '@/engines/fairness/rng';
import type { SlotDefinition } from '@/engines/slots/types';

/** Rng replaying a fixed list of floats (then cycling). */
export class ScriptRng implements Rng {
  i = 0;
  constructor(private readonly values: number[]) {}
  next() {
    const v = this.values[this.i % this.values.length];
    this.i++;
    return v;
  }
  int(n: number) {
    return Math.floor(this.next() * n);
  }
}

/** Grid from rows written top→bottom as strings of space-separated ids: rows[row] = "A B C". */
export function gridFromRows(rows: string[]): string[][] {
  const cells = rows.map((r) => r.trim().split(/\s+/));
  const reels = cells[0].length;
  return Array.from({ length: reels }, (_, r) => cells.map((row) => row[r]));
}

/** Minimal definition factory for focused engine tests. */
export function testDef(over: Partial<SlotDefinition>): SlotDefinition {
  const reels = over.reels ?? 3;
  const w = { A: 1 };
  return {
    id: 'test',
    name: 'Test',
    reels,
    rows: 1,
    mode: 'ways',
    symbols: [
      { id: 'A', name: 'A', kind: 'regular' },
      { id: 'B', name: 'B', kind: 'regular' },
      { id: 'W', name: 'Wild', kind: 'wild' },
      { id: 'S', name: 'Scatter', kind: 'scatter' },
    ],
    weights: { base: Array.from({ length: reels }, () => w), free: Array.from({ length: reels }, () => w) },
    paytable: { A: { 3: 100 }, B: { 3: 200 } },
    wildRules: { symbols: ['W'], expand: 'never' },
    scatterRules: { symbol: 'S', minCount: 3, pays: { 3: 500 }, freeSpins: { 3: 5 }, retrigger: { 3: 2 } },
    bonusRules: {},
    rtpTarget: 96,
    rtpSimulated: { rtp: 96, rounds: 0 },
    volatility: 'medium',
    maxWinX: 1000,
    featureText: [],
    ...over,
  };
}
