import { getSpot, spotId, type BetSpot } from '@/engines/roulette/bets';

/**
 * Layout geometry for the inside betting area (zero + 12 streets × 3).
 *
 * Logical coordinates are orientation-independent:
 *   s ∈ [-1, 12]  along the streets (s ∈ [-1,0] is the zero, street i is [i, i+1])
 *   k ∈ [0, 3]    across a street; k = 0 is the "outer" edge next to the dozens
 *                 (where street and six-line bets sit), number 3i+1 is k ∈ [0,1].
 *
 * Horizontal board: x = s + 1 (13 units wide), y = 3 − k (3 units tall).
 * Vertical board:   x = k      (3 units wide),  y = s + 1 (13 units tall).
 */
export type Orientation = 'horizontal' | 'vertical';

export const cellOf = (n: number) => ({ s: Math.ceil(n / 3) - 1, k: (n - 1) % 3 });
const num = (s: number, k: number) => s * 3 + k + 1;

/** Position (in logical coords) where a chip for this spot is drawn. */
export function anchorOf(spot: BetSpot): { s: number; k: number } {
  const ns = spot.numbers;
  if (spot.type === 'STRAIGHT') {
    if (ns[0] === 0) return { s: -0.5, k: 1.5 };
    const c = cellOf(ns[0]);
    return { s: c.s + 0.5, k: c.k + 0.5 };
  }
  if (ns[0] === 0) {
    // Zero combinations sit on the zero line.
    if (spot.type === 'SPLIT') return { s: 0, k: cellOf(ns[1]).k + 0.5 };
    if (spot.type === 'STREET') return { s: 0, k: ns.includes(1) ? 1 : 2 };
    return { s: 0, k: 0 }; // first four
  }
  if (spot.type === 'STREET') return { s: cellOf(ns[0]).s + 0.5, k: 0 };
  if (spot.type === 'SIX_LINE') return { s: cellOf(ns[0]).s + 1, k: 0 };
  // Splits and corners: centroid of the covered cells.
  let s = 0;
  let k = 0;
  for (const n of ns) {
    const c = cellOf(n);
    s += c.s + 0.5;
    k += c.k + 0.5;
  }
  return { s: s / ns.length, k: k / ns.length };
}

/** CSS percentage position for logical coords. */
export function toPercent(o: Orientation, s: number, k: number): { left: string; top: string } {
  return o === 'horizontal'
    ? { left: `${((s + 1) / 13) * 100}%`, top: `${((3 - k) / 3) * 100}%` }
    : { left: `${(k / 3) * 100}%`, top: `${((s + 1) / 13) * 100}%` };
}

/** Convert a pointer position (fractions of the inside area) to logical coords. */
export function toLogical(o: Orientation, fx: number, fy: number): { s: number; k: number } {
  return o === 'horizontal' ? { s: fx * 13 - 1, k: 3 - fy * 3 } : { s: fy * 13 - 1, k: fx * 3 };
}

/**
 * Hit-test: which bet does a pointer at logical (s, k) mean? `es`/`ek` are the
 * edge-snap distances in logical units along each axis (≈ 12px each).
 */
export function spotAt(s: number, k: number, es: number, ek: number): BetSpot | null {
  if (s < -1 || s > 12 || k < -ek || k > 3) return null;
  // Zero cell (away from its edge with the numbers)
  if (s < -es) return getSpot('STRAIGHT:0') ?? null;

  const si = Math.min(11, Math.max(0, Math.floor(s)));
  const ki = Math.min(2, Math.max(0, Math.floor(k)));
  // Nearest street boundary within snap distance (0..12)
  const sb = Math.abs(s - Math.round(s)) <= es ? Math.round(s) : null;
  // Nearest row boundary within snap distance; k = 0 is the outer edge, k = 3 is not betable.
  const kbRaw = Math.abs(k - Math.round(k)) <= ek ? Math.round(k) : null;
  const kb = kbRaw === 3 ? null : kbRaw;

  const pick = (type: Parameters<typeof spotId>[0], ns: number[]) => getSpot(spotId(type, ns)) ?? null;

  // Zero line
  if (sb === 0) {
    if (kb === 0) return pick('CORNER', [0, 1, 2, 3]);
    if (kb === 1) return pick('STREET', [0, 1, 2]);
    if (kb === 2) return pick('STREET', [0, 2, 3]);
    return pick('SPLIT', [0, num(0, ki)]);
  }
  // Outer edge: streets and six lines
  if (kb === 0) {
    if (sb !== null && sb > 0 && sb < 12) return pick('SIX_LINE', [...Array(6)].map((_, i) => num(sb - 1, 0) + i));
    return pick('STREET', [num(si, 0), num(si, 1), num(si, 2)]);
  }
  const interiorS = sb !== null && sb > 0 && sb < 12 ? sb : null;
  if (interiorS !== null && kb !== null) {
    return pick('CORNER', [num(interiorS - 1, kb - 1), num(interiorS - 1, kb), num(interiorS, kb - 1), num(interiorS, kb)]);
  }
  if (kb !== null) return pick('SPLIT', [num(si, kb - 1), num(si, kb)]);
  if (interiorS !== null) return pick('SPLIT', [num(interiorS - 1, ki), num(interiorS, ki)]);
  return pick('STRAIGHT', [num(si, ki)]);
}
