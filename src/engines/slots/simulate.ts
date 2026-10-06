import type { Rng } from '@/engines/fairness/rng';
import { spin } from './engine';
import type { BonusState, SlotDefinition } from './types';

/**
 * Round-level Monte Carlo accumulator (pure; used by scripts/simulate.ts and
 * tests). A ROUND = one paid spin + every free spin it triggers.
 * All wins are tracked in hundredths of the bet (betLevel = 100).
 */
export const SIM_BET = 100;

/** Upper bounds (× bet, exclusive) of the distribution buckets; 0 is its own bucket. */
export const BUCKETS = [
  { label: '0×', max: 0 },
  { label: '<1×', max: 1 },
  { label: '1–2×', max: 2 },
  { label: '2–5×', max: 5 },
  { label: '5–20×', max: 20 },
  { label: '20–100×', max: 100 },
  { label: '100–1000×', max: 1000 },
  { label: '1000×+', max: Infinity },
] as const;

export interface SimStats {
  rounds: number;
  /** Σ round win (credits at SIM_BET) */
  totalWin: number;
  /** Σ (round win / bet)² — for variance */
  sumSq: number;
  hits: number;
  bonuses: number;
  bonusWin: number;
  freeSpinsPlayed: number;
  maxWin: number;
  maxWinCapped: number;
  buckets: number[];
  features: Record<string, number>;
  baseWin: number;
}

export function emptyStats(): SimStats {
  return {
    rounds: 0,
    totalWin: 0,
    sumSq: 0,
    hits: 0,
    bonuses: 0,
    bonusWin: 0,
    freeSpinsPlayed: 0,
    maxWin: 0,
    maxWinCapped: 0,
    buckets: new Array(BUCKETS.length).fill(0),
    features: {},
    baseWin: 0,
  };
}

export function mergeStats(a: SimStats, b: SimStats): SimStats {
  const features = { ...a.features };
  for (const [k, v] of Object.entries(b.features)) features[k] = (features[k] ?? 0) + v;
  return {
    rounds: a.rounds + b.rounds,
    totalWin: a.totalWin + b.totalWin,
    sumSq: a.sumSq + b.sumSq,
    hits: a.hits + b.hits,
    bonuses: a.bonuses + b.bonuses,
    bonusWin: a.bonusWin + b.bonusWin,
    freeSpinsPlayed: a.freeSpinsPlayed + b.freeSpinsPlayed,
    maxWin: Math.max(a.maxWin, b.maxWin),
    maxWinCapped: a.maxWinCapped + b.maxWinCapped,
    buckets: a.buckets.map((x, i) => x + b.buckets[i]),
    features,
    baseWin: a.baseWin + b.baseWin,
  };
}

/** Play one full round; returns total round win at SIM_BET. */
export function playRound(def: SlotDefinition, rng: Rng, st: SimStats): number {
  let out = spin(def, { betLevel: SIM_BET, bonusState: null }, rng);
  let roundWin = out.totalWin;
  st.baseWin += out.totalWin;
  for (const f of out.features) st.features[f] = (st.features[f] ?? 0) + 1;
  let bonus: BonusState | null = out.bonusStateAfter;
  let capped = out.maxWinReached;
  if (bonus) {
    st.bonuses++;
    let bw = 0;
    while (bonus) {
      out = spin(def, { betLevel: SIM_BET, bonusState: bonus }, rng);
      st.freeSpinsPlayed++;
      for (const f of out.features) st.features[f] = (st.features[f] ?? 0) + 1;
      bw += out.totalWin;
      if (out.maxWinReached) capped = true;
      bonus = out.bonusStateAfter;
    }
    st.bonusWin += bw;
    roundWin += bw;
  }
  st.rounds++;
  st.totalWin += roundWin;
  const x = roundWin / SIM_BET;
  st.sumSq += x * x;
  if (roundWin > 0) st.hits++;
  if (roundWin > st.maxWin) st.maxWin = roundWin;
  if (capped) st.maxWinCapped++;
  let b = 0;
  if (roundWin > 0) {
    b = 1;
    while (b < BUCKETS.length - 1 && x >= BUCKETS[b].max) b++;
  }
  st.buckets[b]++;
  return roundWin;
}

export function simulate(def: SlotDefinition, rounds: number, rng: Rng, st = emptyStats()): SimStats {
  for (let i = 0; i < rounds; i++) playRound(def, rng, st);
  return st;
}

export interface SimSummary {
  rounds: number;
  rtp: number;
  ci95: number;
  hitRate: number;
  bonusFrequency: number;
  avgBonusWinX: number;
  avgFreeSpins: number;
  avgWinX: number;
  maxWinX: number;
  stdDev: number;
  baseRtp: number;
  bonusRtp: number;
  capHits: number;
  buckets: { label: string; count: number; pct: number }[];
}

export function summarize(st: SimStats): SimSummary {
  const n = st.rounds || 1;
  const mean = st.totalWin / SIM_BET / n;
  const variance = Math.max(0, st.sumSq / n - mean * mean);
  const sd = Math.sqrt(variance);
  return {
    rounds: st.rounds,
    rtp: mean * 100,
    ci95: (1.96 * sd * 100) / Math.sqrt(n),
    hitRate: st.hits / n,
    bonusFrequency: st.bonuses / n,
    avgBonusWinX: st.bonuses ? st.bonusWin / SIM_BET / st.bonuses : 0,
    avgFreeSpins: st.bonuses ? st.freeSpinsPlayed / st.bonuses : 0,
    avgWinX: st.hits ? st.totalWin / SIM_BET / st.hits : 0,
    maxWinX: st.maxWin / SIM_BET,
    stdDev: sd,
    baseRtp: (st.baseWin / SIM_BET / n) * 100,
    bonusRtp: (st.bonusWin / SIM_BET / n) * 100,
    capHits: st.maxWinCapped,
    buckets: BUCKETS.map((b, i) => ({ label: b.label, count: st.buckets[i], pct: st.buckets[i] / n })),
  };
}
