import { buildShoe } from '../cards/cards';
import { FairRng, jsHmac } from '../fairness/rng';

/**
 * Provably-fair verification for Blackjack (pure JS — runs in the browser).
 *
 * Each player has a persistent multi-deck shoe, shuffled ONCE with a
 * Fisher–Yates shuffle of an ordered `decks`-deck shoe (deck by deck, suits
 * S/H/D/C, ranks A..K) driven by FairRng(serverSeed, clientSeed, nonce).
 * Rounds consume the shoe sequentially; a round's `positions: [from, to)`
 * are the shoe indices it was dealt, in deal order (P1, D-up, P2, D-hole,
 * then every subsequent draw).
 *
 *   const shoe = verifyBlackjackShoe(serverSeed, clientSeed, nonce, decks);
 *   shoe.slice(from, to) // === the round's dealt cards
 */
export function verifyBlackjackShoe(serverSeed: string, clientSeed: string, nonce: number, decks: number): string[] {
  return buildShoe(decks, new FairRng(serverSeed, clientSeed, nonce, jsHmac));
}
