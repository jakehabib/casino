/**
 * NOVA SlotEngine — type contract.
 *
 * ONE engine evaluates every machine. A machine is a pure-config
 * {@link SlotDefinition} (src/engines/slots/definitions/*). The engine turns
 * (definition, betLevel, bonusState, Rng) into a fully-resolved
 * {@link SpinOutcome}: every grid, win, cascade, transformation and feature
 * the client needs to *animate* the result — and nothing it could use to
 * predict a future spin (no reel stops, no RNG state, no seeds).
 *
 * Money: every paytable value is an integer in HUNDREDTHS OF THE TOTAL BET
 * (250 = 2.5× bet). A win is `floor(betLevel × value × factor / 100)` where
 * `factor` is the product of all integer multipliers (ways count, wild and
 * step multipliers). Integer math only — never floats for money.
 *
 * Coordinates: a position is `[reel, row]`; reel 0 is the leftmost column,
 * row 0 is the TOP row. Grids are `grid[reel][row]` of symbol ids.
 */

/** `[reel, row]` — reel 0 = leftmost, row 0 = top. */
export type Pos = [reel: number, row: number];

/** Grid of symbol ids, indexed `grid[reel][row]`. */
export type Grid = string[][];

export type SymbolKind =
  /** Pays by lines/ways/clusters. */
  | 'regular'
  /** Substitutes for regular symbols (see WildRules). */
  | 'wild'
  /** Pays anywhere + triggers free spins (see ScatterRules). */
  | 'scatter'
  /** Non-paying feature symbol (e.g. a collectable relic, an expanding star). Blocks wins. */
  | 'special';

export interface SymbolDef {
  id: string;
  /** Human name (paytable / accessibility). */
  name: string;
  kind: SymbolKind;
  /** Presentation hint only: 'low' | 'high' | 'premium'. Ignored by the engine. */
  tier?: 'low' | 'high' | 'premium';
  /** Multiplier wild: wins this wild participates in are multiplied (lines: product; ways: counts as N ways). */
  multiplier?: number;
  /** Max copies per reel in a freshly drawn grid (e.g. 1 scatter per reel). Enforced while drawing. */
  maxPerReel?: number;
}

/**
 * Per-reel symbol weights. `weights[reel][symbolId] = integer weight`.
 * Each cell is an independent weighted draw from its reel's table (a
 * "virtual weighted reel"), which also drives cascade refills.
 */
export type ReelWeights = Record<string, number>[];

export type PayMode = 'lines' | 'ways' | 'cluster';

export interface WildRules {
  /** Symbol ids that act as wild. */
  symbols: string[];
  /** Expand each landed wild to fill its whole reel… */
  expand?: 'never' | 'free-spins' | 'always';
}

export interface ScatterRules {
  symbol: string;
  /** Minimum scatters anywhere to pay / trigger. */
  minCount: number;
  /** count → hundredths of total bet (counts above the highest key use the highest key). */
  pays: Record<number, number>;
  /** count → free spins awarded from the base game. */
  freeSpins: Record<number, number>;
  /** count → free spins added when it lands DURING free spins (omit = no retrigger). */
  retrigger?: Record<number, number>;
}

export interface CascadeRules {
  /**
   * Multiplier applied to step N of a spin's cascade chain (step 0 = the
   * landed grid). The last value is the cap. `[1]` = cascades without a ladder.
   */
  multipliers: number[];
  /** Free spins keep the ladder level between spins (it does not reset). */
  persistInFreeSpins?: boolean;
  /** Symbols never drawn by a refill (e.g. feature symbols that only land on the initial grid). */
  refillExclude?: string[];
  /** Hard safety limit on chained cascades per spin. */
  maxCascades?: number;
}

export interface RelicRules {
  /** Collectable symbol (kind 'special', free-spin weights only). */
  symbol: string;
  /** Cumulative relics required for tier 1, 2, 3… */
  thresholds: number[];
  /** Persistent bonus multiplier at tier 0, 1, 2… (length = thresholds.length + 1). */
  multipliers: number[];
  /** Extra free spins granted on reaching each tier. */
  spinsPerTier: number;
}

export interface BonusRules {
  /** Persistent multiplier at the start of free spins (default 1). */
  startMultiplier?: number;
  relics?: RelicRules;
}

/** Random base-game modifiers (rolled after the grid lands, base spins only). */
export type ModifierDef =
  | {
      kind: 'STAR_SURGE';
      weight: number;
      /** Regular symbol id → pick weight for the surge symbol. */
      symbols: Record<string, number>;
      /** Converts `min + int(spread)` random cells into the chosen symbol. */
      min: number;
      spread: number;
    }
  | { kind: 'RELIC_WILDS'; weight: number; wild: string; min: number; spread: number }
  | { kind: 'ORRERY'; weight: number; multipliers: number[]; multiplierWeights: number[] };

export interface ModifierRules {
  /** Probability per base spin that a modifier fires (0..1). */
  chance: number;
  list: ModifierDef[];
}

/** Area expansion: a special symbol that turns its neighbourhood into wilds on landing. */
export interface ExpanderRules {
  symbol: string;
  /** Wild symbol it becomes. */
  wild: string;
  /** Radius 1 = 3×3 block (clamped to the grid). */
  radius: number;
}

export type Volatility = 'low' | 'medium' | 'medium-high' | 'high';

/**
 * A slot machine. Pure configuration: no visuals, no randomness, no I/O.
 */
export interface SlotDefinition {
  id: string;
  name: string;
  reels: number;
  rows: number;
  symbols: SymbolDef[];
  weights: { base: ReelWeights; free: ReelWeights };
  /**
   * symbol → count → value in hundredths of TOTAL bet.
   *  lines:   count = matching symbols from reel 0 along a payline (per line).
   *  ways:    count = consecutive reels from reel 0 (per way).
   *  cluster: count = cluster size; sizes above a listed key use the nearest lower key.
   */
  paytable: Record<string, Record<number, number>>;
  mode: PayMode;
  /** lines mode: one row index per reel for each payline. */
  paylines?: number[][];
  /** cluster mode: minimum cluster size (default 5). */
  clusterMin?: number;
  wildRules: WildRules;
  scatterRules: ScatterRules;
  cascadeRules?: CascadeRules;
  bonusRules: BonusRules;
  modifiers?: ModifierRules;
  expander?: ExpanderRules;
  /** Target RTP in percent (e.g. 96). Verified by scripts/simulate.ts. */
  rtpTarget: number;
  volatility: Volatility;
  /** Max win per ROUND (paid spin + its free spins) in × total bet. Enforced by the engine. */
  maxWinX: number;
  /** Player-facing feature copy for the info modal. */
  featureText: { title: string; body: string }[];
}

// ─────────────────────────────────────────────────────────────
// Outcome
// ─────────────────────────────────────────────────────────────

export type WinKind = 'line' | 'ways' | 'cluster' | 'scatter';

export interface SpinWin {
  kind: WinKind;
  /** Paying symbol id (for an all-wild line, the wild id). */
  symbol: string;
  /** Every cell that is part of this win (wilds included). */
  positions: Pos[];
  /** lines/ways: symbols in a row / reels matched. scatter: scatter count. cluster: cluster size. */
  count: number;
  /** lines: index into `paylines`. */
  lineIndex?: number;
  /** ways: number of ways (product of per-reel matches, multiplier wilds count N). */
  ways?: number;
  /** Paytable value used (hundredths of total bet, per line/way). */
  pay: number;
  /** Total multiplier applied (step multiplier × wild multipliers). */
  multiplier: number;
  /** Credits: floor(betLevel × pay × ways × multiplier / 100). */
  amount: number;
}

export type TransformKind = 'EXPANDING_WILD' | 'SUPERNOVA' | 'STAR_SURGE' | 'RELIC_WILDS';

/** A deterministic change applied to the landed grid before evaluation (animate landed → grid). */
export interface GridTransform {
  kind: TransformKind;
  /** Cell that caused it (expanding wild / supernova), if any. */
  origin?: Pos;
  /** Cells whose symbol became `symbol`. */
  positions: Pos[];
  symbol: string;
}

export type SpinModifier =
  | { kind: 'STAR_SURGE'; symbol: string; positions: Pos[] }
  | { kind: 'RELIC_WILDS'; symbol: string; positions: Pos[] }
  | { kind: 'ORRERY'; multiplier: number };

/**
 * One evaluation of the grid. Non-cascading machines produce exactly one
 * step. Cascading machines produce one step per tumble: step N+1's grid is
 * step N's grid with `removed` cells taken out, survivors falling down
 * (gravity) and new symbols filling from the top (see `applyGravity`).
 */
export interface SpinStep {
  /** The grid that was evaluated (after transforms). */
  grid: Grid;
  /** Step 0 only, present when transforms changed it: the grid as the reels stopped. */
  landed?: Grid;
  /** Step 0 only: transformations landed → grid, in application order. */
  transforms?: GridTransform[];
  /** Step 0 only: random modifiers that fired. */
  modifiers?: SpinModifier[];
  wins: SpinWin[];
  /** Cells removed after this step (cascade). Absent = chain ended. */
  removed?: Pos[];
  /** Multiplier applied to this step's (non-scatter) wins. */
  multiplier: number;
  /** Sum of `wins[].amount` (before the max-win cap). */
  stepWin: number;
}

export interface RelicProgress {
  /** Relics landed this spin. */
  landed: number;
  /** Total collected in this bonus. */
  collected: number;
  /** Current tier (0 = none). */
  tier: number;
  /** Relics needed for the next tier, or null at max tier. */
  nextAt: number | null;
  /** Tiers gained this spin. */
  tiersGained: number;
}

export interface FreeSpinsInfo {
  /** Spins awarded by THIS spin (trigger, retrigger, relic tiers). */
  awarded: number;
  /** Free spins left after this spin. */
  remaining: number;
  /** Total free spins in this bonus so far (incl. retriggers). */
  total: number;
  /** Free spins played so far (incl. this one, if free). */
  played: number;
  /** Persistent bonus multiplier after this spin (cascade ladder for persistent-ladder machines). */
  multiplier: number;
  /** Accumulated free-spin winnings (excl. the trigger spin). */
  bonusWin: number;
  /** Whole-round winnings incl. the trigger spin. */
  roundWin: number;
  triggered: boolean;
  retriggered: boolean;
  /** The bonus finished with this spin. */
  ended: boolean;
  relics?: RelicProgress;
}

export type SpinFeature =
  | 'FREE_SPINS_TRIGGERED'
  | 'FREE_SPINS_RETRIGGERED'
  | 'FREE_SPINS_ENDED'
  | 'EXPANDING_WILD'
  | 'CASCADE'
  | 'SCATTER_WIN'
  | 'STAR_SURGE'
  | 'RELIC_WILDS'
  | 'ORRERY'
  | 'SUPERNOVA'
  | 'RELIC_TIER_UP'
  | 'MAX_WIN';

export interface SpinOutcome {
  /** Outcome schema version. */
  v: 1;
  slotId: string;
  /** Stake level the wins were computed from (locked bet level during free spins). */
  betLevel: number;
  isFreeSpin: boolean;
  steps: SpinStep[];
  /** Credits won by this spin (after the max-win cap). */
  totalWin: number;
  features: SpinFeature[];
  /** Present while a bonus is running or was triggered/ended by this spin. */
  freeSpins: FreeSpinsInfo | null;
  /** Bonus state to persist for the next spin (null = back to the base game). */
  bonusStateAfter: BonusState | null;
  /** True when the round hit maxWinX × bet (wins were truncated and any bonus ended). */
  maxWinReached: boolean;
}

/**
 * Persisted between spins (SlotGame.bonusState). Contains no RNG state — the
 * next spin's randomness comes from the next fairness nonce.
 */
export interface BonusState {
  v: 1;
  kind: 'FREE_SPINS';
  slotId: string;
  /** Bet level locked in by the trigger spin. */
  betLevel: number;
  remaining: number;
  total: number;
  played: number;
  /** Persistent bonus multiplier (relic tiers). */
  multiplier: number;
  /** Cascade ladder index carried between free spins (persistInFreeSpins). */
  cascadeLevel: number;
  relics: number;
  relicTier: number;
  /** Free-spin winnings so far. */
  bonusWin: number;
  /** Round winnings so far incl. the trigger spin (max-win cap accounting). */
  roundWin: number;
}

/** Engine input. */
export interface SpinInput {
  betLevel: number;
  /** Current bonus state (null in the base game). A free spin is played when remaining > 0. */
  bonusState: BonusState | null;
}
