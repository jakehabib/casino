import { describe, it, expect } from 'vitest';
import { resolveBaccarat } from '@/engines/baccarat/engine';
import { bankerWinPayout, settleBet, settleBets } from '@/engines/baccarat/settle';

const RULES = { bankerCommissionBps: 500, tiePayout: 8 };
const playerWin = resolveBaccarat(['4S', '2H', '5D', '3C']); // P9 v B5
const bankerWin = resolveBaccarat(['3S', '4H', '4D', '4C']); // P7 v B8
const tie = resolveBaccarat(['9S', '9H', 'KD', 'KC']); // 9 v 9

describe('main bets', () => {
  it('PLAYER pays 1:1, loses on banker, pushes on tie', () => {
    expect(settleBet('PLAYER', 1000n, playerWin, RULES)).toMatchObject({ payout: 2000n, outcome: 'WIN' });
    expect(settleBet('PLAYER', 1000n, bankerWin, RULES)).toMatchObject({ payout: 0n, outcome: 'LOSS' });
    expect(settleBet('PLAYER', 1000n, tie, RULES)).toMatchObject({ payout: 1000n, outcome: 'PUSH' });
  });
  it('BANKER pays 1:1 less 5% commission, pushes on tie', () => {
    expect(settleBet('BANKER', 1000n, bankerWin, RULES)).toMatchObject({ payout: 1950n, outcome: 'WIN' });
    expect(settleBet('BANKER', 1000n, playerWin, RULES)).toMatchObject({ payout: 0n, outcome: 'LOSS' });
    expect(settleBet('BANKER', 1000n, tie, RULES)).toMatchObject({ payout: 1000n, outcome: 'PUSH' });
  });
  it('TIE pays tiePayout:1', () => {
    expect(settleBet('TIE', 100n, tie, RULES)).toMatchObject({ payout: 900n, outcome: 'WIN' });
    expect(settleBet('TIE', 100n, tie, { ...RULES, tiePayout: 9 })).toMatchObject({ payout: 1000n });
    expect(settleBet('TIE', 100n, playerWin, RULES)).toMatchObject({ payout: 0n, outcome: 'LOSS' });
  });
});

describe('banker commission rounding (floor of commissioned winnings)', () => {
  it.each([
    [100n, 500, 195n],
    [150n, 500, 292n], // 142.5 → 142
    [101n, 500, 196n], // 95.95 → 95
    [119n, 500, 232n], // 113.05 → 113
    [1n, 500, 1n], // 0.95 → 0  (stake only)
    [19n, 500, 37n], // 18.05 → 18
    [20n, 500, 39n],
    [250_000n, 500, 487_500n],
    [333n, 250, 657n], // 2.5%: 324.675 → 324
    [777n, 0, 1554n], // no commission
    [1000n, 1000, 1900n],
  ])('bet %s @ %s bps → %s', (bet, bps, expected) => {
    expect(bankerWinPayout(bet, bps)).toBe(expected);
  });
  it('never pays more than an exact 0.95 return and never less than 1 Credit below it', () => {
    for (let b = 1n; b < 2000n; b++) {
      const p = bankerWinPayout(b, 500);
      const exactX100 = b * 195n; // payout × 100
      expect(p * 100n).toBeLessThanOrEqual(exactX100);
      expect(exactX100 - p * 100n).toBeLessThan(100n);
    }
  });
});

describe('multiple wagers', () => {
  it('settles any combination; totals are exact', () => {
    const r = settleBets({ PLAYER: 1000n, BANKER: 500n, TIE: 100n }, tie, RULES);
    expect(r.settled.map((s) => s.outcome)).toEqual(['PUSH', 'PUSH', 'WIN']);
    expect(r.totalWagered).toBe(1600n);
    expect(r.totalPayout).toBe(1000n + 500n + 900n);
    const r2 = settleBets({ BANKER: 150n, TIE: 100n }, bankerWin, RULES);
    expect(r2.totalPayout).toBe(292n);
  });
  it('ignores zero / missing wagers', () => {
    const r = settleBets({ PLAYER: 0n, BANKER: 100n }, playerWin, RULES);
    expect(r.settled).toHaveLength(1);
    expect(r.totalPayout).toBe(0n);
  });
  it('side bets (engine-only in V1) settle on pairs', () => {
    const pairs = resolveBaccarat(['8S', '3H', '8S', '3C']);
    expect(settleBet('PLAYER_PAIR', 10n, pairs, RULES).payout).toBe(120n);
    expect(settleBet('BANKER_PAIR', 10n, pairs, RULES).payout).toBe(120n);
    expect(settleBet('PERFECT_PAIR', 10n, pairs, RULES).payout).toBe(260n);
    expect(settleBet('PERFECT_PAIR', 10n, resolveBaccarat(['8S', '3H', '8D', '3C']), RULES).payout).toBe(0n);
  });
});
