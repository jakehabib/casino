import { handValue, isBlackjack } from './hand';
import { legalActions } from './engine';
import type { BlackjackAction, BlackjackPhase, BlackjackRules, BlackjackState, Card, HandOutcome } from './types';

/**
 * Client-safe projection of the engine state. The dealer hole card is
 * replaced by `null` until it is revealed, and the dealer total only counts
 * visible cards. Nothing about the shoe or future cards is included.
 */
export interface ViewCard {
  /** Card code, or null for a face-down card. */
  c: Card | null;
  /** Draw sequence number within the round (stable identity for animation). */
  i: number;
}

export interface HandView {
  cards: ViewCard[];
  bet: number;
  doubled: boolean;
  fromSplit: boolean;
  total: number;
  soft: boolean;
  bust: boolean;
  blackjack: boolean;
  done: boolean;
  outcome: HandOutcome | null;
  payout: number;
}

export interface DealerView {
  cards: ViewCard[];
  /** Total of the visible cards. */
  total: number;
  soft: boolean;
  revealed: boolean;
  blackjack: boolean;
}

export interface TableView {
  phase: BlackjackPhase;
  rules: BlackjackRules;
  baseBet: number;
  totalWagered: number;
  totalPayout: number;
  dealer: DealerView;
  hands: HandView[];
  active: number;
  legal: BlackjackAction[];
  insurance: { offered: boolean; decided: boolean; taken: boolean; bet: number; payout: number };
}

const num = (s: string) => Number(s);

export function toTableView(s: BlackjackState): TableView {
  const revealed = s.dealer.holeRevealed;
  const visible = revealed ? s.dealer.cards : s.dealer.cards.slice(0, 1);
  const dv = handValue(visible);
  return {
    phase: s.phase,
    rules: s.rules,
    baseBet: num(s.baseBet),
    totalWagered: num(s.totalWagered),
    totalPayout: num(s.totalPayout),
    dealer: {
      cards: s.dealer.cards.map((c, idx) => ({ c: idx === 1 && !revealed ? null : c, i: s.dealer.ids[idx] })),
      total: dv.total,
      soft: dv.soft,
      revealed,
      blackjack: revealed && isBlackjack(s.dealer.cards),
    },
    hands: s.hands.map((h) => {
      const v = handValue(h.cards);
      return {
        cards: h.cards.map((c, idx) => ({ c, i: h.ids[idx] })),
        bet: num(h.bet),
        doubled: h.doubled,
        fromSplit: h.fromSplit,
        total: v.total,
        soft: v.soft,
        bust: v.total > 21,
        blackjack: !h.fromSplit && s.hands.length === 1 && isBlackjack(h.cards),
        done: h.done,
        outcome: h.outcome,
        payout: num(h.payout),
      };
    }),
    active: s.active,
    legal: legalActions(s),
    insurance: {
      offered: s.insurance.offered,
      decided: s.insurance.decided,
      taken: s.insurance.taken,
      bet: num(s.insurance.bet),
      payout: num(s.insurance.payout),
    },
  };
}

/** "7 / 17" for soft totals that are still live, otherwise the best total. */
export function formatTotal(total: number, soft: boolean): string {
  return soft && total < 21 ? `${total - 10} / ${total}` : String(total);
}
