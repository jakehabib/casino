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

/** Fixed public salt mixed into every round's crash point (documented on /fairness). */
export const CRASH_SALT = 'nova-launch-v1';

/** Absolute server time (ms) at which a round with this crash point ends. */
export function crashTimeMs(startedAt: number, crashPointX100: number): number {
  return startedAt + timeForMultiplier(crashPointX100);
}

/**
 * Authoritative "can this still be cashed out?" check. The multiplier is read
 * from elapsed time; reaching the crash point (or the crash instant) loses —
 * ties at the crash point lose.
 */
export function isBeforeCrash(elapsedMs: number, crashPointX100: number): boolean {
  if (elapsedMs < 0) return false;
  return multiplierX100At(elapsedMs) < crashPointX100 && elapsedMs < timeForMultiplier(crashPointX100);
}

/** Gross payout for a cash-out (integer Credits, floored). */
export function crashPayout(amount: bigint, cashoutX100: number): bigint {
  return (amount * BigInt(cashoutX100)) / 100n;
}

/** Visual tier for a crash point: grey < 2×, accent ≥ 2×, gold ≥ 10×. */
export function crashTier(x100: number): 'low' | 'mid' | 'high' {
  return x100 >= 1000 ? 'high' : x100 >= 200 ? 'mid' : 'low';
}
