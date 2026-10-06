import { hmacSha256, toHex, utf8 } from '../fairness/sha256';

/**
 * Crash point generation (commit–reveal per round).
 *
 *   h  = first 52 bits of HMAC_SHA256(key = roundSeed, msg = salt)
 *   r  = h / 2^52                     ∈ [0, 1)
 *   X  = floor(99 / (1 − r)) / 100     (min 1.00×)
 *
 * P(crash ≥ m) = 0.99 / m  →  1% house edge for any cash-out target.
 * The seed hash is published before the round accepts bets; the seed is
 * revealed when the round crashes.
 */
export const CRASH_HOUSE_EDGE_PCT = 1;
const TWO_52 = 2n ** 52n;

export function crashPointFromHash(hex: string): number {
  const h = BigInt('0x' + hex.slice(0, 13));
  const x100 = (BigInt(100 - CRASH_HOUSE_EDGE_PCT) * TWO_52) / (TWO_52 - h);
  return Math.max(100, Number(x100));
}

export function crashPoint(seed: string, salt: string, hmac = (k: string, m: string) => hmacSha256(utf8(k), utf8(m))): number {
  return crashPointFromHash(toHex(hmac(seed, salt)));
}

/** Growth curve shared by server and client. multiplier(t) = e^(k·t). */
export const CRASH_GROWTH_K = 0.00006; // per ms → 2× ≈ 11.6s, 10× ≈ 38.4s

export function multiplierAt(elapsedMs: number): number {
  return Math.exp(CRASH_GROWTH_K * Math.max(0, elapsedMs));
}

/** multiplier x100, floored — the authoritative cash-out value. */
export function multiplierX100At(elapsedMs: number): number {
  return Math.floor(multiplierAt(elapsedMs) * 100);
}

/** Time (ms from start) at which the multiplier reaches m (x100). */
export function timeForMultiplier(x100: number): number {
  return Math.log(x100 / 100) / CRASH_GROWTH_K;
}
