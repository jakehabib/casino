import type { SlotDefinition } from '../types';

/**
 * STARFORGED RELICS — 6×5 cluster pays (5+ orthogonally adjacent), cascades.
 *
 *  • Supernova (special): on landing it bursts into a 3×3 block of wilds.
 *  • Random base-game modifiers: Star Surge (cells convert to one symbol),
 *    Relic Wilds (2–4 wilds added), Orrery (2×–5× spin multiplier).
 *  • 4+ Star Gate scatters → free spins. During free spins Relics land;
 *    collecting them climbs tiers: each tier adds +3 spins and raises the
 *    persistent bonus multiplier 1× → 2× → 3× → 5× → 10×.
 * High volatility. Math: docs/SLOT_MATH.md.
 */

const LOW = { GEM_TEAL: 0, GEM_ROSE: 0, GEM_AZURE: 0, GEM_AMBER: 0 };
const reel = (o: Partial<Record<string, number>>) => ({ ...LOW, ...o }) as Record<string, number>;

const BASE = reel({
  GEM_TEAL: 200,
  GEM_ROSE: 200,
  GEM_AZURE: 190,
  GEM_AMBER: 180,
  CHALICE: 120,
  ASTROLABE: 90,
  STARCROWN: 60,
  WILD: 20,
  SCATTER: 27,
  SUPERNOVA: 3,
});
const FREE = { ...BASE, SCATTER: 22, SUPERNOVA: 6, RELIC: 50 };

export const starforgedRelics: SlotDefinition = {
  id: 'starforged-relics',
  name: 'Starforged Relics',
  reels: 6,
  rows: 5,
  mode: 'cluster',
  clusterMin: 5,
  symbols: [
    { id: 'GEM_TEAL', name: 'Teal Shard', kind: 'regular', tier: 'low' },
    { id: 'GEM_ROSE', name: 'Rose Shard', kind: 'regular', tier: 'low' },
    { id: 'GEM_AZURE', name: 'Azure Shard', kind: 'regular', tier: 'low' },
    { id: 'GEM_AMBER', name: 'Amber Shard', kind: 'regular', tier: 'low' },
    { id: 'CHALICE', name: 'Star Chalice', kind: 'regular', tier: 'high' },
    { id: 'ASTROLABE', name: 'Astrolabe', kind: 'regular', tier: 'high' },
    { id: 'STARCROWN', name: 'Star Crown', kind: 'regular', tier: 'premium' },
    { id: 'WILD', name: 'Wild', kind: 'wild' },
    { id: 'SCATTER', name: 'Star Gate', kind: 'scatter', maxPerReel: 1 },
    { id: 'SUPERNOVA', name: 'Supernova', kind: 'special', maxPerReel: 1 },
    { id: 'RELIC', name: 'Relic', kind: 'special' },
  ],
  weights: {
    base: [BASE, BASE, BASE, BASE, BASE, BASE],
    free: [FREE, FREE, FREE, FREE, FREE, FREE],
  },
  // hundredths of TOTAL bet per cluster; sizes between keys use the lower key
  paytable: {
    GEM_TEAL: { 5: 10, 6: 14, 7: 19, 8: 28, 9: 43, 10: 71, 12: 142, 15: 380, 20: 950 },
    GEM_ROSE: { 5: 10, 6: 14, 7: 19, 8: 28, 9: 43, 10: 71, 12: 142, 15: 380, 20: 950 },
    GEM_AZURE: { 5: 14, 6: 19, 7: 28, 8: 43, 9: 57, 10: 95, 12: 190, 15: 475, 20: 1188 },
    GEM_AMBER: { 5: 14, 6: 19, 7: 28, 8: 43, 9: 57, 10: 95, 12: 190, 15: 475, 20: 1188 },
    CHALICE: { 5: 24, 6: 33, 7: 48, 8: 76, 9: 114, 10: 190, 12: 380, 15: 950, 20: 2375 },
    ASTROLABE: { 5: 38, 6: 48, 7: 71, 8: 114, 9: 171, 10: 285, 12: 570, 15: 1425, 20: 3800 },
    STARCROWN: { 5: 48, 6: 71, 7: 95, 8: 142, 9: 238, 10: 380, 12: 950, 15: 2375, 20: 9500 },
  },
  wildRules: { symbols: ['WILD'], expand: 'never' },
  scatterRules: {
    symbol: 'SCATTER',
    minCount: 4,
    pays: { 4: 400, 5: 1000, 6: 5000 },
    freeSpins: { 4: 10, 5: 12, 6: 15 },
    retrigger: { 4: 5, 5: 7, 6: 10 },
  },
  cascadeRules: { multipliers: [1], refillExclude: ['SUPERNOVA'], maxCascades: 40 },
  bonusRules: {
    relics: { symbol: 'RELIC', thresholds: [3, 7, 12, 18], multipliers: [1, 2, 3, 5, 10], spinsPerTier: 3 },
  },
  modifiers: {
    chance: 0.05,
    list: [
      {
        kind: 'STAR_SURGE',
        weight: 45,
        symbols: { GEM_TEAL: 4, GEM_ROSE: 4, GEM_AZURE: 4, GEM_AMBER: 4, CHALICE: 3, ASTROLABE: 2, STARCROWN: 1 },
        min: 5,
        spread: 4,
      },
      { kind: 'RELIC_WILDS', weight: 35, wild: 'WILD', min: 2, spread: 2 },
      { kind: 'ORRERY', weight: 20, multipliers: [2, 3, 4, 5], multiplierWeights: [50, 25, 15, 10] },
    ],
  },
  expander: { symbol: 'SUPERNOVA', wild: 'WILD', radius: 1 },
  rtpTarget: 96,
  rtpSimulated: { rtp: 96.27, rounds: 10_000_000 },
  volatility: 'high',
  maxWinX: 10000,
  featureText: [
    { title: 'Cluster pays', body: 'Five or more matching symbols connected horizontally or vertically form a cluster. Wilds join any cluster and can be shared between clusters.' },
    { title: 'Cascades', body: 'Winning clusters vanish and new symbols fall into place. The chain continues while new clusters form.' },
    { title: 'Supernova', body: 'When a Supernova lands it bursts into a 3×3 block of wilds.' },
    { title: 'Celestial modifiers', body: 'Any base spin may trigger a modifier: Star Surge converts 5–9 symbols to one symbol, Relic Wilds adds 2–4 wilds, and the Orrery applies a 2×–5× multiplier to the whole spin.' },
    { title: 'Free spins', body: '4, 5 or 6 Star Gates award 10, 12 or 15 free spins (and retrigger during the bonus).' },
    { title: 'Relic tiers', body: 'Relics land only during free spins. Collect 3, 7, 12 and 18 to reach each tier: every tier awards +3 spins and raises the persistent bonus multiplier to 2×, 3×, 5× and finally 10×.' },
  ],
};
