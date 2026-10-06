import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RULES,
  applyAction,
  blackjackReturn,
  dealerShouldHit,
  handValue,
  isBlackjack,
  legalActions,
  startRound,
  toTableView,
  formatTotal,
  BlackjackEngineError,
  type BlackjackAction,
  type BlackjackRules,
  type BlackjackState,
} from '@/engines/blackjack';

/** Deterministic draw from a fixed list (deal order: P1, D-up, P2, D-hole, ...). */
function deck(cards: string[]) {
  const q = [...cards];
  return () => {
    const c = q.shift();
    if (!c) throw new Error('test deck exhausted');
    return c;
  };
}

function play(cards: string[], actions: BlackjackAction[], rules: Partial<BlackjackRules> = {}, bet = 1000n) {
  const draw = deck(cards);
  let { state } = startRound({ ...DEFAULT_RULES, ...rules }, bet, draw);
  for (const a of actions) state = applyAction(state, a, draw).state;
  return state;
}

const outcomes = (s: BlackjackState) => s.hands.map((h) => [h.outcome, h.payout]);

describe('hand values', () => {
  it('computes hard and soft totals', () => {
    expect(handValue(['AS', '6H'])).toEqual({ total: 17, soft: true });
    expect(handValue(['AS', '6H', 'TD'])).toEqual({ total: 17, soft: false });
    expect(handValue(['AS', 'AH'])).toEqual({ total: 12, soft: true });
    expect(handValue(['AS', 'AH', '9C'])).toEqual({ total: 21, soft: true });
    expect(handValue(['KS', 'QH', '2C'])).toEqual({ total: 22, soft: false });
    expect(handValue(['5S', '6H'])).toEqual({ total: 11, soft: false });
  });
  it('recognises naturals', () => {
    expect(isBlackjack(['AS', 'KD'])).toBe(true);
    expect(isBlackjack(['TS', 'AD'])).toBe(true);
    expect(isBlackjack(['7S', '7D', '7C'])).toBe(false);
  });
  it('formats soft totals', () => {
    expect(formatTotal(17, true)).toBe('7 / 17');
    expect(formatTotal(21, true)).toBe('21');
    expect(formatTotal(15, false)).toBe('15');
  });
  it('pays 3:2 and 6:5 with integer floor', () => {
    expect(blackjackReturn(1000n, '3:2')).toBe(2500n);
    expect(blackjackReturn(1001n, '3:2')).toBe(2502n); // 1001 + floor(1501.5)
    expect(blackjackReturn(1000n, '6:5')).toBe(2200n);
    expect(blackjackReturn(101n, '6:5')).toBe(222n); // 101 + floor(121.2)
  });
});

describe('dealer soft 17', () => {
  it('stands on soft 17 (S17) and hits it under H17', () => {
    expect(dealerShouldHit(['AS', '6D'], false)).toBe(false);
    expect(dealerShouldHit(['AS', '6D'], true)).toBe(true);
    expect(dealerShouldHit(['TS', '7D'], true)).toBe(false);
    expect(dealerShouldHit(['TS', '6D'], false)).toBe(true);
  });
  it('S17 table: dealer stands on A-6', () => {
    // P: T,8 (18) · D: 6 up, A hole → soft 17, stands → player wins
    const s = play(['TS', '6D', '8H', 'AC', '5S'], ['STAND']);
    expect(s.dealer.cards).toEqual(['6D', 'AC']);
    expect(outcomes(s)).toEqual([['WIN', '2000']]);
  });
  it('H17 table: dealer hits A-6', () => {
    const s = play(['TS', '6D', '8H', 'AC', '3S'], ['STAND'], { dealerHitsSoft17: true });
    expect(s.dealer.cards).toEqual(['6D', 'AC', '3S']); // soft 20
    expect(outcomes(s)).toEqual([['LOSS', '0']]);
  });
});

describe('naturals and dealer peek', () => {
  it('player blackjack pays 3:2 immediately without dealer drawing', () => {
    const s = play(['AS', '9D', 'KH', '7C'], []);
    expect(s.phase).toBe('SETTLED');
    expect(s.dealer.cards).toHaveLength(2);
    expect(s.dealer.holeRevealed).toBe(true);
    expect(outcomes(s)).toEqual([['BLACKJACK', '2500']]);
    expect(s.totalPayout).toBe('2500');
  });
  it('player blackjack pays 6:5 when configured', () => {
    const s = play(['AS', '9D', 'KH', '7C'], [], { blackjackPayout: '6:5' });
    expect(outcomes(s)).toEqual([['BLACKJACK', '2200']]);
  });
  it('dealer peeks a ten up-card: dealer blackjack ends the round', () => {
    const s = play(['9S', 'KD', '9H', 'AC'], []);
    expect(s.phase).toBe('SETTLED');
    expect(s.dealerBlackjack).toBe(true);
    expect(outcomes(s)).toEqual([['LOSS', '0']]);
  });
  it('player blackjack pushes against dealer blackjack', () => {
    const s = play(['AS', 'KD', 'KH', 'AC'], []);
    expect(outcomes(s)).toEqual([['PUSH', '1000']]);
  });
  it('no peek needed for low up-card; play continues', () => {
    const s = play(['9S', '5D', '9H', 'KC'], []);
    expect(s.phase).toBe('PLAYER');
    expect(s.dealer.holeRevealed).toBe(false);
  });
});

describe('insurance', () => {
  it('is offered on an ace up-card and wins 2:1 against dealer blackjack', () => {
    const draw = deck(['TS', 'AD', '9H', 'KC']);
    const r0 = startRound(DEFAULT_RULES, 1000n, draw);
    expect(r0.state.phase).toBe('INSURANCE');
    expect(legalActions(r0.state)).toEqual(['INSURANCE', 'DECLINE_INSURANCE']);
    const r1 = applyAction(r0.state, 'INSURANCE', draw);
    expect(r1.stake).toBe(500n);
    const s = r1.state;
    expect(s.phase).toBe('SETTLED');
    expect(s.insurance).toMatchObject({ taken: true, bet: '500', payout: '1500' });
    expect(outcomes(s)).toEqual([['LOSS', '0']]);
    expect(s.totalWagered).toBe('1500');
    expect(s.totalPayout).toBe('1500'); // insurance makes the player whole
  });
  it('insurance loses when the dealer has no blackjack and play continues', () => {
    const s = play(['TS', 'AD', '9H', '7C'], ['INSURANCE']);
    expect(s.phase).toBe('PLAYER');
    expect(s.dealerBlackjack).toBe(false);
    expect(s.dealer.holeRevealed).toBe(false);
    const done = applyAction(s, 'STAND', deck([])).state; // dealer A7 = soft 18 stands
    expect(done.insurance.payout).toBe('0');
    expect(outcomes(done)).toEqual([['WIN', '2000']]);
    expect(done.totalWagered).toBe('1500');
  });
  it('declining insurance then dealer blackjack loses the main bet', () => {
    const s = play(['TS', 'AD', '9H', 'KC'], ['DECLINE_INSURANCE']);
    expect(s.phase).toBe('SETTLED');
    expect(s.insurance).toMatchObject({ decided: true, taken: false, payout: '0' });
    expect(outcomes(s)).toEqual([['LOSS', '0']]);
  });
  it('even money: insured player blackjack vs dealer blackjack', () => {
    const s = play(['AS', 'AD', 'KH', 'KC'], ['INSURANCE']);
    expect(outcomes(s)).toEqual([['PUSH', '1000']]);
    expect(s.insurance.payout).toBe('1500');
  });
  it('not offered when insurance is disabled (dealer still peeks)', () => {
    const s = play(['TS', 'AD', '9H', 'KC'], [], { insurance: false });
    expect(s.insurance.offered).toBe(false);
    expect(s.phase).toBe('SETTLED');
  });
  it('cannot hit before deciding insurance', () => {
    const draw = deck(['TS', 'AD', '9H', '7C', '2S']);
    const { state } = startRound(DEFAULT_RULES, 1000n, draw);
    expect(() => applyAction(state, 'HIT', draw)).toThrow(BlackjackEngineError);
  });
});

describe('player actions', () => {
  it('player bust loses and dealer does not draw', () => {
    const s = play(['TS', '6D', '6H', 'TC', 'KS', '5H'], ['HIT']);
    expect(s.hands[0].outcome).toBe('BUST');
    expect(s.dealer.cards).toEqual(['6D', 'TC']); // revealed, no draw
    expect(s.dealer.holeRevealed).toBe(true);
  });
  it('dealer bust pays even money', () => {
    const s = play(['TS', '6D', '2H', 'TC', '9S'], ['STAND']);
    expect(s.dealer.cards).toEqual(['6D', 'TC', '9S']);
    expect(outcomes(s)).toEqual([['WIN', '2000']]);
  });
  it('push returns the stake', () => {
    const s = play(['TS', '8D', '8H', 'TC'], ['STAND']);
    expect(outcomes(s)).toEqual([['PUSH', '1000']]);
  });
  it('auto-stands on 21', () => {
    const s = play(['5S', '8D', '6H', 'TC', 'TH'], ['HIT']);
    expect(s.phase).toBe('SETTLED');
    expect(outcomes(s)).toEqual([['WIN', '2000']]);
  });
  it('double: doubles the bet, takes exactly one card', () => {
    const draw = deck(['6S', '9D', '5H', 'TC', 'TH']);
    const { state } = startRound(DEFAULT_RULES, 1000n, draw);
    expect(legalActions(state)).toEqual(['HIT', 'STAND', 'DOUBLE']);
    const r = applyAction(state, 'DOUBLE', draw);
    expect(r.stake).toBe(1000n);
    expect(r.state.hands[0]).toMatchObject({ doubled: true, bet: '2000', cards: ['6S', '5H', 'TH'] });
    expect(outcomes(r.state)).toEqual([['WIN', '4000']]);
    expect(r.state.totalWagered).toBe('2000');
  });
  it('double is only available on the first two cards', () => {
    const s = play(['2S', '9D', '3H', 'TC', '4D'], ['HIT']);
    expect(legalActions(s)).toEqual(['HIT', 'STAND']);
  });
  it('rejects illegal actions', () => {
    const s = play(['9S', '5D', '8H', 'KC'], []);
    expect(() => applyAction(s, 'SPLIT', deck([]))).toThrow(/not available/);
    expect(() => applyAction(s, 'INSURANCE', deck([]))).toThrow(BlackjackEngineError);
  });
});

describe('splitting', () => {
  it('split pairs into two hands played in order; split 21 is not blackjack', () => {
    // P: 8,8 · D: 6 up, T hole
    // Split → hand0 gets A (8A = soft 19), stand; hand1 gets 3 (11) → double gets T (21)
    const draw = deck(['8S', '6D', '8H', 'TC', 'AS', '3D', 'TH', '9C']);
    let { state } = startRound(DEFAULT_RULES, 1000n, draw);
    expect(legalActions(state)).toContain('SPLIT');
    const r = applyAction(state, 'SPLIT', draw);
    expect(r.stake).toBe(1000n);
    state = r.state;
    expect(state.hands).toHaveLength(2);
    expect(state.hands[0].cards).toEqual(['8S', 'AS']);
    expect(state.hands[1].cards).toEqual(['8H']); // second card dealt when reached
    expect(state.active).toBe(0);
    state = applyAction(state, 'STAND', draw).state;
    expect(state.active).toBe(1);
    expect(state.hands[1].cards).toEqual(['8H', '3D']);
    expect(legalActions(state)).toContain('DOUBLE'); // double after split
    state = applyAction(state, 'DOUBLE', draw).state;
    // dealer 6T = 16 → draws 9 → bust
    expect(state.dealer.cards).toEqual(['6D', 'TC', '9C']);
    expect(outcomes(state)).toEqual([
      ['WIN', '2000'],
      ['WIN', '4000'],
    ]);
    expect(state.totalWagered).toBe('3000');
  });
  it('a split ace + ten is 21 paying 1:1, not blackjack', () => {
    const s = play(['AS', '9D', 'AH', '8C', 'KS', 'QD'], ['SPLIT']);
    expect(s.phase).toBe('SETTLED');
    expect(s.hands.map((h) => h.cards)).toEqual([
      ['AS', 'KS'],
      ['AH', 'QD'],
    ]);
    expect(outcomes(s)).toEqual([
      ['WIN', '2000'],
      ['WIN', '2000'],
    ]);
  });
  it('split aces receive one card each and cannot be hit', () => {
    const draw = deck(['AS', '9D', 'AH', '8C', '5S', '5D']);
    const { state } = startRound(DEFAULT_RULES, 1000n, draw);
    const s = applyAction(state, 'SPLIT', draw).state;
    expect(s.hands.map((h) => h.cards.length)).toEqual([2, 2]);
    expect(s.phase).toBe('SETTLED'); // no decisions left → dealer played
    expect(outcomes(s)).toEqual([
      ['LOSS', '0'],
      ['LOSS', '0'],
    ]);
  });
  it('split aces may be hit when hitSplitAces is on', () => {
    const draw = deck(['AS', '9D', 'AH', '8C', '5S', '6D']);
    const { state } = startRound({ ...DEFAULT_RULES, hitSplitAces: true }, 1000n, draw);
    const s = applyAction(state, 'SPLIT', draw).state;
    expect(s.phase).toBe('PLAYER');
    expect(legalActions(s)).toEqual(['HIT', 'STAND']); // no double on split aces
  });
  it('does not resplit aces by default', () => {
    const draw = deck(['AS', '9D', 'AH', '8C', 'AD', '6D']);
    const { state } = startRound(DEFAULT_RULES, 1000n, draw);
    const s = applyAction(state, 'SPLIT', draw).state;
    expect(s.hands).toHaveLength(2);
    expect(s.phase).toBe('SETTLED');
  });
  it('resplits aces when resplitAces is on', () => {
    const draw = deck(['AS', '9D', 'AH', '8C', 'AD', '6D', '7S', 'TC']);
    const { state } = startRound({ ...DEFAULT_RULES, resplitAces: true }, 1000n, draw);
    let s = applyAction(state, 'SPLIT', draw).state;
    expect(s.hands[0].cards).toEqual(['AS', 'AD']);
    expect(legalActions(s)).toEqual(['STAND', 'SPLIT']);
    s = applyAction(s, 'SPLIT', draw).state;
    expect(s.hands).toHaveLength(3);
    expect(s.phase).toBe('SETTLED');
    expect(s.hands.map((h) => h.cards)).toEqual([
      ['AS', '6D'],
      ['AD', '7S'],
      ['AH', 'TC'],
    ]);
  });
  it('enforces maxHands on resplits', () => {
    // 8,8 then keep receiving 8s
    const cards = ['8S', '6D', '8H', 'TC', '8D', '8C', '8S', '8H', '8D', '8C'];
    const draw = deck(cards);
    let { state } = startRound({ ...DEFAULT_RULES, maxHands: 3 }, 1000n, draw);
    state = applyAction(state, 'SPLIT', draw).state; // 2 hands, hand0 = 8,8
    expect(legalActions(state)).toContain('SPLIT');
    state = applyAction(state, 'SPLIT', draw).state; // 3 hands, hand0 = 8,8
    expect(state.hands).toHaveLength(3);
    expect(legalActions(state)).not.toContain('SPLIT');
    expect(state.splits).toBe(2);
  });
  it('only identical ranks split (K-Q cannot)', () => {
    const s = play(['KS', '6D', 'QH', 'TC'], []);
    expect(legalActions(s)).not.toContain('SPLIT');
    const t = play(['KS', '6D', 'KH', 'TC'], []);
    expect(legalActions(t)).toContain('SPLIT');
  });
  it('no double after split when DAS is off', () => {
    const draw = deck(['8S', '6D', '8H', 'TC', '3S']);
    const { state } = startRound({ ...DEFAULT_RULES, doubleAfterSplit: false }, 1000n, draw);
    const s = applyAction(state, 'SPLIT', draw).state;
    expect(legalActions(s)).toEqual(['HIT', 'STAND', 'SPLIT'].filter((a) => a !== 'SPLIT'));
  });
  it('dealer does not draw when every split hand busts', () => {
    const draw = deck(['8S', '6D', '8H', 'TC', 'TS', 'KD', '9H', 'QC']);
    let { state } = startRound(DEFAULT_RULES, 1000n, draw);
    state = applyAction(state, 'SPLIT', draw).state; // h0: 8,T
    state = applyAction(state, 'HIT', draw).state; // h0: 8,T,K bust → h1 gets 9
    state = applyAction(state, 'HIT', draw).state; // h1: 8,9,Q bust
    expect(state.phase).toBe('SETTLED');
    expect(state.dealer.cards).toEqual(['6D', 'TC']);
    expect(outcomes(state)).toEqual([
      ['BUST', '0'],
      ['BUST', '0'],
    ]);
  });
});

describe('client view', () => {
  it('hides the hole card and its value until revealed', () => {
    const s = play(['9S', '5D', '9H', 'KC'], []);
    const v = toTableView(s);
    expect(v.dealer.cards).toEqual([
      { c: '5D', i: 1 },
      { c: null, i: 3 },
    ]);
    expect(v.dealer.total).toBe(5);
    expect(JSON.stringify(v)).not.toContain('KC');
    expect(v.legal).toEqual(['HIT', 'STAND', 'DOUBLE', 'SPLIT']);
  });
  it('shows everything once settled', () => {
    const s = play(['9S', '5D', '9H', 'KC', '7S'], ['STAND']);
    const v = toTableView(s);
    expect(v.dealer.revealed).toBe(true);
    expect(v.dealer.cards.map((c) => c.c)).toEqual(['5D', 'KC', '7S']);
    expect(v.dealer.total).toBe(22);
    expect(v.hands[0].outcome).toBe('WIN');
    expect(v.legal).toEqual([]);
  });
});
