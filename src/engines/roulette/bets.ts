import { RED_NUMBERS, isRouletteNumber } from './wheel';

/**
 * Bet catalogue for the standard single-zero layout.
 *
 * Layout coordinates: number n (1..36) sits in board column c = ceil(n/3)-1
 * (0..11, left→right) and row r = (n-1) % 3 (0 = bottom "1,4,7…" row,
 * 2 = top "3,6,9…" row). The zero spans the left edge of all three rows.
 *
 * Every legal bet is enumerated once in BET_CATALOGUE; client submissions are
 * normalised (sorted, de-duplicated numbers) and must match an entry exactly,
 * so geometrically impossible bets (e.g. a "split" on 1-5) are rejected.
 */
export const BET_TYPES = [
  'STRAIGHT',
  'SPLIT',
  'STREET',
  'CORNER',
  'SIX_LINE',
  'DOZEN',
  'COLUMN',
  'RED',
  'BLACK',
  'ODD',
  'EVEN',
  'LOW',
  'HIGH',
] as const;
export type BetType = (typeof BET_TYPES)[number];

export const INSIDE_TYPES: ReadonlySet<BetType> = new Set(['STRAIGHT', 'SPLIT', 'STREET', 'CORNER', 'SIX_LINE']);
export const isInside = (t: BetType) => INSIDE_TYPES.has(t);

/** Odds "N to 1". A winning bet returns stake × (N + 1). */
export const PAYOUT_ODDS: Record<BetType, number> = {
  STRAIGHT: 35,
  SPLIT: 17,
  STREET: 11,
  CORNER: 8,
  SIX_LINE: 5,
  DOZEN: 2,
  COLUMN: 2,
  RED: 1,
  BLACK: 1,
  ODD: 1,
  EVEN: 1,
  LOW: 1,
  HIGH: 1,
};

export const BET_LABEL: Record<BetType, string> = {
  STRAIGHT: 'Straight',
  SPLIT: 'Split',
  STREET: 'Street',
  CORNER: 'Corner',
  SIX_LINE: 'Six Line',
  DOZEN: 'Dozen',
  COLUMN: 'Column',
  RED: 'Red',
  BLACK: 'Black',
  ODD: 'Odd',
  EVEN: 'Even',
  LOW: '1–18',
  HIGH: '19–36',
};

export interface BetSpot {
  /** Stable id, e.g. "STRAIGHT:17", "SPLIT:1-2", "DOZEN:13-24", "RED". */
  id: string;
  type: BetType;
  /** Sorted ascending, unique. */
  numbers: readonly number[];
  /** Human label, e.g. "Split 1/2", "First Four", "2nd 12". */
  label: string;
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export function spotId(type: BetType, numbers: readonly number[]): string {
  if (type === 'RED' || type === 'BLACK' || type === 'ODD' || type === 'EVEN' || type === 'LOW' || type === 'HIGH') return type;
  return `${type}:${[...numbers].sort((x, y) => x - y).join('-')}`;
}

function buildCatalogue(): BetSpot[] {
  const out: BetSpot[] = [];
  const add = (type: BetType, nums: number[], label: string) => {
    const numbers = [...nums].sort((a, b) => a - b);
    out.push({ id: spotId(type, numbers), type, numbers, label });
  };

  // Straight ups
  for (let n = 0; n <= 36; n++) add('STRAIGHT', [n], `Straight ${n}`);

  // Splits: zero splits, horizontal (n, n+3) and vertical (n, n+1 within a street)
  for (const n of [1, 2, 3]) add('SPLIT', [0, n], `Split 0/${n}`);
  for (let n = 1; n <= 36; n++) {
    if (n % 3 !== 0) add('SPLIT', [n, n + 1], `Split ${n}/${n + 1}`);
    if (n <= 33) add('SPLIT', [n, n + 3], `Split ${n}/${n + 3}`);
  }

  // Streets (incl. the two zero "trios")
  add('STREET', [0, 1, 2], 'Trio 0/1/2');
  add('STREET', [0, 2, 3], 'Trio 0/2/3');
  for (let s = 1; s <= 34; s += 3) add('STREET', [s, s + 1, s + 2], `Street ${s}–${s + 2}`);

  // Corners (incl. "first four" 0-1-2-3)
  add('CORNER', [0, 1, 2, 3], 'First Four');
  for (let n = 1; n <= 32; n++) {
    if (n % 3 !== 0) add('CORNER', [n, n + 1, n + 3, n + 4], `Corner ${n}/${n + 1}/${n + 3}/${n + 4}`);
  }

  // Six lines (two adjacent streets)
  for (let s = 1; s <= 31; s += 3) add('SIX_LINE', range(s, s + 5), `Six Line ${s}–${s + 5}`);

  // Outside
  add('DOZEN', range(1, 12), '1st 12');
  add('DOZEN', range(13, 24), '2nd 12');
  add('DOZEN', range(25, 36), '3rd 12');
  for (let c = 1; c <= 3; c++) {
    add('COLUMN', range(1, 36).filter((n) => n % 3 === c % 3), `Column ${c}`);
  }
  const all = range(1, 36);
  add('RED', all.filter((n) => RED_NUMBERS.has(n)), 'Red');
  add('BLACK', all.filter((n) => !RED_NUMBERS.has(n)), 'Black');
  add('ODD', all.filter((n) => n % 2 === 1), 'Odd');
  add('EVEN', all.filter((n) => n % 2 === 0), 'Even');
  add('LOW', range(1, 18), '1–18');
  add('HIGH', range(19, 36), '19–36');
  return out;
}

/** Every legal bet on the layout (157 spots). */
export const BET_CATALOGUE: readonly BetSpot[] = buildCatalogue();
export const SPOTS_BY_ID: ReadonlyMap<string, BetSpot> = new Map(BET_CATALOGUE.map((s) => [s.id, s]));

export function getSpot(id: string): BetSpot | undefined {
  return SPOTS_BY_ID.get(id);
}

/**
 * Resolve a (type, numbers) pair submitted by a client to its catalogue spot,
 * or null if it is not a legal bet on the layout. For the six fixed even-money
 * bets an empty number list is accepted as shorthand.
 */
export function resolveSpot(type: string, numbers: readonly unknown[]): BetSpot | null {
  if (!(BET_TYPES as readonly string[]).includes(type)) return null;
  const t = type as BetType;
  if (!numbers.every(isRouletteNumber)) return null;
  const nums = numbers as number[];
  if (new Set(nums).size !== nums.length) return null;
  const spot = SPOTS_BY_ID.get(spotId(t, nums));
  if (!spot || spot.type !== t) return null;
  // Even-money ids ignore the numbers, so allow the empty shorthand there only.
  if (nums.length === 0) return spot.id === t ? spot : null;
  if (spot.numbers.length !== nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) if (sorted[i] !== spot.numbers[i]) return null;
  return spot;
}

export function betWins(spot: Pick<BetSpot, 'numbers'>, winningNumber: number): boolean {
  return spot.numbers.includes(winningNumber);
}

/** Gross return (stake + winnings) for a bet; 0 when it loses. */
export function betPayout(type: BetType, numbers: readonly number[], amount: bigint, winningNumber: number): bigint {
  if (!numbers.includes(winningNumber)) return 0n;
  return amount * BigInt(PAYOUT_ODDS[type] + 1);
}
