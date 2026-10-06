import { FastRng } from '@/engines/fairness/rng';
import { spin } from './engine';
import type { BonusState, SlotDefinition, SpinOutcome } from './types';

/**
 * DEV TOOLS ONLY — find a genuine engine outcome with a requested property by
 * searching deterministic simulation seeds. The result is a real outcome of
 * the engine (every rule applies) but it is NOT derived from the player's
 * fairness seeds, so the stored round is flagged `forced`.
 */
export type ForcedSlotTrigger = 'FREE_SPINS' | 'BIG_WIN' | 'LOSS';

/** BIG_WIN threshold in × bet. */
export const FORCED_BIG_WIN_X = 20;

export function matchesTrigger(o: SpinOutcome, trigger: ForcedSlotTrigger): boolean {
  switch (trigger) {
    case 'FREE_SPINS':
      return o.features.includes('FREE_SPINS_TRIGGERED') || o.features.includes('FREE_SPINS_RETRIGGERED');
    case 'BIG_WIN':
      return o.totalWin >= FORCED_BIG_WIN_X * o.betLevel;
    case 'LOSS':
      return o.totalWin === 0 && !o.features.includes('FREE_SPINS_TRIGGERED') && !o.features.includes('FREE_SPINS_RETRIGGERED');
  }
}

export function searchOutcome(
  def: SlotDefinition,
  input: { betLevel: number; bonusState: BonusState | null },
  trigger: ForcedSlotTrigger,
  seed: number,
  maxAttempts = 400_000,
): SpinOutcome | null {
  for (let i = 0; i < maxAttempts; i++) {
    const o = spin(def, input, new FastRng((seed * 2654435761 + i * 40503 + 1) >>> 0));
    if (matchesTrigger(o, trigger)) return o;
  }
  return null;
}
