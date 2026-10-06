/**
 * Profile privacy rules. PURE — used by the API and by the settings page's
 * live "what others see" preview, so both always agree.
 *
 *   PUBLIC  → avatar, username, level, join date, games played, favourite
 *             game, selected stats and biggest win — minus any hide* flags.
 *   LIMITED → avatar, username, level, join date, games played.
 *   PRIVATE → avatar, username, level.
 *
 * Responsible-play settings, limits and exclusions are never part of a
 * profile, in any mode.
 */
export type Privacy = 'PUBLIC' | 'LIMITED' | 'PRIVATE';

export interface PrivacyFlags {
  privacy: Privacy;
  hideNetResult: boolean;
  hideTotalWagered: boolean;
  hideTotalWon: boolean;
  hideLargestWin: boolean;
}

export interface FavoriteGame {
  id: string;
  key: string;
  name: string;
  href: string;
  plays: number;
}

/** Full, unfiltered stats as stored (numbers on the wire). */
export interface FullPublicStats {
  joinedAt: string;
  gamesPlayed: number;
  favoriteGame: FavoriteGame | null;
  totalWagered: number;
  totalWon: number;
  netResult: number;
  largestWin: { amount: number; game: string | null } | null;
  highlights: {
    blackjackHands: number;
    blackjacks: number;
    baccaratHands: number;
    rouletteSpins: number;
    crashRounds: number;
    crashHighestCashout: number; // x100
    slotSpins: number;
  };
}

export type HiddenField = 'netResult' | 'totalWagered' | 'totalWon' | 'largestWin';

export interface VisibleStats {
  joinedAt?: string;
  gamesPlayed?: number;
  favoriteGame?: FavoriteGame | null;
  totalWagered?: number;
  totalWon?: number;
  netResult?: number;
  largestWin?: { amount: number; game: string | null } | null;
  highlights?: FullPublicStats['highlights'];
  /** Fields the owner explicitly hid (so the UI can say "Hidden"). */
  hidden: HiddenField[];
  /** Fields withheld automatically because they would reveal a hidden one. */
  derivedHidden?: HiddenField[];
}

export function applyPrivacy(full: FullPublicStats, flags: PrivacyFlags): VisibleStats {
  if (flags.privacy === 'PRIVATE') return { hidden: [] };
  if (flags.privacy === 'LIMITED') return { joinedAt: full.joinedAt, gamesPlayed: full.gamesPlayed, hidden: [] };
  const hidden: HiddenField[] = [];
  const derived: HiddenField[] = [];
  const out: VisibleStats = {
    joinedAt: full.joinedAt,
    gamesPlayed: full.gamesPlayed,
    favoriteGame: full.favoriteGame,
    highlights: full.highlights,
    hidden,
  };
  if (flags.hideTotalWagered) hidden.push('totalWagered');
  else out.totalWagered = full.totalWagered;
  if (flags.hideTotalWon) hidden.push('totalWon');
  else out.totalWon = full.totalWon;
  if (flags.hideNetResult) hidden.push('netResult');
  else out.netResult = full.netResult;
  if (flags.hideLargestWin) hidden.push('largestWin');
  else out.largestWin = full.largestWin;

  // Net = Won − Wagered, so hiding exactly one of the three would be pointless:
  // it could be recomputed from the other two. Withhold a second one too.
  const trio: HiddenField[] = ['totalWagered', 'totalWon', 'netResult'];
  const hiddenTrio = trio.filter((f) => hidden.includes(f));
  if (hiddenTrio.length === 1) {
    const extra: HiddenField = hiddenTrio[0] === 'netResult' ? 'totalWon' : 'netResult';
    delete out[extra];
    derived.push(extra);
  }
  out.derivedHidden = derived;
  return out;
}

/** Which fields are withheld automatically to stop a hidden value being derived. */
export function derivedHiddenFields(flags: PrivacyFlags): HiddenField[] {
  if (flags.privacy !== 'PUBLIC') return [];
  const hidden = [flags.hideTotalWagered && 'totalWagered', flags.hideTotalWon && 'totalWon', flags.hideNetResult && 'netResult'].filter(Boolean) as HiddenField[];
  if (hidden.length !== 1) return [];
  return [hidden[0] === 'netResult' ? 'totalWon' : 'netResult'];
}
