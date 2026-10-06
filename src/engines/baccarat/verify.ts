import { buildShoe } from '../cards/cards';
import { FairRng, jsHmac } from '../fairness/rng';

/**
 * Provably-fair verification for Baccarat (pure JS — runs in the browser).
 *
 * A shoe is shuffled ONCE from (serverSeed, clientSeed, nonce) with a
 * Fisher–Yates shuffle of an ordered `decks`-deck shoe (deck by deck, suits
 * S/H/D/C, ranks A..K). Each round consumes cards [from, to) of that shoe in
 * deal order: P1, B1, P2, B2, then any third cards.
 *
 *   const shoe = verifyBaccaratShoe(serverSeed, clientSeed, nonce, decks);
 *   const round = resolveBaccarat(shoe.slice(from, to));
 */
export function verifyBaccaratShoe(serverSeed: string, clientSeed: string, nonce: number, decks: number): string[] {
  return buildShoe(decks, new FairRng(serverSeed, clientSeed, nonce, jsHmac));
}

export { resolveBaccarat } from './engine';
