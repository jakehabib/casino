import type { BetType } from './bets';

/** Wire types shared by the roulette API routes and the client. Credits are numbers on the wire. */

export interface RouletteBetResult {
  type: BetType;
  numbers: number[];
  amount: number;
  payout: number;
  won: boolean;
}

export interface RouletteSpinResult {
  roundId: string;
  winningNumber: number;
  bets: RouletteBetResult[];
  totalWagered: number;
  totalPayout: number;
  /** Wallet balance after settlement (server truth). */
  balance: number;
  createdAt: string;
  /** True when this response is a replay of an already-settled request. */
  replay?: boolean;
}

export interface RouletteLimits {
  minBet: number;
  maxBet: number;
  maxStraightBet: number;
  maxOutsideBet: number;
}

export interface RouletteRecent {
  id: string;
  winningNumber: number;
  totalWagered: number;
  totalPayout: number;
  createdAt: string;
}

export interface RouletteState {
  enabled: boolean;
  limits: RouletteLimits;
  /** Per bet type min/max per spot. */
  betLimits: Record<BetType, { min: number; max: number; odds: number }>;
  recent: RouletteRecent[];
  lastRound: RouletteSpinResult | null;
}

/** `data` payload of RoundDetail for roulette. */
export interface RouletteRoundData {
  winningNumber: number;
  bets: RouletteBetResult[];
}
