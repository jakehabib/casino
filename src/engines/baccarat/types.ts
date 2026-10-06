import type { Card } from '../cards/cards';

export type Side = 'PLAYER' | 'BANKER';
export type BaccaratOutcome = 'PLAYER' | 'BANKER' | 'TIE';

/** Main wagers shipped in V1. */
export const MAIN_BETS = ['PLAYER', 'BANKER', 'TIE'] as const;
export type MainBetType = (typeof MAIN_BETS)[number];
/**
 * Side wagers — engine-supported (see settle.ts) but not offered by the API/UI
 * in V1. Adding one later only needs a config flag + UI zone.
 */
export const SIDE_BETS = ['PLAYER_PAIR', 'BANKER_PAIR', 'PERFECT_PAIR'] as const;
export type SideBetType = (typeof SIDE_BETS)[number];
export type BetType = MainBetType | SideBetType;

export type BetOutcome = 'WIN' | 'LOSS' | 'PUSH';

/** One card as dealt, in order. step: 1 = P1, 2 = B1, 3 = P2, 4 = B2, 5/6 = third cards. */
export interface DealtCard {
  card: Card;
  side: Side;
  /** 1-based position in the deal sequence. */
  step: number;
  /** True for a third card (dealt sideways on the table). */
  third: boolean;
  /** Running totals after this card. */
  playerTotal: number;
  bankerTotal: number;
}

export interface BaccaratRound {
  deal: DealtCard[];
  playerCards: Card[];
  bankerCards: Card[];
  playerTotal: number;
  bankerTotal: number;
  /** Two-card totals (before any third card). */
  playerInitial: number;
  bankerInitial: number;
  /** A natural 8/9 was dealt on either side (both stand). */
  natural: boolean;
  /** Which side(s) had the natural. */
  naturalSide: Side | 'BOTH' | null;
  playerDrew: boolean;
  bankerDrew: boolean;
  outcome: BaccaratOutcome;
  /** First two cards of a side form a pair (same rank). For future side bets. */
  playerPair: boolean;
  bankerPair: boolean;
  /** Number of cards consumed. */
  used: number;
}

export interface BaccaratRules {
  /** Banker commission in basis points (500 = 5%). */
  bankerCommissionBps: number;
  /** Tie pays N:1. */
  tiePayout: number;
  /** Side bet odds (N:1). Only used when side bets are enabled. */
  pairPayout?: number;
  perfectPairPayout?: number;
}

export type Bets = Partial<Record<BetType, bigint>>;

export interface SettledBet {
  type: BetType;
  amount: bigint;
  /** Gross return (stake + winnings); 0 on a loss, stake on a push. */
  payout: bigint;
  outcome: BetOutcome;
}
