import { rankOf, type Card } from '../cards/cards';

/**
 * Punto Banco drawing rules — pure functions, no randomness.
 *
 * Card values: Ace = 1, 2–9 face value, 10/J/Q/K = 0. Hand totals are the
 * sum of card values modulo 10.
 */
const VALUE: Record<string, number> = { A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 0, J: 0, Q: 0, K: 0 };

export function cardValue(card: Card): number {
  const v = VALUE[rankOf(card)];
  if (v === undefined) throw new Error(`Invalid card: ${card}`);
  return v;
}

export function handTotal(cards: readonly Card[]): number {
  let t = 0;
  for (const c of cards) t += cardValue(c);
  return t % 10;
}

/** A two-card 8 or 9. */
export function isNatural(total: number): boolean {
  return total >= 8;
}

/** Player draws on 0–5, stands on 6–7 (naturals are handled before this). */
export function playerDraws(playerTotal: number): boolean {
  return playerTotal <= 5;
}

/**
 * Banker's third-card decision.
 *
 * `playerThird` is the VALUE (0–9) of the Player's third card, or null when
 * the Player stood on two cards. Exact standard tableau:
 *
 *   Player stood      → Banker draws on 0–5, stands on 6–7
 *   Banker 0–2        → draws
 *   Banker 3          → draws unless Player's third card is 8
 *   Banker 4          → draws if Player's third card is 2–7
 *   Banker 5          → draws if Player's third card is 4–7
 *   Banker 6          → draws if Player's third card is 6–7
 *   Banker 7          → stands
 */
export function bankerDraws(bankerTotal: number, playerThird: number | null): boolean {
  if (bankerTotal >= 7) return false;
  if (playerThird === null) return bankerTotal <= 5;
  switch (bankerTotal) {
    case 0:
    case 1:
    case 2:
      return true;
    case 3:
      return playerThird !== 8;
    case 4:
      return playerThird >= 2 && playerThird <= 7;
    case 5:
      return playerThird >= 4 && playerThird <= 7;
    case 6:
      return playerThird === 6 || playerThird === 7;
    default:
      return false;
  }
}
