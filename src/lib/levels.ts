/**
 * Progression curve. XP is earned from play-money wagering only (1 XP per
 * 10 Credits wagered) — winning is never required.
 */
export const MAX_LEVEL = 100;
export const CREDITS_PER_XP = 10;

/** XP required to advance from `level` to `level + 1`. */
export function xpForLevel(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  return Math.floor(500 * Math.pow(level, 1.6));
}

const cumulative: number[] = (() => {
  const arr = [0, 0]; // arr[L] = lifetime XP needed to reach level L
  for (let l = 1; l < MAX_LEVEL; l++) arr.push(arr[l] + xpForLevel(l));
  return arr;
})();

export function lifetimeXpForLevel(level: number): number {
  return cumulative[Math.max(1, Math.min(MAX_LEVEL, level))];
}

export function levelFromLifetimeXp(lifetimeXp: number): { level: number; xpIntoLevel: number; xpForNext: number } {
  let level = 1;
  while (level < MAX_LEVEL && lifetimeXp >= cumulative[level + 1]) level++;
  const xpIntoLevel = lifetimeXp - cumulative[level];
  return { level, xpIntoLevel, xpForNext: xpForLevel(level) };
}

export function xpForWager(amount: number | bigint): bigint {
  return BigInt(amount) / BigInt(CREDITS_PER_XP);
}

export type LevelTier = 'neutral' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'prestige';

export function tierForLevel(level: number): LevelTier {
  if (level >= 100) return 'prestige';
  if (level >= 75) return 'platinum';
  if (level >= 50) return 'gold';
  if (level >= 25) return 'silver';
  if (level >= 10) return 'bronze';
  return 'neutral';
}

export const TIER_LABEL: Record<LevelTier, string> = {
  neutral: 'Rookie',
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  prestige: 'Prestige',
};

/** Milestone levels that grant a one-off claimable reward. */
export const LEVEL_MILESTONES = [5, 10, 25, 50, 75, 100] as const;
export function milestoneReward(level: number): number {
  return level * 2_000;
}
