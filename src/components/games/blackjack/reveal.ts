import { handValue } from '@/engines/blackjack/hand';
import type { BlackjackRoundView } from '@/server/services/blackjack/blackjack-service';
import type { SoundName } from '@/audio/audio-manager';

/**
 * Reveal pacing. The server answers each request with the complete new state
 * (e.g. STAND returns the dealer's whole run and the settlement). The UI must
 * never wait on animation to *accept* that state, but it should *reveal* it at
 * a natural pace: cards one by one, hole card flip, dealer draws ~450ms
 * apart, then the result. This module turns (previous view → next view) into
 * a list of intermediate frames. It is pure (no React) and unit tested.
 */
export type RoundView = BlackjackRoundView;

export interface Frame {
  view: RoundView;
  /** Delay before showing this frame, ms (relative to the previous frame). */
  delay: number;
  sound?: SoundName;
  final?: boolean;
}

export const PACE = {
  deal: 300,
  draw: 340,
  flip: 480,
  dealer: 480,
  result: 380,
} as const;

interface CardRef {
  i: number;
  to: 'P' | 'D';
  /** Position within the dealer's hand (dealer cards only). */
  slot: number;
}

function cardsOf(v: RoundView): CardRef[] {
  return [
    ...v.dealer.cards.map((c, slot) => ({ i: c.i, to: 'D' as const, slot })),
    ...v.hands.flatMap((h) => h.cards.map((c) => ({ i: c.i, to: 'P' as const, slot: -1 }))),
  ];
}

const holeShown = (v: RoundView) => v.dealer.cards.length > 1 && v.dealer.cards[1].c !== null;

/** Intermediate projection: only `visible` cards, hole per flag, no results yet. */
export function project(next: RoundView, visible: Set<number>, showHole: boolean): RoundView {
  const dealerCards = next.dealer.cards
    .filter((c) => visible.has(c.i))
    .map((c, slot) => (slot === 1 && !showHole ? { ...c, c: null } : c));
  const dv = handValue(dealerCards.map((c) => c.c).filter((c): c is string => c !== null));
  return {
    ...next,
    settled: false,
    status: next.status === 'SETTLED' ? 'DEALER_TURN' : next.status,
    legal: [],
    net: 0,
    totalPayout: 0,
    insurance: { ...next.insurance, payout: 0 },
    dealer: {
      cards: dealerCards,
      total: dv.total,
      soft: dv.soft,
      revealed: showHole,
      blackjack: false,
    },
    hands: next.hands.map((h) => {
      const cards = h.cards.filter((c) => visible.has(c.i));
      const v = handValue(cards.map((c) => c.c as string));
      return {
        ...h,
        cards,
        total: v.total,
        soft: v.soft,
        bust: v.total > 21,
        blackjack: h.blackjack && cards.length === h.cards.length,
        outcome: null,
        payout: 0,
      };
    }),
  };
}

export function resultSound(v: RoundView): SoundName | undefined {
  if (!v.settled) return undefined;
  if (v.hands.some((h) => h.outcome === 'BLACKJACK')) return 'blackjack';
  if (v.net > 0) return 'win';
  if (v.net === 0) return 'push';
  return 'loss';
}

/**
 * Frames to go from what is on screen (`prev`) to the server's `next` state.
 * With `instant` (restore after refresh, reduced motion) a single final frame.
 */
export function buildFrames(prev: RoundView | null, next: RoundView, opts: { instant?: boolean } = {}): Frame[] {
  const final: Frame = { view: next, delay: 0, final: true, sound: resultSound(next) };
  if (opts.instant) return [final];

  const same = prev !== null && prev.id === next.id;
  const known = new Set(same ? cardsOf(prev).map((c) => c.i) : []);
  const prevHole = same && holeShown(prev);
  const fresh = cardsOf(next)
    .filter((c) => !known.has(c.i))
    .sort((a, b) => a.i - b.i);
  const flipNow = holeShown(next) && !prevHole;

  if (fresh.length === 0 && !flipNow) return [{ ...final, delay: next.settled && same && !prev.settled ? PACE.result : 0 }];

  const frames: Frame[] = [];
  const visible = new Set(known);
  let hole = prevHole;
  const isNewRound = !same;

  // Structural change first (new round, split hands, doubled bet) with no new cards.
  const structural = !same || prev.hands.length !== next.hands.length || prev.totalWagered !== next.totalWagered;
  if (structural) frames.push({ view: project(next, visible, hole), delay: 0 });

  // The hole card turns over before the dealer's first drawn card (or once
  // every card of this step has landed when the dealer does not draw).
  const firstDealerDraw = fresh.findIndex((c) => c.to === 'D' && c.slot >= 2);
  const flipAt = flipNow ? (firstDealerDraw === -1 ? fresh.length : firstDealerDraw) : -1;

  let lastWasDealer = false;
  fresh.forEach((c, idx) => {
    if (idx === flipAt) {
      hole = true;
      frames.push({ view: project(next, visible, hole), delay: PACE.flip, sound: 'cardFlip' });
      lastWasDealer = true;
    }
    visible.add(c.i);
    const delay = isNewRound
      ? idx === 0
        ? 120
        : PACE.deal
      : c.to === 'D' && c.slot >= 2
        ? PACE.dealer
        : idx === 0 && !structural && !lastWasDealer
          ? 0
          : PACE.draw;
    frames.push({ view: project(next, visible, hole), delay, sound: 'cardDeal' });
    lastWasDealer = c.to === 'D';
  });
  if (flipAt === fresh.length) {
    hole = true;
    frames.push({ view: project(next, visible, hole), delay: PACE.flip, sound: 'cardFlip' });
  }

  frames.push({ ...final, delay: next.settled ? PACE.result : 120 });
  return frames;
}
