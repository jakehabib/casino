import type { BaccaratRound, BaccaratRules, BetType, Bets, SettledBet } from './types';

const BPS = 10_000n;

/**
 * Banker win return. Commission is charged on the WINNINGS and the
 * commissioned winnings are floored to an integer Credit (rounding favours
 * the house by < 1 Credit):
 *
 *   winnings = floor(bet × (10000 − bps) / 10000)
 *   payout   = bet + winnings
 *
 * e.g. bet 150 @ 5% → winnings floor(142.5) = 142 → payout 292.
 */
export function bankerWinPayout(bet: bigint, commissionBps: number): bigint {
  const winnings = (bet * (BPS - BigInt(commissionBps))) / BPS;
  return bet + winnings;
}

function perfectPair(cards: readonly string[]): boolean {
  // Same rank AND suit (only possible with multiple decks).
  return cards.length >= 2 && cards[0] === cards[1];
}

/** Settle a single wager against a finished round. Integer bigint math only. */
export function settleBet(type: BetType, amount: bigint, round: BaccaratRound, rules: BaccaratRules): SettledBet {
  const win = (payout: bigint): SettledBet => ({ type, amount, payout, outcome: 'WIN' });
  const lose: SettledBet = { type, amount, payout: 0n, outcome: 'LOSS' };
  const push: SettledBet = { type, amount, payout: amount, outcome: 'PUSH' };
  switch (type) {
    case 'PLAYER':
      if (round.outcome === 'TIE') return push;
      return round.outcome === 'PLAYER' ? win(amount * 2n) : lose;
    case 'BANKER':
      if (round.outcome === 'TIE') return push;
      return round.outcome === 'BANKER' ? win(bankerWinPayout(amount, rules.bankerCommissionBps)) : lose;
    case 'TIE':
      return round.outcome === 'TIE' ? win(amount * BigInt(rules.tiePayout + 1)) : lose;
    case 'PLAYER_PAIR':
      return round.playerPair ? win(amount * BigInt((rules.pairPayout ?? 11) + 1)) : lose;
    case 'BANKER_PAIR':
      return round.bankerPair ? win(amount * BigInt((rules.pairPayout ?? 11) + 1)) : lose;
    case 'PERFECT_PAIR':
      return perfectPair(round.playerCards) || perfectPair(round.bankerCards)
        ? win(amount * BigInt((rules.perfectPairPayout ?? 25) + 1))
        : lose;
  }
}

/** Settle every non-zero wager. Order is stable: PLAYER, BANKER, TIE, side bets. */
const ORDER: BetType[] = ['PLAYER', 'BANKER', 'TIE', 'PLAYER_PAIR', 'BANKER_PAIR', 'PERFECT_PAIR'];
export function settleBets(bets: Bets, round: BaccaratRound, rules: BaccaratRules) {
  const settled: SettledBet[] = [];
  for (const type of ORDER) {
    const amount = bets[type];
    if (amount && amount > 0n) settled.push(settleBet(type, amount, round, rules));
  }
  const totalWagered = settled.reduce((a, b) => a + b.amount, 0n);
  const totalPayout = settled.reduce((a, b) => a + b.payout, 0n);
  return { settled, totalWagered, totalPayout };
}
