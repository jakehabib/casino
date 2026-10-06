import type { SlotDefinition } from '../types';

/**
 * OVERCHARGE — 5×4, 1,024 ways (adjacent reels from the leftmost), cascades.
 * Each cascade in a spin raises the chain multiplier 1×→2×→3×→5×→10× (cap);
 * it resets on the next paid spin. In free spins the chain multiplier is
 * NOT reset between spins, and ×2 Overcharged Wilds can land.
 * Medium-high volatility. Math: docs/SLOT_MATH.md.
 */

/** Low symbols come in two families weighted alternately per reel (A-heavy, B-heavy) to tame the hit rate. */
const A = (w: number) => ({ CELL: w, FUSE: w, CHIP: w });
const B = (w: number) => ({ NODE: w, DIODE: w, COIL: w });
const HIGHS = { CORE: 14, PLASMA: 10, REACTOR: 7 };
const LOWS = [
  { ...A(34), ...B(8) },
  { ...A(8), ...B(34) },
  { ...A(34), ...B(8) },
  { ...A(8), ...B(34) },
  { ...A(21), ...B(21) },
];
const reels = (wild: number, scatter: number, wild2 = 0) =>
  LOWS.map((lows, r) => ({ ...lows, ...HIGHS, WILD: r === 0 ? 0 : wild, WILD2: r === 0 ? 0 : wild2, SCATTER: scatter }));

export const overcharge: SlotDefinition = {
  id: 'overcharge',
  name: 'Overcharge',
  reels: 5,
  rows: 4,
  mode: 'ways',
  symbols: [
    { id: 'CELL', name: 'Cell', kind: 'regular', tier: 'low' },
    { id: 'NODE', name: 'Node', kind: 'regular', tier: 'low' },
    { id: 'FUSE', name: 'Fuse', kind: 'regular', tier: 'low' },
    { id: 'DIODE', name: 'Diode', kind: 'regular', tier: 'low' },
    { id: 'CHIP', name: 'Chip', kind: 'regular', tier: 'low' },
    { id: 'COIL', name: 'Coil', kind: 'regular', tier: 'low' },
    { id: 'CORE', name: 'Core', kind: 'regular', tier: 'high' },
    { id: 'PLASMA', name: 'Plasma', kind: 'regular', tier: 'high' },
    { id: 'REACTOR', name: 'Reactor', kind: 'regular', tier: 'premium' },
    { id: 'WILD', name: 'Wild', kind: 'wild' },
    { id: 'WILD2', name: 'Overcharged Wild ×2', kind: 'wild', multiplier: 2 },
    { id: 'SCATTER', name: 'Surge Scatter', kind: 'scatter', maxPerReel: 1 },
  ],
  weights: {
    base: reels(3, 3),
    free: reels(7, 3, 3),
  },
  // hundredths of TOTAL bet, per way
  paytable: {
    CELL: { 3: 15, 4: 30, 5: 60 },
    NODE: { 3: 15, 4: 30, 5: 60 },
    FUSE: { 3: 15, 4: 30, 5: 60 },
    DIODE: { 3: 15, 4: 30, 5: 75 },
    CHIP: { 3: 15, 4: 45, 5: 90 },
    COIL: { 3: 30, 4: 60, 5: 120 },
    CORE: { 3: 45, 4: 120, 5: 240 },
    PLASMA: { 3: 60, 4: 150, 5: 375 },
    REACTOR: { 3: 75, 4: 225, 5: 600 },
  },
  wildRules: { symbols: ['WILD', 'WILD2'], expand: 'never' },
  scatterRules: {
    symbol: 'SCATTER',
    minCount: 3,
    pays: { 3: 100, 4: 500, 5: 2000 },
    freeSpins: { 3: 8, 4: 12, 5: 20 },
    retrigger: { 3: 5, 4: 8, 5: 10 },
  },
  cascadeRules: { multipliers: [1, 2, 3, 5, 10], persistInFreeSpins: true, maxCascades: 40 },
  bonusRules: {},
  rtpTarget: 96,
  rtpSimulated: { rtp: 96.18, rounds: 5_000_000 },
  volatility: 'medium-high',
  maxWinX: 5000,
  featureText: [
    { title: '1,024 ways', body: 'Matching symbols on adjacent reels from the leftmost reel pay, in any row. Ways multiply: two matches on each of three reels = 8 ways.' },
    { title: 'Cascades', body: 'Winning symbols are removed and new symbols fall into place, paying again for as long as new wins form.' },
    { title: 'Chain multiplier', body: 'Each cascade in a spin raises the multiplier 1× → 2× → 3× → 5× → 10× (max). It resets on the next paid spin.' },
    { title: 'Wilds', body: 'Wilds land on reels 2–5 and substitute for every symbol except the Surge scatter.' },
    { title: 'Free spins', body: '3, 4 or 5 scatters award 8, 12 or 20 free spins. The chain multiplier never resets during free spins, and ×2 Overcharged Wilds can land — each counts as two ways. Scatters retrigger.' },
  ],
};
