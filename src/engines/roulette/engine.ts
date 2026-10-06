import type { Rng } from '@/engines/fairness/rng';
import { BET_LABEL, PAYOUT_ODDS, isInside, resolveSpot, type BetSpot, type BetType } from './bets';
import { POCKETS } from './wheel';

/**
 * Pure roulette round logic: bet validation against table limits, the
 * winning-number draw and settlement. No DB, no React. Integer credits only.
 */

export interface BetInput {
  type: string;
  numbers: readonly number[];
  amount: number | bigint;
}

export interface ValidBet {
  spot: BetSpot;
  type: BetType;
  numbers: number[];
  amount: bigint;
}

export interface TableLimits {
  minBet: number;
  maxBet: number; // total staked per spin
  maxStraightBet: number; // per inside spot
  maxOutsideBet: number; // per outside spot
}

export const MAX_BETS_PER_SPIN = 160;

export type BetRejection =
  | { code: 'ILLEGAL_BET'; index: number }
  | { code: 'INVALID_AMOUNT'; index: number }
  | { code: 'NO_BETS' }
  | { code: 'TOO_MANY_BETS'; max: number }
  | { code: 'BET_TOO_LOW'; spot: string; min: number }
  | { code: 'BET_TOO_HIGH'; spot: string; max: number; label: string }
  | { code: 'TABLE_MAX'; max: number; total: bigint };

export type ValidationResult = { ok: true; bets: ValidBet[]; total: bigint } | { ok: false; error: BetRejection };

/** Per-spot maximum for a bet type under the given limits. */
export function spotMax(type: BetType, limits: Pick<TableLimits, 'maxStraightBet' | 'maxOutsideBet'>): number {
  return isInside(type) ? limits.maxStraightBet : limits.maxOutsideBet;
}

/**
 * Validate a full bet slip. Bets on the same spot are merged (amounts summed)
 * before per-spot limits are checked, so splitting a stake across duplicate
 * entries cannot bypass a limit.
 */
export function validateBets(input: readonly BetInput[], limits: TableLimits): ValidationResult {
  if (input.length === 0) return { ok: false, error: { code: 'NO_BETS' } };
  if (input.length > MAX_BETS_PER_SPIN) return { ok: false, error: { code: 'TOO_MANY_BETS', max: MAX_BETS_PER_SPIN } };
  const merged = new Map<string, ValidBet>();
  for (let i = 0; i < input.length; i++) {
    const b = input[i];
    const spot = resolveSpot(b.type, b.numbers);
    if (!spot) return { ok: false, error: { code: 'ILLEGAL_BET', index: i } };
    const amount = typeof b.amount === 'bigint' ? b.amount : Number.isSafeInteger(b.amount) ? BigInt(b.amount) : -1n;
    if (amount <= 0n) return { ok: false, error: { code: 'INVALID_AMOUNT', index: i } };
    const prev = merged.get(spot.id);
    if (prev) prev.amount += amount;
    else merged.set(spot.id, { spot, type: spot.type, numbers: [...spot.numbers], amount });
  }
  let total = 0n;
  for (const bet of merged.values()) {
    if (bet.amount < BigInt(limits.minBet)) return { ok: false, error: { code: 'BET_TOO_LOW', spot: bet.spot.id, min: limits.minBet } };
    const max = spotMax(bet.type, limits);
    if (bet.amount > BigInt(max)) {
      return { ok: false, error: { code: 'BET_TOO_HIGH', spot: bet.spot.id, max, label: BET_LABEL[bet.type] } };
    }
    total += bet.amount;
  }
  if (total > BigInt(limits.maxBet)) return { ok: false, error: { code: 'TABLE_MAX', max: limits.maxBet, total } };
  return { ok: true, bets: [...merged.values()], total };
}

/** The winning number is the FIRST draw of the round's fair RNG. */
export function drawWinningNumber(rng: Rng): number {
  return rng.int(POCKETS);
}

export interface SettledBet extends ValidBet {
  won: boolean;
  /** Gross return (stake + winnings), 0 for a losing bet. */
  payout: bigint;
}

export interface Settlement {
  winningNumber: number;
  bets: SettledBet[];
  totalWagered: bigint;
  totalPayout: bigint;
}

export function settle(bets: readonly ValidBet[], winningNumber: number): Settlement {
  let totalWagered = 0n;
  let totalPayout = 0n;
  const settled = bets.map((b) => {
    const won = b.numbers.includes(winningNumber);
    const payout = won ? b.amount * BigInt(PAYOUT_ODDS[b.type] + 1) : 0n;
    totalWagered += b.amount;
    totalPayout += payout;
    return { ...b, won, payout };
  });
  return { winningNumber, bets: settled, totalWagered, totalPayout };
}
