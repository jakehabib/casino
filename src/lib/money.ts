/**
 * Credits are integers. On the server they are bigint (DB BigInt); over the
 * wire and on the client they are JS numbers (always < 2^53).
 */
export function toNum(v: bigint | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error('Credit amount exceeds safe integer range');
  }
  return Number(v);
}

export function toBig(v: number | bigint): bigint {
  if (typeof v === 'bigint') return v;
  if (!Number.isSafeInteger(v)) throw new Error('Credit amounts must be safe integers');
  return BigInt(v);
}

/** floor(amount * num / den) using integer arithmetic only. */
export function mulDiv(amount: bigint, num: bigint, den: bigint): bigint {
  return (amount * num) / den;
}

/** Multiplier stored as integer x100 (e.g. 2.35x -> 235). */
export function applyMultiplierX100(amount: bigint, multX100: number): bigint {
  return (amount * BigInt(multX100)) / 100n;
}
