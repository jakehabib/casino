import type { BaccaratOutcome, DealtCard, MainBetType, Side } from '@/engines/baccarat/types';

/** Wire types shared by the Baccarat API and UI (numbers, never bigint). */
export interface BaccaratConfigDto {
  enabled: boolean;
  minBet: number;
  maxBet: number;
  decks: number;
  penetration: number;
  bankerCommissionBps: number;
  tiePayout: number;
}

export interface BaccaratShoeDto {
  shoeNumber: number;
  decks: number;
  totalCards: number;
  cardsDealt: number;
  cardsRemaining: number;
  penetration: number;
  /** The next deal opens a fresh shoe. */
  cutCardReached: boolean;
  roundsDealt: number;
  progress: number;
}

export interface BaccaratBeadDto {
  outcome: BaccaratOutcome;
  playerTotal: number;
  bankerTotal: number;
  natural: boolean;
}

export interface BaccaratBetDto {
  type: MainBetType;
  amount: number;
  payout: number;
  outcome: 'WIN' | 'LOSS' | 'PUSH';
}

export interface BaccaratResultDto {
  id: string;
  createdAt: string;
  shoeRound: number;
  shoeNumber: number;
  deal: DealtCard[];
  playerCards: string[];
  bankerCards: string[];
  playerTotal: number;
  bankerTotal: number;
  natural: boolean;
  naturalSide: Side | 'BOTH' | null;
  playerDrew: boolean;
  bankerDrew: boolean;
  outcome: BaccaratOutcome;
  bets: BaccaratBetDto[];
  totalWagered: number;
  totalPayout: number;
  net: number;
  /** Server balance after settlement (null on state restore). */
  balance: number | null;
  /** Shoe status after this round (null on replay / restore). */
  shoe: BaccaratShoeDto | null;
  forced: boolean;
}

export interface BaccaratStateDto {
  config: BaccaratConfigDto;
  shoe: BaccaratShoeDto | null;
  beadPlate: BaccaratBeadDto[];
  lastGame: BaccaratResultDto | null;
}

export interface BaccaratRoundData {
  deal: DealtCard[];
  playerCards: string[];
  bankerCards: string[];
  playerTotal: number;
  bankerTotal: number;
  natural: boolean;
  naturalSide: Side | 'BOTH' | null;
  outcome: BaccaratOutcome;
  bets: BaccaratBetDto[];
  shoeRound: number;
  shoeNumber: number;
  rules: { bankerCommissionBps: number; tiePayout: number; decks: number };
}
