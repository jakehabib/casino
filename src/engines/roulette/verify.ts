import { FairRng, jsHmac } from '@/engines/fairness/rng';
import { drawWinningNumber } from './engine';

/**
 * Re-derive a roulette result from its revealed seed pair. Pure JS (runs in the
 * browser): winningNumber = floor(float₀ × 37) where float₀ is the first float of
 * HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}:0`).
 */
export function verifyRoulette(serverSeed: string, clientSeed: string, nonce: number): number {
  return drawWinningNumber(new FairRng(serverSeed, clientSeed, nonce, jsHmac));
}
