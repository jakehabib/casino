import type { Card } from '../cards/cards';
import { rankOf } from '../cards/cards';
import { bankerDraws, cardValue, handTotal, isNatural, playerDraws } from './rules';
import type { BaccaratOutcome, BaccaratRound, DealtCard, Side } from './types';

/** A round never uses more than six cards. */
export const MAX_CARDS_PER_ROUND = 6;

/**
 * Play one Punto Banco round, pulling cards from `draw` in deal order:
 * P1, B1, P2, B2, then Player's third (if any), then Banker's third (if any).
 */
export function playBaccarat(draw: () => Card): BaccaratRound {
  const player: Card[] = [];
  const banker: Card[] = [];
  const deal: DealtCard[] = [];
  const give = (side: Side, third: boolean) => {
    const card = draw();
    cardValue(card); // validates
    (side === 'PLAYER' ? player : banker).push(card);
    deal.push({ card, side, step: deal.length + 1, third, playerTotal: handTotal(player), bankerTotal: handTotal(banker) });
    return card;
  };

  give('PLAYER', false);
  give('BANKER', false);
  give('PLAYER', false);
  give('BANKER', false);

  const playerInitial = handTotal(player);
  const bankerInitial = handTotal(banker);
  const pNat = isNatural(playerInitial);
  const bNat = isNatural(bankerInitial);
  const natural = pNat || bNat;

  let playerDrew = false;
  let bankerDrew = false;
  if (!natural) {
    let playerThird: number | null = null;
    if (playerDraws(playerInitial)) {
      playerThird = cardValue(give('PLAYER', true));
      playerDrew = true;
    }
    if (bankerDraws(bankerInitial, playerThird)) {
      give('BANKER', true);
      bankerDrew = true;
    }
  }

  const playerTotal = handTotal(player);
  const bankerTotal = handTotal(banker);
  const outcome: BaccaratOutcome = playerTotal > bankerTotal ? 'PLAYER' : bankerTotal > playerTotal ? 'BANKER' : 'TIE';

  return {
    deal,
    playerCards: player,
    bankerCards: banker,
    playerTotal,
    bankerTotal,
    playerInitial,
    bankerInitial,
    natural,
    naturalSide: pNat && bNat ? 'BOTH' : pNat ? 'PLAYER' : bNat ? 'BANKER' : null,
    playerDrew,
    bankerDrew,
    outcome,
    playerPair: rankOf(player[0]) === rankOf(player[1]),
    bankerPair: rankOf(banker[0]) === rankOf(banker[1]),
    used: deal.length,
  };
}

/**
 * Play a round from an explicit card sequence (deal order). Extra cards are
 * ignored (`used` says how many were consumed). Throws if too few cards.
 */
export function resolveBaccarat(cards: readonly string[]): BaccaratRound {
  let i = 0;
  return playBaccarat(() => {
    if (i >= cards.length) throw new Error('Not enough cards to complete the round');
    return cards[i++];
  });
}

/** Rebuild the deal-order sequence from stored hands (P1,B1,P2,B2,P3?,B3?). */
export function dealOrderFromHands(playerCards: readonly string[], bankerCards: readonly string[]): string[] {
  const out = [playerCards[0], bankerCards[0], playerCards[1], bankerCards[1]];
  if (playerCards[2]) out.push(playerCards[2]);
  if (bankerCards[2]) out.push(bankerCards[2]);
  return out;
}
