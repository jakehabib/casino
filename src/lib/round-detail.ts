import type { GameKey } from './games';

/**
 * Standard payload of GET /api/games/<game>/rounds/[id] — used by the history
 * modal and the fairness verifier. `data` is game-specific and rendered by the
 * game's own <RoundDetail/> component (src/components/games/<game>/round-detail.tsx).
 */
export interface RoundDetail<T = unknown> {
  game: GameKey;
  id: string;
  variant?: string | null;
  createdAt: string;
  wager: number;
  payout: number;
  net: number;
  summary: string;
  fairness: {
    serverSeedHash: string;
    clientSeed: string;
    nonce: number;
    /** Present only after the seed pair has been rotated / round revealed. */
    serverSeed: string | null;
    revealed: boolean;
    /** Extra verifier inputs (e.g. decks, shoe positions, crash salt, slot bet level). */
    extra?: Record<string, unknown>;
  } | null;
  forced?: boolean;
  data: T;
}
