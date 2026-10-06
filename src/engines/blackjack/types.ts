import type { Card } from '../cards/cards';

export type { Card };

/** Table rules a round is played under (snapshotted onto the game at deal). */
export interface BlackjackRules {
  decks: number;
  dealerHitsSoft17: boolean;
  blackjackPayout: '3:2' | '6:5';
  allowSplit: boolean;
  /** Maximum number of player hands after splitting (2–4). */
  maxHands: number;
  doubleAfterSplit: boolean;
  resplitAces: boolean;
  hitSplitAces: boolean;
  insurance: boolean;
}

export const DEFAULT_RULES: BlackjackRules = {
  decks: 6,
  dealerHitsSoft17: false,
  blackjackPayout: '3:2',
  allowSplit: true,
  maxHands: 4,
  doubleAfterSplit: true,
  resplitAces: false,
  hitSplitAces: false,
  insurance: true,
};

export const BLACKJACK_ACTIONS = ['HIT', 'STAND', 'DOUBLE', 'SPLIT', 'INSURANCE', 'DECLINE_INSURANCE'] as const;
export type BlackjackAction = (typeof BLACKJACK_ACTIONS)[number];

export type HandOutcome = 'WIN' | 'LOSS' | 'PUSH' | 'BLACKJACK' | 'BUST';

/**
 * Round phase. The dealer's turn is resolved synchronously inside the action
 * that ends the player's turn, so a persisted state is never in a dealer phase.
 */
export type BlackjackPhase = 'INSURANCE' | 'PLAYER' | 'SETTLED';

/**
 * Engine state is JSON-serialisable: credit amounts are integer strings
 * (bigint on the server), cards are codes like "AS", "TD".
 * `ids` are the per-round draw sequence numbers of each card (0 = first card
 * dealt) — stable identities the UI uses to animate cards between hands.
 */
export interface EngineHand {
  cards: Card[];
  ids: number[];
  bet: string;
  doubled: boolean;
  fromSplit: boolean;
  /** Hand was formed by splitting aces (one card each unless hitSplitAces). */
  splitAces: boolean;
  done: boolean;
  outcome: HandOutcome | null;
  payout: string;
}

export interface EngineInsurance {
  offered: boolean;
  decided: boolean;
  taken: boolean;
  bet: string;
  payout: string;
}

export interface BlackjackState {
  v: 1;
  rules: BlackjackRules;
  phase: BlackjackPhase;
  baseBet: string;
  dealer: { cards: Card[]; ids: number[]; holeRevealed: boolean };
  hands: EngineHand[];
  /** Index of the hand currently being played. */
  active: number;
  insurance: EngineInsurance;
  /** Known once the dealer has peeked / revealed. */
  dealerBlackjack: boolean | null;
  splits: number;
  /** Cards drawn this round (next card id). */
  drawn: number;
  totalWagered: string;
  totalPayout: string;
}

/** A card drawn during an action (written to the action log). */
export interface DealtCard {
  to: 'P' | 'D';
  hand: number;
  card: Card;
  id: number;
  /** Dealer hole card — dealt face down. */
  hole?: boolean;
}

export type DrawFn = () => Card;

export interface StepResult {
  state: BlackjackState;
  dealt: DealtCard[];
  /** Extra stake this action placed (double / split / insurance). */
  stake: bigint;
}

export class BlackjackEngineError extends Error {
  constructor(
    public readonly code: 'INVALID_ACTION' | 'INVALID_BET' | 'ROUND_OVER',
    message: string,
  ) {
    super(message);
  }
}
