import { FairRng, jsHmac } from '@/engines/fairness/rng';
import { parseBonusState, spin } from './engine';
import { getSlotDefinition } from './definitions';
import type { SpinOutcome } from './types';

/**
 * Re-derive a slot spin from its revealed seed pair. Pure JS (runs in the
 * browser via the /fairness page).
 *
 *   rng     = FairRng(serverSeed, clientSeed, nonce)   — HMAC_SHA256 float stream
 *   outcome = SlotEngine.spin(definition, { betLevel, bonusState: bonusStateBefore }, rng)
 *
 * `bonusStateBefore` is the persisted free-spin state the spin was played
 * with (null for a paid base spin) and is published in the round's fairness
 * `extra`. The draw order is documented in src/engines/slots/engine.ts.
 * Rounds flagged `forced` (dev tools) are not seed-derived by design.
 */
export function verifySlotSpin(
  slotId: string,
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  betLevel: number,
  bonusStateBefore: unknown,
): SpinOutcome {
  const def = getSlotDefinition(slotId);
  if (!def) throw new Error(`Unknown slot "${slotId}"`);
  const bonusState = parseBonusState(def, bonusStateBefore);
  return spin(def, { betLevel, bonusState }, new FairRng(serverSeed, clientSeed, nonce, jsHmac));
}
