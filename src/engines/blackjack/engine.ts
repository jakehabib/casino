import {
  blackjackReturn,
  dealerShouldHit,
  handValue,
  insuranceStake,
  isAce,
  isBlackjack,
  isBust,
  isPair,
} from './hand';
import {
  BlackjackEngineError,
  type BlackjackAction,
  type BlackjackRules,
  type BlackjackState,
  type DealtCard,
  type DrawFn,
  type EngineHand,
  type HandOutcome,
  type StepResult,
} from './types';

/**
 * Blackjack state machine (pure, deterministic given the draw function).
 *
 * Deal order: P1, D-up, P2, D-hole. Then:
 *   • dealer up-card Ace (and insurance enabled) → INSURANCE phase
 *   • otherwise / after the insurance decision the dealer peeks (Ace or
 *     ten-value up-card). Dealer blackjack ends the round immediately
 *     (a player natural pushes). A player natural ends the round and pays.
 *   • PLAYER phase: HIT / STAND / DOUBLE / SPLIT on the active hand.
 *   • When every hand is complete the dealer reveals and draws (unless every
 *     hand busted) and the round settles.
 *
 * The engine never mutates its input: every step returns a fresh state.
 */

const clone = (s: BlackjackState): BlackjackState => JSON.parse(JSON.stringify(s)) as BlackjackState;
const big = (s: string) => BigInt(s);
const add = (a: string, b: bigint) => (big(a) + b).toString();

/** Upper bound of cards one action can draw (dealer run + split refills). */
export const MAX_CARDS_PER_ACTION = 24;

function newHand(bet: bigint): EngineHand {
  return { cards: [], ids: [], bet: bet.toString(), doubled: false, fromSplit: false, splitAces: false, done: false, outcome: null, payout: '0' };
}

class Dealer {
  readonly dealt: DealtCard[] = [];
  constructor(
    private readonly s: BlackjackState,
    private readonly draw: DrawFn,
  ) {}
  toHand(i: number) {
    const card = this.draw();
    const id = this.s.drawn++;
    const h = this.s.hands[i];
    h.cards.push(card);
    h.ids.push(id);
    this.dealt.push({ to: 'P', hand: i, card, id });
  }
  toDealer(hole = false) {
    const card = this.draw();
    const id = this.s.drawn++;
    this.s.dealer.cards.push(card);
    this.s.dealer.ids.push(id);
    this.dealt.push({ to: 'D', hand: 0, card, id, ...(hole ? { hole: true } : {}) });
  }
}

/** Start a round: take the base bet and deal P1, D-up, P2, D-hole. */
export function startRound(rules: BlackjackRules, bet: bigint, draw: DrawFn): StepResult {
  if (bet <= 0n) throw new BlackjackEngineError('INVALID_BET', 'Bet must be positive');
  const s: BlackjackState = {
    v: 1,
    rules: { ...rules },
    phase: 'PLAYER',
    baseBet: bet.toString(),
    dealer: { cards: [], ids: [], holeRevealed: false },
    hands: [newHand(bet)],
    active: 0,
    insurance: { offered: false, decided: false, taken: false, bet: '0', payout: '0' },
    dealerBlackjack: null,
    splits: 0,
    drawn: 0,
    totalWagered: bet.toString(),
    totalPayout: '0',
  };
  const d = new Dealer(s, draw);
  d.toHand(0);
  d.toDealer();
  d.toHand(0);
  d.toDealer(true);

  if (rules.insurance && isAce(s.dealer.cards[0]) && insuranceStake(bet) > 0n) {
    s.phase = 'INSURANCE';
    s.insurance.offered = true;
  } else {
    resolveOpening(s, d);
  }
  return { state: s, dealt: d.dealt, stake: bet };
}

/** Dealer peek + naturals. Called once the insurance decision (if any) is made. */
function resolveOpening(s: BlackjackState, d: Dealer) {
  // A dealer blackjack is only possible with an Ace or ten-value up-card,
  // which is exactly when the dealer peeks.
  const dealerBJ = isBlackjack(s.dealer.cards);
  s.dealerBlackjack = dealerBJ;
  if (dealerBJ || isBlackjack(s.hands[0].cards)) {
    for (const h of s.hands) h.done = true;
    settle(s);
    return;
  }
  s.phase = 'PLAYER';
  advance(s, d);
}

function canSplit(s: BlackjackState, h: EngineHand): boolean {
  const r = s.rules;
  if (!r.allowSplit || !isPair(h.cards) || s.hands.length >= r.maxHands) return false;
  if (h.splitAces && !r.resplitAces) return false;
  return true;
}

/** Legal actions for the current state (empty once settled). */
export function legalActions(s: BlackjackState): BlackjackAction[] {
  if (s.phase === 'INSURANCE') return ['INSURANCE', 'DECLINE_INSURANCE'];
  if (s.phase !== 'PLAYER') return [];
  const h = s.hands[s.active];
  if (!h || h.done) return [];
  const out: BlackjackAction[] = [];
  const lockedAces = h.splitAces && !s.rules.hitSplitAces;
  if (!lockedAces) out.push('HIT');
  out.push('STAND');
  if (!h.splitAces && h.cards.length === 2 && (!h.fromSplit || s.rules.doubleAfterSplit)) out.push('DOUBLE');
  if (canSplit(s, h)) out.push('SPLIT');
  return out;
}

/** Extra stake an action would place (for wager pre-checks). */
export function actionStake(s: BlackjackState, action: BlackjackAction): bigint {
  switch (action) {
    case 'DOUBLE':
    case 'SPLIT':
      return big(s.hands[s.active].bet);
    case 'INSURANCE':
      return insuranceStake(big(s.baseBet));
    default:
      return 0n;
  }
}

/** Apply a player action. Throws BlackjackEngineError on an illegal action. */
export function applyAction(state: BlackjackState, action: BlackjackAction, draw: DrawFn): StepResult {
  if (state.phase === 'SETTLED') throw new BlackjackEngineError('ROUND_OVER', 'Round is already settled');
  if (!legalActions(state).includes(action)) {
    throw new BlackjackEngineError('INVALID_ACTION', `${action} is not available`);
  }
  const s = clone(state);
  const d = new Dealer(s, draw);
  let stake = 0n;

  switch (action) {
    case 'INSURANCE': {
      stake = insuranceStake(big(s.baseBet));
      s.insurance = { ...s.insurance, decided: true, taken: true, bet: stake.toString() };
      s.totalWagered = add(s.totalWagered, stake);
      resolveOpening(s, d);
      break;
    }
    case 'DECLINE_INSURANCE': {
      s.insurance = { ...s.insurance, decided: true, taken: false };
      resolveOpening(s, d);
      break;
    }
    case 'HIT': {
      d.toHand(s.active);
      const h = s.hands[s.active];
      if (handValue(h.cards).total >= 21) h.done = true;
      advance(s, d);
      break;
    }
    case 'STAND': {
      s.hands[s.active].done = true;
      advance(s, d);
      break;
    }
    case 'DOUBLE': {
      const h = s.hands[s.active];
      stake = big(h.bet);
      h.bet = (stake * 2n).toString();
      h.doubled = true;
      s.totalWagered = add(s.totalWagered, stake);
      d.toHand(s.active);
      h.done = true;
      advance(s, d);
      break;
    }
    case 'SPLIT': {
      const i = s.active;
      const h = s.hands[i];
      stake = big(h.bet);
      const aces = isAce(h.cards[0]);
      const moved: EngineHand = {
        ...newHand(stake),
        cards: [h.cards.pop()!],
        ids: [h.ids.pop()!],
        fromSplit: true,
        splitAces: aces,
      };
      h.fromSplit = true;
      h.splitAces = aces;
      s.hands.splice(i + 1, 0, moved);
      s.splits++;
      s.totalWagered = add(s.totalWagered, stake);
      // The active hand receives its second card now; the new hand receives
      // its second card when play reaches it (dealt in table order).
      d.toHand(i);
      autoComplete(s, h);
      advance(s, d);
      break;
    }
  }
  return { state: s, dealt: d.dealt, stake };
}

/** Mark a hand complete when no decision remains (21, bust, locked split aces). */
function autoComplete(s: BlackjackState, h: EngineHand) {
  if (h.done) return;
  if (handValue(h.cards).total >= 21) {
    h.done = true;
    return;
  }
  if (h.splitAces && h.cards.length >= 2 && !s.rules.hitSplitAces && !canSplit(s, h)) h.done = true;
}

/** Move to the next undecided hand (dealing split hands their second card) or play the dealer. */
function advance(s: BlackjackState, d: Dealer) {
  for (let i = s.active; i < s.hands.length; i++) {
    const h = s.hands[i];
    if (h.done) continue;
    s.active = i;
    if (h.cards.length === 1) d.toHand(i);
    autoComplete(s, h);
    if (!h.done) return; // player decision required
  }
  s.active = s.hands.length - 1;
  playDealer(s, d);
  settle(s);
}

function playDealer(s: BlackjackState, d: Dealer) {
  s.dealer.holeRevealed = true;
  // If every hand busted, the dealer reveals but does not draw.
  if (s.hands.every((h) => isBust(h.cards))) return;
  while (dealerShouldHit(s.dealer.cards, s.rules.dealerHitsSoft17)) d.toDealer();
}

/** Per-hand outcome against the final dealer hand. */
export function handOutcome(s: BlackjackState, h: EngineHand): { outcome: HandOutcome; payout: bigint } {
  const bet = big(h.bet);
  const dealerBJ = isBlackjack(s.dealer.cards);
  const pv = handValue(h.cards).total;
  if (pv > 21) return { outcome: 'BUST', payout: 0n };
  const natural = !h.fromSplit && s.hands.length === 1 && isBlackjack(h.cards);
  if (natural) {
    if (dealerBJ) return { outcome: 'PUSH', payout: bet };
    return { outcome: 'BLACKJACK', payout: blackjackReturn(bet, s.rules.blackjackPayout) };
  }
  if (dealerBJ) return { outcome: 'LOSS', payout: 0n };
  const dv = handValue(s.dealer.cards).total;
  if (dv > 21 || pv > dv) return { outcome: 'WIN', payout: bet * 2n };
  if (pv === dv) return { outcome: 'PUSH', payout: bet };
  return { outcome: 'LOSS', payout: 0n };
}

function settle(s: BlackjackState) {
  s.dealer.holeRevealed = true;
  s.dealerBlackjack = isBlackjack(s.dealer.cards);
  let total = 0n;
  for (const h of s.hands) {
    const r = handOutcome(s, h);
    h.done = true;
    h.outcome = r.outcome;
    h.payout = r.payout.toString();
    total += r.payout;
  }
  if (s.insurance.taken) {
    const ins = s.dealerBlackjack ? big(s.insurance.bet) * 3n : 0n; // pays 2:1 (+ stake)
    s.insurance.payout = ins.toString();
    total += ins;
  }
  s.totalPayout = total.toString();
  s.phase = 'SETTLED';
}

/** Sum of hand payouts (excludes the insurance side bet). */
export function mainPayout(s: BlackjackState): bigint {
  return s.hands.reduce((a, h) => a + big(h.payout), 0n);
}

export function isSettled(s: BlackjackState): boolean {
  return s.phase === 'SETTLED';
}

/** Dealer up-card is the first dealer card; it is always visible. */
export function upCard(s: BlackjackState) {
  return s.dealer.cards[0];
}
