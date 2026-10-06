import { hmacSha256, sha256, toHex, utf8 } from './sha256';

/**
 * Provably-fair random stream.
 *
 *   block_i = HMAC_SHA256(key = serverSeed, msg = `${clientSeed}:${nonce}:${i}`)
 *
 * Each 32-byte block yields eight floats; each float consumes four bytes:
 *   f = b0/256 + b1/256² + b2/256³ + b3/256⁴    ∈ [0, 1)
 *
 * Engines never call Math.random(). They receive an `Rng` and draw from it in a
 * fixed, documented order, which makes every outcome reproducible from
 * (serverSeed, clientSeed, nonce).
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
}

export type HmacFn = (key: string, message: string) => Uint8Array;

export const jsHmac: HmacFn = (key, message) => hmacSha256(utf8(key), utf8(message));

export class FairRng implements Rng {
  private block: Uint8Array | null = null;
  private offset = 32;
  private round = 0;
  /** Number of floats drawn so far (diagnostics / verifier display). */
  public draws = 0;

  constructor(
    private readonly serverSeed: string,
    private readonly clientSeed: string,
    private readonly nonce: number,
    private readonly hmac: HmacFn = jsHmac,
  ) {}

  private refill() {
    this.block = this.hmac(this.serverSeed, `${this.clientSeed}:${this.nonce}:${this.round}`);
    this.round++;
    this.offset = 0;
  }

  next(): number {
    if (this.offset >= 32 || !this.block) this.refill();
    const b = this.block!;
    const o = this.offset;
    this.offset += 4;
    this.draws++;
    return b[o] / 256 + b[o + 1] / 65536 + b[o + 2] / 16777216 + b[o + 3] / 4294967296;
  }

  int(n: number): number {
    return Math.floor(this.next() * n);
  }
}

/** Fisher–Yates shuffle driven by an Rng (in place, returns the array). */
export function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/** Weighted pick: returns index into weights. */
export function weightedIndex(weights: readonly number[], rng: Rng, total?: number): number {
  const sum = total ?? weights.reduce((a, b) => a + b, 0);
  let r = rng.next() * sum;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

export function hashServerSeed(seed: string): string {
  return toHex(sha256(utf8(seed)));
}

/** Non-cryptographic fast RNG for simulations only (never for live outcomes). */
export class FastRng implements Rng {
  private s: number;
  constructor(seed = 0x9e3779b9) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    // mulberry32
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
}
