import { describe, it, expect } from 'vitest';
import { DEFAULT_RULES, applyAction, startRound, toTableView, type BlackjackState } from '@/engines/blackjack';
import { buildFrames, PACE, type RoundView } from '@/components/games/blackjack/reveal';

function deck(cards: string[]) {
  const q = [...cards];
  return () => q.shift()!;
}

function view(s: BlackjackState, id = 'g1'): RoundView {
  const t = toTableView(s);
  const settled = s.phase === 'SETTLED';
  return {
    ...t,
    id,
    status: settled ? 'SETTLED' : s.phase === 'INSURANCE' ? 'INSURANCE_OFFERED' : 'PLAYER_TURN',
    settled,
    net: settled ? t.totalPayout - t.totalWagered : 0,
    forced: false,
    createdAt: new Date(0).toISOString(),
    settledAt: null,
  };
}

describe('reveal frames', () => {
  it('deals the opening four cards one at a time, hole face down', () => {
    const { state } = startRound(DEFAULT_RULES, 1000n, deck(['9S', '5D', '7H', 'KC']));
    const frames = buildFrames(null, view(state));
    const counts = frames.map((f) => f.view.hands[0].cards.length + f.view.dealer.cards.length);
    expect(counts).toEqual([0, 1, 2, 3, 4, 4]);
    for (const f of frames) if (f.view.dealer.cards[1]) expect(f.view.dealer.cards[1].c).toBeNull();
    expect(frames.at(-1)!.final).toBe(true);
    expect(frames.at(-1)!.view.legal).toEqual(['HIT', 'STAND', 'DOUBLE']);
    expect(frames.slice(0, -1).every((f) => f.view.legal.length === 0)).toBe(true);
  });

  it('on stand: flips the hole card, then dealer draws one by one, then the result', () => {
    const draw = deck(['TS', '6D', '8H', '5C', '3S', '4H']);
    const s0 = startRound(DEFAULT_RULES, 1000n, draw).state;
    const s1 = applyAction(s0, 'STAND', draw).state; // dealer 6,5 → +3 → +4 = 18
    const frames = buildFrames(view(s0), view(s1));
    const dealerSeq = frames.map((f) => f.view.dealer.cards.map((c) => c.c ?? '?').join(','));
    expect(dealerSeq).toEqual(['6D,5C', '6D,5C,3S', '6D,5C,3S,4H', '6D,5C,3S,4H']);
    expect(frames[0].sound).toBe('cardFlip');
    expect(frames[1].delay).toBe(PACE.dealer);
    expect(frames.at(-1)).toMatchObject({ final: true, sound: 'push' });
    expect(frames.slice(0, -1).every((f) => f.view.hands[0].outcome === null)).toBe(true);
  });

  it('natural at the deal: four cards, flip, then blackjack result', () => {
    const { state } = startRound(DEFAULT_RULES, 1000n, deck(['AS', '9D', 'KH', '7C']));
    const frames = buildFrames(null, view(state));
    expect(frames.map((f) => f.sound)).toEqual([undefined, 'cardDeal', 'cardDeal', 'cardDeal', 'cardDeal', 'cardFlip', 'blackjack']);
  });

  it('a hit that does not end the hand reveals one card then the decision', () => {
    const draw = deck(['2S', '5D', '3H', 'KC', '4D']);
    const s0 = startRound(DEFAULT_RULES, 1000n, draw).state;
    const s1 = applyAction(s0, 'HIT', draw).state;
    const frames = buildFrames(view(s0), view(s1));
    expect(frames).toHaveLength(2);
    expect(frames[0].view.hands[0].cards).toHaveLength(3);
    expect(frames[0].delay).toBe(0);
    expect(frames[1].view.legal).toContain('STAND');
  });

  it('instant restore is a single final frame', () => {
    const { state } = startRound(DEFAULT_RULES, 1000n, deck(['9S', '5D', '7H', 'KC']));
    expect(buildFrames(null, view(state), { instant: true })).toHaveLength(1);
  });
});
