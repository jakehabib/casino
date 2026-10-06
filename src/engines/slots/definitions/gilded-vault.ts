import type { SlotDefinition } from '../types';

/**
 * GILDED VAULT — 5×3, 20 fixed paylines, left-to-right.
 * Classic line slot with Vault scatter free spins; during free spins every
 * landed wild expands to fill its reel. Medium volatility. Math: docs/SLOT_MATH.md.
 */

const reelWeights = (w: Record<string, number>, wildReels: number[], wild: number) =>
  [0, 1, 2, 3, 4].map((r) => ({ ...w, WILD: wildReels.includes(r) ? wild : 0 }));

export const GILDED_VAULT_PAYLINES: number[][] = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1],
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [1, 1, 0, 1, 1],
  [1, 1, 2, 1, 1],
  [0, 2, 0, 2, 0],
  [2, 0, 2, 0, 2],
  [0, 2, 2, 2, 0],
];

export const gildedVault: SlotDefinition = {
  id: 'gilded-vault',
  name: 'Gilded Vault',
  reels: 5,
  rows: 3,
  mode: 'lines',
  paylines: GILDED_VAULT_PAYLINES,
  symbols: [
    { id: 'BAR', name: 'Bar', kind: 'regular', tier: 'low' },
    { id: 'BELL', name: 'Bell', kind: 'regular', tier: 'low' },
    { id: 'DIAMOND', name: 'Diamond', kind: 'regular', tier: 'high' },
    { id: 'SEVEN', name: 'Seven', kind: 'regular', tier: 'high' },
    { id: 'CROWN', name: 'Crown', kind: 'regular', tier: 'premium' },
    { id: 'WILD', name: 'Wild', kind: 'wild' },
    { id: 'VAULT', name: 'Vault', kind: 'scatter', maxPerReel: 1 },
  ],
  weights: {
    base: [
      { BAR: 34, BELL: 12, DIAMOND: 24, SEVEN: 9, CROWN: 6, VAULT: 3 },
      { BAR: 12, BELL: 34, DIAMOND: 9, SEVEN: 22, CROWN: 6, WILD: 3, VAULT: 3 },
      { BAR: 30, BELL: 14, DIAMOND: 24, SEVEN: 9, CROWN: 8, WILD: 3, VAULT: 3 },
      { BAR: 14, BELL: 30, DIAMOND: 10, SEVEN: 22, CROWN: 6, WILD: 3, VAULT: 3 },
      { BAR: 30, BELL: 16, DIAMOND: 22, SEVEN: 10, CROWN: 8, VAULT: 3 },
    ],
    free: [
      { BAR: 34, BELL: 12, DIAMOND: 24, SEVEN: 9, CROWN: 6, VAULT: 2 },
      { BAR: 12, BELL: 34, DIAMOND: 9, SEVEN: 22, CROWN: 6, WILD: 7, VAULT: 2 },
      { BAR: 30, BELL: 14, DIAMOND: 24, SEVEN: 9, CROWN: 8, WILD: 7, VAULT: 2 },
      { BAR: 14, BELL: 30, DIAMOND: 10, SEVEN: 22, CROWN: 6, WILD: 7, VAULT: 2 },
      { BAR: 30, BELL: 16, DIAMOND: 22, SEVEN: 10, CROWN: 8, VAULT: 2 },
    ],
  },
  // hundredths of TOTAL bet, per line
  paytable: {
    BAR: { 3: 15, 4: 50, 5: 150 },
    BELL: { 3: 20, 4: 60, 5: 200 },
    DIAMOND: { 3: 40, 4: 120, 5: 400 },
    SEVEN: { 3: 60, 4: 200, 5: 750 },
    CROWN: { 3: 100, 4: 400, 5: 1500 },
  },
  wildRules: { symbols: ['WILD'], expand: 'free-spins' },
  scatterRules: {
    symbol: 'VAULT',
    minCount: 3,
    pays: { 3: 200, 4: 1000, 5: 5000 },
    freeSpins: { 3: 10, 4: 12, 5: 15 },
    retrigger: { 3: 10, 4: 12, 5: 15 },
  },
  bonusRules: {},
  rtpTarget: 96,
  volatility: 'medium',
  maxWinX: 2500,
  featureText: [
    { title: '20 fixed paylines', body: 'Wins pay left to right on adjacent reels starting from the leftmost reel. Only the highest win per line is paid.' },
    { title: 'Vault Wild', body: 'Wilds land on reels 2, 3 and 4 and substitute for every symbol except the Vault.' },
    { title: 'Vault scatter', body: '3, 4 or 5 Vaults anywhere pay 2×, 10× or 50× the total bet and open 10, 12 or 15 free spins.' },
    { title: 'Free spins', body: 'Every wild that lands during free spins expands to fill its entire reel. Vaults retrigger more spins. The bet is locked to the triggering bet.' },
  ],
};
