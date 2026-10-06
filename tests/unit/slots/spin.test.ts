import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { FairRng, FastRng } from '@/engines/fairness/rng';
import { spin, parseBonusState } from '@/engines/slots/engine';
import { gildedVault, overcharge, starforgedRelics, SLOT_DEFINITIONS } from '@/engines/slots/definitions';
import type { BonusState, SlotDefinition } from '@/engines/slots/types';
import { ScriptRng, testDef } from './helpers';

const only = (sym: string, reels = 3) => Array.from({ length: reels }, () => ({ [sym]: 1 }));

function bonus(def: SlotDefinition, over: Partial<BonusState> = {}): BonusState {
  return {
    v: 1,
    kind: 'FREE_SPINS',
    slotId: def.id,
    betLevel: 100,
    remaining: 5,
    total: 5,
    played: 0,
    multiplier: 1,
    cascadeLevel: 0,
    relics: 0,
    relicTier: 0,
    bonusWin: 0,
    roundWin: 0,
    ...over,
  };
}

describe('cascades & multiplier progression', () => {
  const def = testDef({
    weights: { base: only('A'), free: only('A') },
    cascadeRules: { multipliers: [1, 2, 3, 5, 10], persistInFreeSpins: true, maxCascades: 6 },
  });

  it('climbs the ladder per cascade and caps at the last value', () => {
    const o = spin(def, { betLevel: 100, bonusState: null }, new FastRng(1));
    expect(o.steps.map((s) => s.multiplier)).toEqual([1, 2, 3, 5, 10, 10, 10]);
    expect(o.steps.slice(0, -1).every((s) => s.removed?.length === 3)).toBe(true);
    expect(o.steps[o.steps.length - 1].removed).toBeUndefined();
    expect(o.totalWin).toBe(100 * (1 + 2 + 3 + 5 + 10 + 10 + 10));
    expect(o.features).toContain('CASCADE');
  });

  it('free spins keep the ladder level between spins when persistInFreeSpins', () => {
    const o = spin(def, { betLevel: 999, bonusState: bonus(def, { cascadeLevel: 2 }) }, new FastRng(2));
    expect(o.steps[0].multiplier).toBe(3);
    expect(o.bonusStateAfter?.cascadeLevel).toBe(4); // capped index
    expect(o.betLevel).toBe(100); // locked bet, request bet ignored
  });

  it('refills are deterministic for a given rng stream', () => {
    const d2 = { ...overcharge };
    for (let seed = 1; seed < 40; seed++) {
      const a = spin(d2, { betLevel: 100, bonusState: null }, new FastRng(seed));
      const b = spin(d2, { betLevel: 100, bonusState: null }, new FastRng(seed));
      expect(b).toEqual(a);
    }
  });

  it('applies gravity: survivors fall, new symbols fill from the top', () => {
    // 1 reel × 3 rows, ways min 1: symbols drawn top→bottom from the script
    const d = testDef({
      reels: 1,
      rows: 3,
      mode: 'cluster',
      clusterMin: 2,
      weights: { base: [{ A: 1, B: 1 }], free: [{ A: 1, B: 1 }] },
      paytable: { A: { 2: 100 }, B: { 2: 100 } },
      cascadeRules: { multipliers: [1], maxCascades: 1 },
    });
    // landed: B A A (top→bottom) → A×2 cluster removed → B falls to bottom, 2 new (draws 0.9 → B, 0.1 → A)
    const o = spin(d, { betLevel: 100, bonusState: null }, new ScriptRng([0.9, 0.1, 0.1, 0.9, 0.1]));
    expect(o.steps[0].grid).toEqual([['B', 'A', 'A']]);
    expect(o.steps[0].removed).toEqual([
      [0, 1],
      [0, 2],
    ]);
    expect(o.steps[1].grid).toEqual([['B', 'A', 'B']]);
  });
});

describe('scatters & free spins state machine', () => {
  const def = testDef({
    weights: { base: only('S'), free: only('A') },
  });

  it('scatters pay anywhere and trigger free spins at the paid bet level', () => {
    const o = spin(def, { betLevel: 200, bonusState: null }, new FastRng(3));
    const sc = o.steps[0].wins.find((w) => w.kind === 'scatter')!;
    expect(sc).toMatchObject({ count: 3, amount: 1000 });
    expect(o.features).toEqual(expect.arrayContaining(['FREE_SPINS_TRIGGERED', 'SCATTER_WIN']));
    expect(o.bonusStateAfter).toMatchObject({ betLevel: 200, remaining: 5, total: 5, played: 0, roundWin: 1000 });
    expect(o.freeSpins).toMatchObject({ triggered: true, awarded: 5, remaining: 5 });
  });

  it('free spins decrement, accumulate and end back in the base game', () => {
    let state = spin(def, { betLevel: 100, bonusState: null }, new FastRng(4)).bonusStateAfter!;
    let last;
    for (let i = 0; i < 5; i++) {
      last = spin(def, { betLevel: 100, bonusState: state }, new FastRng(10 + i));
      expect(last.isFreeSpin).toBe(true);
      expect(last.freeSpins!.played).toBe(i + 1);
      if (i < 4) {
        expect(last.bonusStateAfter!.remaining).toBe(4 - i);
        state = last.bonusStateAfter!;
      }
    }
    expect(last!.bonusStateAfter).toBeNull();
    expect(last!.features).toContain('FREE_SPINS_ENDED');
    expect(last!.freeSpins).toMatchObject({ ended: true, remaining: 0, played: 5, bonusWin: 5 * 100, roundWin: 500 + 5 * 100 });
  });

  it('retriggers add spins during the bonus', () => {
    const d = testDef({ weights: { base: only('S'), free: only('S') } });
    const start = spin(d, { betLevel: 100, bonusState: null }, new FastRng(5)).bonusStateAfter!;
    const o = spin(d, { betLevel: 100, bonusState: start }, new FastRng(6));
    expect(o.features).toContain('FREE_SPINS_RETRIGGERED');
    expect(o.bonusStateAfter).toMatchObject({ remaining: 5 - 1 + 2, total: 7, played: 1 });
  });

  it('relic tiers add spins and raise the persistent multiplier', () => {
    const d = testDef({
      symbols: [
        { id: 'A', name: 'A', kind: 'regular' },
        { id: 'R', name: 'Relic', kind: 'special' },
        { id: 'W', name: 'W', kind: 'wild' },
        { id: 'S', name: 'S', kind: 'scatter' },
      ],
      weights: { base: only('S'), free: only('R') },
      bonusRules: { relics: { symbol: 'R', thresholds: [3, 7], multipliers: [1, 2, 5], spinsPerTier: 2 } },
    });
    let s = spin(d, { betLevel: 100, bonusState: null }, new FastRng(1)).bonusStateAfter!;
    const o1 = spin(d, { betLevel: 100, bonusState: s }, new FastRng(2));
    expect(o1.features).toContain('RELIC_TIER_UP');
    expect(o1.bonusStateAfter).toMatchObject({ relics: 3, relicTier: 1, multiplier: 2, remaining: 5 - 1 + 2 });
    s = o1.bonusStateAfter!;
    const o2 = spin(d, { betLevel: 100, bonusState: s }, new FastRng(3));
    expect(o2.bonusStateAfter).toMatchObject({ relics: 6, relicTier: 1, multiplier: 2 });
    const o3 = spin(d, { betLevel: 100, bonusState: o2.bonusStateAfter! }, new FastRng(4));
    expect(o3.bonusStateAfter).toMatchObject({ relics: 9, relicTier: 2, multiplier: 5 });
    expect(o3.freeSpins?.relics).toMatchObject({ landed: 3, collected: 9, tier: 2, nextAt: null, tiersGained: 1 });
  });

  it('the persistent bonus multiplier applies to free-spin wins', () => {
    const o = spin(def, { betLevel: 100, bonusState: bonus(def, { multiplier: 3 }) }, new FastRng(7));
    expect(o.steps[0].multiplier).toBe(3);
    expect(o.totalWin).toBe(300);
  });
});

describe('max-win cap', () => {
  const def = testDef({ weights: { base: only('A'), free: only('A') }, paytable: { A: { 3: 5000 } }, maxWinX: 10 });
  it('truncates a spin at maxWinX × bet', () => {
    const o = spin(def, { betLevel: 100, bonusState: null }, new FastRng(1));
    expect(o.steps[0].stepWin).toBe(5000);
    expect(o.totalWin).toBe(1000);
    expect(o.maxWinReached).toBe(true);
    expect(o.features).toContain('MAX_WIN');
  });
  it('caps the whole round and ends the bonus', () => {
    const o = spin(def, { betLevel: 100, bonusState: bonus(def, { roundWin: 700, remaining: 4 }) }, new FastRng(2));
    expect(o.totalWin).toBe(300);
    expect(o.bonusStateAfter).toBeNull();
    expect(o.freeSpins).toMatchObject({ ended: true, roundWin: 1000 });
  });
});

describe('transforms & modifiers', () => {
  it('Gilded Vault: wilds expand to fill their reel during free spins only', () => {
    const d = testDef({
      reels: 3,
      rows: 3,
      mode: 'lines',
      paylines: [[1, 1, 1]],
      weights: { base: [{ A: 1 }, { B: 1, W: 1 }, { A: 1 }], free: [{ A: 1 }, { B: 1, W: 1 }, { A: 1 }] },
      wildRules: { symbols: ['W'], expand: 'free-spins' },
    });
    const script = [0.1, 0.1, 0.1, 0.9, 0.1, 0.1, 0.1, 0.1, 0.1]; // reel1 = W, B, B
    const base = spin(d, { betLevel: 100, bonusState: null }, new ScriptRng(script));
    expect(base.steps[0].grid[1]).toEqual(['W', 'B', 'B']);
    expect(base.steps[0].transforms).toBeUndefined();
    const free = spin(d, { betLevel: 100, bonusState: bonus(d) }, new ScriptRng(script));
    expect(free.steps[0].landed![1]).toEqual(['W', 'B', 'B']);
    expect(free.steps[0].grid[1]).toEqual(['W', 'W', 'W']);
    expect(free.steps[0].transforms![0]).toMatchObject({ kind: 'EXPANDING_WILD', origin: [1, 0], positions: [[1, 1], [1, 2]] });
    expect(free.features).toContain('EXPANDING_WILD');
    expect(free.steps[0].wins[0]).toMatchObject({ symbol: 'A', count: 3 });
  });

  it('Orrery multiplies every step of a base spin', () => {
    const d = testDef({
      weights: { base: only('A'), free: only('A') },
      modifiers: { chance: 1, list: [{ kind: 'ORRERY', weight: 1, multipliers: [4], multiplierWeights: [1] }] },
    });
    const o = spin(d, { betLevel: 100, bonusState: null }, new FastRng(1));
    expect(o.steps[0].modifiers).toEqual([{ kind: 'ORRERY', multiplier: 4 }]);
    expect(o.totalWin).toBe(400);
    expect(o.features).toContain('ORRERY');
    // modifiers never fire in free spins
    const f = spin(d, { betLevel: 100, bonusState: bonus(d) }, new FastRng(1));
    expect(f.steps[0].modifiers).toBeUndefined();
  });

  it('Star Surge converts N distinct regular cells to one symbol', () => {
    const d = testDef({
      reels: 4,
      rows: 4,
      mode: 'cluster',
      weights: { base: Array.from({ length: 4 }, () => ({ A: 1, B: 1 })), free: only('A', 4) },
      paytable: { A: { 5: 100 }, B: { 5: 100 } },
      modifiers: { chance: 1, list: [{ kind: 'STAR_SURGE', weight: 1, symbols: { A: 1 }, min: 3, spread: 2 }] },
    });
    for (let seed = 1; seed < 20; seed++) {
      const o = spin(d, { betLevel: 100, bonusState: null }, new FastRng(seed));
      const m = o.steps[0].modifiers![0] as { kind: string; symbol: string; positions: [number, number][] };
      expect(m.kind).toBe('STAR_SURGE');
      expect(m.positions.length).toBeGreaterThanOrEqual(Math.min(3, 16));
      expect(new Set(m.positions.map((p) => p.join())).size).toBe(m.positions.length);
      for (const [r, y] of m.positions) {
        expect(o.steps[0].landed![r][y]).toBe('B');
        expect(o.steps[0].grid[r][y]).toBe('A');
      }
    }
  });

  it('Supernova bursts into a 3×3 block of wilds (clamped, scatters kept)', () => {
    const d = { ...starforgedRelics, weights: { base: starforgedRelics.weights.base, free: starforgedRelics.weights.free } };
    let found = false;
    for (let seed = 1; seed < 20000 && !found; seed++) {
      const o = spin(d, { betLevel: 100, bonusState: null }, new FastRng(seed));
      const t = o.steps[0].transforms?.find((x) => x.kind === 'SUPERNOVA');
      if (!t) continue;
      found = true;
      const [or, oy] = t.origin!;
      for (const [r, y] of t.positions) {
        expect(Math.abs(r - or)).toBeLessThanOrEqual(1);
        expect(Math.abs(y - oy)).toBeLessThanOrEqual(1);
        expect(o.steps[0].landed![r][y]).not.toBe('SCATTER');
      }
      expect(o.features).toContain('SUPERNOVA');
    }
    expect(found).toBe(true);
  });
});

describe('determinism, golden vectors & verifier', () => {
  const nodeHmac = (key: string, msg: string) => new Uint8Array(createHmac('sha256', key).update(msg).digest());

  it('the browser (jsHmac) and server (node crypto) RNGs give identical outcomes', () => {
    for (const def of SLOT_DEFINITIONS) {
      for (let nonce = 0; nonce < 15; nonce++) {
        const a = spin(def, { betLevel: 500, bonusState: null }, new FairRng('server-seed-x', 'client-y', nonce, nodeHmac));
        const b = spin(def, { betLevel: 500, bonusState: null }, new FairRng('server-seed-x', 'client-y', nonce));
        expect(b).toEqual(a);
      }
    }
  });

  it('golden vectors (locks the RNG draw order and math)', () => {
    const summary = SLOT_DEFINITIONS.map((def) =>
      [0, 1, 2, 3].map((nonce) => {
        const o = spin(def, { betLevel: 100, bonusState: null }, new FairRng('nova-golden-seed', 'nova-client', nonce));
        return `${def.id}#${nonce}:${o.steps[0].grid.map((c) => c.join('.')).join('|')}=${o.totalWin}/${o.steps.length}`;
      }),
    ).flat();
    expect(summary).toMatchSnapshot();
  });

  it('parseBonusState rejects malformed or foreign state', () => {
    expect(parseBonusState(gildedVault, null)).toBeNull();
    expect(() => parseBonusState(gildedVault, { v: 1, kind: 'FREE_SPINS', slotId: 'overcharge' })).toThrow();
    expect(() => parseBonusState(gildedVault, { ...bonus(gildedVault), remaining: -1 })).toThrow();
    expect(() => parseBonusState(gildedVault, { ...bonus(gildedVault), betLevel: 1.5 })).toThrow();
    expect(parseBonusState(gildedVault, { ...bonus(gildedVault), remaining: 0 })).toBeNull();
    expect(parseBonusState(gildedVault, bonus(gildedVault))).toMatchObject({ remaining: 5 });
  });

  it('wins are always non-negative integers and never exceed the cap', () => {
    for (const def of SLOT_DEFINITIONS) {
      const rng = new FastRng(99);
      for (let i = 0; i < 3000; i++) {
        const o = spin(def, { betLevel: 300, bonusState: null }, rng);
        expect(Number.isSafeInteger(o.totalWin)).toBe(true);
        expect(o.totalWin).toBeGreaterThanOrEqual(0);
        expect(o.totalWin).toBeLessThanOrEqual(def.maxWinX * 300);
        for (const s of o.steps) for (const w of s.wins) expect(Number.isInteger(w.amount)).toBe(true);
      }
    }
  });
});
