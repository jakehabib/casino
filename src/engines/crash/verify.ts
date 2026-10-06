import { crashPoint } from './crash-math';
import { sha256, toHex, utf8 } from '../fairness/sha256';

/**
 * Public, browser-safe verifier for a Launch (crash) round.
 *
 *   seedHash       = SHA256(seed)                       — published before betting opens
 *   crashPointX100 = floor(99 · 2^52 / (2^52 − h))      — h = first 52 bits of HMAC_SHA256(seed, salt)
 *
 * `salt` is the fixed public salt (CRASH_SALT, "nova-launch-v1"). Pure JS, so
 * it runs identically in Node and in the /fairness page.
 */
export function verifyCrash(seed: string, salt: string): { crashPointX100: number; seedHash: string } {
  return { crashPointX100: crashPoint(seed, salt), seedHash: toHex(sha256(utf8(seed))) };
}
