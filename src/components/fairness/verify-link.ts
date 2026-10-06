import type { RoundDetail } from '@/lib/round-detail';
import type { GameKey } from '@/lib/games';

export type VerifyGame = 'roulette' | 'crash' | 'blackjack' | 'baccarat' | 'slots';

export const VERIFY_GAMES: VerifyGame[] = ['roulette', 'crash', 'blackjack', 'baccarat', 'slots'];

export function verifyGameOf(key: GameKey): VerifyGame {
  return key.toLowerCase() as VerifyGame;
}

/** Values the /fairness verifier reads from its query string. */
export interface VerifyParams {
  game: VerifyGame;
  serverSeed?: string;
  clientSeed?: string;
  nonce?: string;
  seedHash?: string;
  decks?: string;
  from?: string;
  to?: string;
  salt?: string;
  slotId?: string;
  betLevel?: string;
  bonusState?: string;
}

const KEYS: (keyof VerifyParams)[] = ['game', 'serverSeed', 'clientSeed', 'nonce', 'seedHash', 'decks', 'from', 'to', 'salt', 'slotId', 'betLevel', 'bonusState'];

function str(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint') return String(v);
  return undefined;
}

/**
 * Build the verifier parameters for a round. `extra` keys are game-defined;
 * we accept the common spellings (positions:[from,to] or from/to,
 * bonusStateBefore or bonusState).
 */
export function verifyParamsFor(detail: RoundDetail<unknown>): VerifyParams | null {
  const f = detail.fairness;
  if (!f) return null;
  const extra = (f.extra ?? {}) as Record<string, unknown>;
  const positions = Array.isArray(extra.positions) ? (extra.positions as unknown[]) : null;
  const bonus = extra.bonusStateBefore !== undefined ? extra.bonusStateBefore : extra.bonusState;
  const game = verifyGameOf(detail.game);
  const p: VerifyParams = {
    game,
    serverSeed: f.serverSeed ?? undefined,
    seedHash: f.serverSeedHash,
    decks: str(extra.decks),
    from: str(positions?.[0] ?? extra.from),
    to: str(positions?.[1] ?? extra.to),
    salt: str(extra.salt),
    slotId: str(extra.slotId ?? detail.variant ?? undefined),
    betLevel: str(extra.betLevel),
    bonusState: bonus === undefined ? undefined : JSON.stringify(bonus),
  };
  if (game !== 'crash') {
    p.clientSeed = f.clientSeed;
    p.nonce = String(f.nonce);
  }
  return p;
}

export function verifyHref(p: VerifyParams): string {
  const q = new URLSearchParams();
  for (const k of KEYS) {
    const v = p[k];
    if (v !== undefined && v !== '') q.set(k, v);
  }
  return `/fairness?${q.toString()}#verify`;
}

export function readVerifyParams(sp: URLSearchParams): Partial<VerifyParams> {
  const out: Partial<VerifyParams> = {};
  for (const k of KEYS) {
    const v = sp.get(k);
    if (v !== null) (out as Record<string, string>)[k] = v.slice(0, 4000);
  }
  if (out.game && !VERIFY_GAMES.includes(out.game as VerifyGame)) delete out.game;
  return out;
}
