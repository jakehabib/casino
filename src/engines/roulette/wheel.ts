/**
 * European (single-zero) roulette wheel geometry and colours.
 * Pure data — shared by the server engine, the verifier and the UI.
 */

/** Pocket order clockwise around the wheel head, starting at the zero. */
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35,
  3, 26,
] as const;

export const POCKETS = WHEEL_ORDER.length; // 37

export const RED_NUMBERS: ReadonlySet<number> = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type PocketColor = 'red' | 'black' | 'green';

export function colorOf(n: number): PocketColor {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

const INDEX_OF = new Map<number, number>(WHEEL_ORDER.map((n, i) => [n, i]));

/** Index of a number in WHEEL_ORDER (0..36). */
export function pocketIndex(n: number): number {
  const i = INDEX_OF.get(n);
  if (i === undefined) throw new RangeError(`Not a roulette number: ${n}`);
  return i;
}

/** Angular width of one pocket in degrees. */
export const POCKET_DEG = 360 / POCKETS;

export function isRouletteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 36;
}
