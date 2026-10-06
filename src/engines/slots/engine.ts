import type { Rng } from '@/engines/fairness/rng';
import type {
  BonusState,
  FreeSpinsInfo,
  Grid,
  GridTransform,
  ModifierDef,
  Pos,
  RelicProgress,
  SlotDefinition,
  SpinFeature,
  SpinInput,
  SpinModifier,
  SpinOutcome,
  SpinStep,
  SpinWin,
} from './types';

/**
 * SlotEngine — one pure engine for every machine.
 *
 * RNG DRAW ORDER (fixed; the verifier depends on it). Every draw is one
 * `rng.next()` float unless noted:
 *
 *   1. Landed grid: reels left→right, rows top→bottom, one weighted draw per
 *      cell from the active weight set (base, or free during free spins).
 *      Symbols with `maxPerReel` that already reached their cap on the reel
 *      are excluded from that draw's table (still exactly one draw).
 *   2. Base spins of machines with `modifiers` only:
 *        a. one draw: fires if  f < modifiers.chance
 *        b. if fired: one weighted draw for the modifier type, then
 *           STAR_SURGE:  symbol (weighted), count (int), positions (partial
 *                        Fisher–Yates over eligible cells, one int per pick)
 *           RELIC_WILDS: count (int), positions (as above)
 *           ORRERY:      multiplier (weighted)
 *   3. Deterministic transforms (no draws): supernova area expansion, then
 *      expanding wilds.
 *   4. Cascades: after each step with wins, removed cells are dropped, the
 *      survivors fall (gravity) and the gap is refilled: reels left→right,
 *      new cells top→bottom, one weighted draw each (refill table = active
 *      weights minus `cascadeRules.refillExclude`).
 *
 * Wins are integers: floor(betLevel × pay × ways × multiplier / 100).
 */

// ─────────────────────────────────────────────────────────────
// Compiled definition (cached per definition object)
// ─────────────────────────────────────────────────────────────

interface ReelTable {
  ids: string[];
  w: number[];
  total: number;
  /** capped symbols on this table: id → max per reel */
  caps: { id: string; max: number; w: number }[];
}

interface Compiled {
  def: SlotDefinition;
  regular: string[];
  isWild: Record<string, boolean>;
  wildMult: Record<string, number>;
  isRegular: Record<string, boolean>;
  scatter: string;
  base: ReelTable[];
  free: ReelTable[];
  baseRefill: ReelTable[];
  freeRefill: ReelTable[];
  /** pay[symbol][count] (hundredths of bet); 0 = no pay */
  pay: Record<string, number[]>;
  ladder: number[];
  maxCascades: number;
}

const cache = new WeakMap<SlotDefinition, Compiled>();

function buildTables(def: SlotDefinition, weights: Record<string, number>[], exclude: string[] = []): ReelTable[] {
  return weights.map((reel) => {
    const ids: string[] = [];
    const w: number[] = [];
    for (const s of def.symbols) {
      const wt = exclude.includes(s.id) ? 0 : (reel[s.id] ?? 0);
      if (wt > 0) {
        if (!Number.isInteger(wt)) throw new Error(`${def.id}: weights must be integers`);
        ids.push(s.id);
        w.push(wt);
      }
    }
    const caps = def.symbols
      .filter((s) => s.maxPerReel !== undefined && ids.includes(s.id))
      .map((s) => ({ id: s.id, max: s.maxPerReel!, w: w[ids.indexOf(s.id)] }));
    return { ids, w, total: w.reduce((a, b) => a + b, 0), caps };
  });
}

export function compile(def: SlotDefinition): Compiled {
  const hit = cache.get(def);
  if (hit) return hit;
  if (def.weights.base.length !== def.reels || def.weights.free.length !== def.reels) {
    throw new Error(`${def.id}: weights must have one table per reel`);
  }
  const isWild: Record<string, boolean> = {};
  const wildMult: Record<string, number> = {};
  const isRegular: Record<string, boolean> = {};
  for (const s of def.symbols) {
    isWild[s.id] = s.kind === 'wild';
    wildMult[s.id] = s.kind === 'wild' ? (s.multiplier ?? 1) : 0;
    isRegular[s.id] = s.kind === 'regular';
  }
  const maxCount = def.mode === 'cluster' ? def.reels * def.rows : def.reels;
  const pay: Record<string, number[]> = {};
  for (const [sym, table] of Object.entries(def.paytable)) {
    const arr = new Array<number>(maxCount + 1).fill(0);
    const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
    for (let n = 0; n <= maxCount; n++) {
      if (def.mode === 'cluster') {
        let v = 0;
        for (const k of keys) if (k <= n) v = table[k];
        arr[n] = v;
      } else {
        arr[n] = table[n] ?? 0;
      }
    }
    pay[sym] = arr;
  }
  const refillExclude = def.cascadeRules?.refillExclude ?? [];
  const c: Compiled = {
    def,
    regular: def.symbols.filter((s) => s.kind === 'regular').map((s) => s.id),
    isWild,
    wildMult,
    isRegular,
    scatter: def.scatterRules.symbol,
    base: buildTables(def, def.weights.base),
    free: buildTables(def, def.weights.free),
    baseRefill: buildTables(def, def.weights.base, refillExclude),
    freeRefill: buildTables(def, def.weights.free, refillExclude),
    pay,
    ladder: def.cascadeRules?.multipliers ?? [1],
    maxCascades: def.cascadeRules?.maxCascades ?? 40,
  };
  cache.set(def, c);
  return c;
}

// ─────────────────────────────────────────────────────────────
// Drawing
// ─────────────────────────────────────────────────────────────

/** One weighted draw for a cell, honouring per-reel caps given the reel's current symbols. */
function drawCell(t: ReelTable, rng: Rng, column: (string | undefined)[]): string {
  let excluded: string[] | null = null;
  let exW = 0;
  for (const cap of t.caps) {
    let n = 0;
    for (const s of column) if (s === cap.id) n++;
    if (n >= cap.max) {
      (excluded ??= []).push(cap.id);
      exW += cap.w;
    }
  }
  let r = rng.next() * (t.total - exW);
  const { ids, w } = t;
  let last = '';
  for (let i = 0; i < ids.length; i++) {
    if (excluded && excluded.includes(ids[i])) continue;
    last = ids[i];
    r -= w[i];
    if (r < 0) return ids[i];
  }
  return last;
}

export function drawGrid(c: Compiled, tables: ReelTable[], rng: Rng): Grid {
  const { reels, rows } = c.def;
  const grid: Grid = new Array(reels);
  for (let r = 0; r < reels; r++) {
    const col: string[] = new Array(rows);
    for (let y = 0; y < rows; y++) col[y] = drawCell(tables[r], rng, col);
    grid[r] = col;
  }
  return grid;
}

/**
 * Gravity used by cascades (shared with the UI so animations match): for each
 * reel, surviving symbols keep their order and fall to the bottom; `newCount`
 * fresh symbols fill rows 0..newCount-1. `moves` maps survivors' rows.
 */
export function gravityPlan(rows: number, reels: number, removed: Pos[]) {
  const gone: boolean[][] = Array.from({ length: reels }, () => new Array<boolean>(rows).fill(false));
  for (const [r, y] of removed) gone[r][y] = true;
  const moves: { reel: number; from: number; to: number }[] = [];
  const newCount: number[] = new Array(reels).fill(0);
  for (let r = 0; r < reels; r++) {
    let to = rows - 1;
    for (let y = rows - 1; y >= 0; y--) {
      if (gone[r][y]) continue;
      moves.push({ reel: r, from: y, to });
      to--;
    }
    newCount[r] = to + 1;
  }
  return { moves, newCount };
}

function refill(c: Compiled, tables: ReelTable[], grid: Grid, removed: Pos[], rng: Rng): Grid {
  const { reels, rows } = c.def;
  const gone: boolean[][] = Array.from({ length: reels }, () => new Array<boolean>(rows).fill(false));
  for (const [r, y] of removed) gone[r][y] = true;
  const next: Grid = new Array(reels);
  for (let r = 0; r < reels; r++) {
    const keep: string[] = [];
    for (let y = 0; y < rows; y++) if (!gone[r][y]) keep.push(grid[r][y]);
    const n = rows - keep.length;
    const col: (string | undefined)[] = new Array(rows);
    for (let i = 0; i < keep.length; i++) col[n + i] = keep[i];
    for (let y = 0; y < n; y++) col[y] = drawCell(tables[r], rng, col);
    next[r] = col as string[];
  }
  return next;
}

// ─────────────────────────────────────────────────────────────
// Evaluation
// ─────────────────────────────────────────────────────────────

const winAmount = (bet: number, pay: number, ways: number, mult: number) => Math.floor((bet * pay * ways * mult) / 100);

/** Paylines, left-to-right from reel 0. Wilds substitute; an all-wild run pays the wild's own pay if better. */
export function evaluateLines(c: Compiled, grid: Grid, bet: number, mult: number, out: SpinWin[]) {
  const { paylines = [], reels } = c.def;
  for (let li = 0; li < paylines.length; li++) {
    const line = paylines[li];
    let target: string | null = null;
    let count = 0;
    let lineMult = 1;
    let wildRun = 0;
    let wildRunMult = 1;
    let leading = true;
    for (let r = 0; r < reels; r++) {
      const s = grid[r][line[r]];
      if (c.isWild[s]) {
        count++;
        lineMult *= c.wildMult[s];
        if (leading) {
          wildRun++;
          wildRunMult *= c.wildMult[s];
        }
        continue;
      }
      leading = false;
      if (!c.isRegular[s]) break;
      if (target === null) {
        target = s;
        count++;
      } else if (s === target) count++;
      else break;
    }
    const symPay = target ? (c.pay[target]?.[count] ?? 0) : 0;
    const wildSym = grid[0][line[0]];
    const wildPay = wildRun > 0 ? (c.pay[wildSym]?.[wildRun] ?? 0) : 0;
    let sym: string;
    let n: number;
    let pay: number;
    let m: number;
    if (symPay * lineMult >= wildPay * wildRunMult && symPay > 0) {
      sym = target!;
      n = count;
      pay = symPay;
      m = lineMult;
    } else if (wildPay > 0) {
      sym = wildSym;
      n = wildRun;
      pay = wildPay;
      m = wildRunMult;
    } else continue;
    const positions: Pos[] = new Array(n);
    for (let r = 0; r < n; r++) positions[r] = [r, line[r]];
    const multiplier = m * mult;
    out.push({ kind: 'line', symbol: sym, positions, count: n, lineIndex: li, pay, multiplier, amount: winAmount(bet, pay, 1, multiplier) });
  }
}

/** Ways: consecutive reels from reel 0 containing the symbol (or a wild). A multiplier wild counts as N ways. */
export function evaluateWays(c: Compiled, grid: Grid, bet: number, mult: number, out: SpinWin[]) {
  const { reels, rows } = c.def;
  for (const s of c.regular) {
    const payRow = c.pay[s];
    if (!payRow) continue;
    let ways = 1;
    let len = 0;
    let hasSym = false;
    for (let r = 0; r < reels; r++) {
      let cnt = 0;
      const col = grid[r];
      for (let y = 0; y < rows; y++) {
        const x = col[y];
        if (x === s) {
          cnt++;
          hasSym = true;
        } else if (c.isWild[x]) cnt += c.wildMult[x];
      }
      if (cnt === 0) break;
      ways *= cnt;
      len++;
    }
    if (!hasSym || len === 0) continue;
    const pay = payRow[len] ?? 0;
    if (pay <= 0) continue;
    const positions: Pos[] = [];
    for (let r = 0; r < len; r++)
      for (let y = 0; y < rows; y++) {
        const x = grid[r][y];
        if (x === s || c.isWild[x]) positions.push([r, y]);
      }
    out.push({ kind: 'ways', symbol: s, positions, count: len, ways, pay, multiplier: mult, amount: winAmount(bet, pay, ways, mult) });
  }
}

/** Cluster pays: orthogonally connected groups of one symbol (wilds join any cluster, and may be shared). */
export function evaluateClusters(c: Compiled, grid: Grid, bet: number, mult: number, out: SpinWin[]) {
  const { reels, rows } = c.def;
  const min = c.def.clusterMin ?? 5;
  const n = reels * rows;
  // Flat cell view: cell i = reel * rows + row. code: 1 = this symbol, 2 = wild, 0 = other.
  const flat: string[] = new Array(n);
  const wild = new Uint8Array(n);
  let present = '';
  for (let r = 0; r < reels; r++)
    for (let y = 0; y < rows; y++) {
      const x = grid[r][y];
      flat[r * rows + y] = x;
      if (c.isWild[x]) wild[r * rows + y] = 1;
      else present += x + '|';
    }
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  const members = new Int32Array(n);
  for (const s of c.regular) {
    const payRow = c.pay[s];
    if (!payRow || !present.includes(s + '|')) continue;
    seen.fill(0);
    for (let start = 0; start < n; start++) {
      if (seen[start] || flat[start] !== s) continue;
      // Flood fill over s ∪ wild. Wilds are re-visited per symbol, so they can
      // be shared between clusters of different symbols.
      let sp = 0;
      let size = 0;
      stack[sp++] = start;
      seen[start] = 1;
      while (sp > 0) {
        const i = stack[--sp];
        members[size++] = i;
        const y = i % rows;
        let j = i - 1; // up
        if (y > 0 && !seen[j] && (flat[j] === s || wild[j])) {
          seen[j] = 1;
          stack[sp++] = j;
        }
        j = i + 1; // down
        if (y < rows - 1 && !seen[j] && (flat[j] === s || wild[j])) {
          seen[j] = 1;
          stack[sp++] = j;
        }
        j = i - rows; // left
        if (j >= 0 && !seen[j] && (flat[j] === s || wild[j])) {
          seen[j] = 1;
          stack[sp++] = j;
        }
        j = i + rows; // right
        if (j < n && !seen[j] && (flat[j] === s || wild[j])) {
          seen[j] = 1;
          stack[sp++] = j;
        }
      }
      if (size < min) continue;
      const pay = payRow[Math.min(size, payRow.length - 1)] ?? 0;
      if (pay <= 0) continue;
      const sorted = Array.from(members.subarray(0, size)).sort((a, b) => a - b);
      const positions: Pos[] = sorted.map((i) => [(i / rows) | 0, i % rows]);
      out.push({ kind: 'cluster', symbol: s, positions, count: size, pay, multiplier: mult, amount: winAmount(bet, pay, 1, mult) });
    }
  }
}

function evaluateMain(c: Compiled, grid: Grid, bet: number, mult: number): SpinWin[] {
  const out: SpinWin[] = [];
  if (c.def.mode === 'lines') evaluateLines(c, grid, bet, mult, out);
  else if (c.def.mode === 'ways') evaluateWays(c, grid, bet, mult, out);
  else evaluateClusters(c, grid, bet, mult, out);
  return out;
}

function lookupCount(table: Record<number, number> | undefined, count: number): number {
  if (!table) return 0;
  let best = 0;
  let bestKey = -1;
  for (const k of Object.keys(table)) {
    const kn = Number(k);
    if (kn <= count && kn > bestKey) {
      bestKey = kn;
      best = table[kn];
    }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────
// Modifiers & transforms
// ─────────────────────────────────────────────────────────────

function weighted(weights: number[], rng: Rng): number {
  let total = 0;
  for (const w of weights) total += w;
  let r = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

/** Partial Fisher–Yates: pick `k` distinct entries of `cells` (one rng.int per pick). */
function pickCells(cells: Pos[], k: number, rng: Rng): Pos[] {
  const arr = cells.slice();
  const n = Math.min(k, arr.length);
  for (let i = 0; i < n; i++) {
    const j = i + rng.int(arr.length - i);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr.slice(0, n).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

function applyModifier(c: Compiled, grid: Grid, mod: ModifierDef, rng: Rng, transforms: GridTransform[]): SpinModifier {
  const { reels, rows } = c.def;
  if (mod.kind === 'ORRERY') {
    return { kind: 'ORRERY', multiplier: mod.multipliers[weighted(mod.multiplierWeights, rng)] };
  }
  const eligible: Pos[] = [];
  if (mod.kind === 'STAR_SURGE') {
    const syms = Object.keys(mod.symbols);
    const symbol = syms[weighted(syms.map((s) => mod.symbols[s]), rng)];
    const k = mod.min + rng.int(mod.spread + 1);
    for (let r = 0; r < reels; r++)
      for (let y = 0; y < rows; y++) if (c.isRegular[grid[r][y]] && grid[r][y] !== symbol) eligible.push([r, y]);
    const positions = pickCells(eligible, k, rng);
    for (const [r, y] of positions) grid[r][y] = symbol;
    transforms.push({ kind: 'STAR_SURGE', positions, symbol });
    return { kind: 'STAR_SURGE', symbol, positions };
  }
  const k = mod.min + rng.int(mod.spread + 1);
  for (let r = 0; r < reels; r++) for (let y = 0; y < rows; y++) if (c.isRegular[grid[r][y]]) eligible.push([r, y]);
  const positions = pickCells(eligible, k, rng);
  for (const [r, y] of positions) grid[r][y] = mod.wild;
  transforms.push({ kind: 'RELIC_WILDS', positions, symbol: mod.wild });
  return { kind: 'RELIC_WILDS', symbol: mod.wild, positions };
}

function applyExpander(c: Compiled, grid: Grid, transforms: GridTransform[]): boolean {
  const ex = c.def.expander;
  if (!ex) return false;
  const { reels, rows } = c.def;
  const origins: Pos[] = [];
  for (let r = 0; r < reels; r++) for (let y = 0; y < rows; y++) if (grid[r][y] === ex.symbol) origins.push([r, y]);
  for (const [or, oy] of origins) {
    const positions: Pos[] = [];
    for (let r = Math.max(0, or - ex.radius); r <= Math.min(reels - 1, or + ex.radius); r++)
      for (let y = Math.max(0, oy - ex.radius); y <= Math.min(rows - 1, oy + ex.radius); y++) {
        const s = grid[r][y];
        if (s === c.scatter || (s === ex.symbol && !(r === or && y === oy))) continue;
        grid[r][y] = ex.wild;
        positions.push([r, y]);
      }
    transforms.push({ kind: 'SUPERNOVA', origin: [or, oy], positions, symbol: ex.wild });
  }
  return origins.length > 0;
}

function applyExpandingWilds(c: Compiled, grid: Grid, transforms: GridTransform[]): boolean {
  const { reels, rows } = c.def;
  let any = false;
  for (let r = 0; r < reels; r++) {
    let origin = -1;
    for (let y = 0; y < rows; y++)
      if (c.isWild[grid[r][y]]) {
        origin = y;
        break;
      }
    if (origin < 0) continue;
    const wild = grid[r][origin];
    const positions: Pos[] = [];
    for (let y = 0; y < rows; y++) {
      if (grid[r][y] === wild) continue;
      grid[r][y] = wild;
      positions.push([r, y]);
    }
    if (positions.length === 0) continue;
    any = true;
    transforms.push({ kind: 'EXPANDING_WILD', origin: [r, origin], positions, symbol: wild });
  }
  return any;
}

const cloneGrid = (g: Grid): Grid => g.map((col) => col.slice());

// ─────────────────────────────────────────────────────────────
// Spin
// ─────────────────────────────────────────────────────────────

/**
 * Play one spin. If `input.bonusState` has free spins remaining, this is a
 * free spin at the bonus' locked bet level; otherwise a paid base spin at
 * `input.betLevel`. Pure and deterministic given the Rng.
 */
export function spin(def: SlotDefinition, input: SpinInput, rng: Rng): SpinOutcome {
  const c = compile(def);
  const bs = input.bonusState && input.bonusState.remaining > 0 ? input.bonusState : null;
  const isFree = bs !== null;
  const bet = isFree ? bs.betLevel : input.betLevel;
  if (!Number.isSafeInteger(bet) || bet <= 0) throw new Error('Invalid bet level');
  const tables = isFree ? c.free : c.base;
  const refillTables = isFree ? c.freeRefill : c.baseRefill;
  const features = new Set<SpinFeature>();

  // 1. Landed grid
  let grid = drawGrid(c, tables, rng);
  const landed = cloneGrid(grid);
  const transforms: GridTransform[] = [];
  const modifiers: SpinModifier[] = [];
  let spinMult = 1;

  // 2. Random modifiers (base game only)
  if (!isFree && def.modifiers) {
    const fired = rng.next() < def.modifiers.chance;
    if (fired) {
      const mod = def.modifiers.list[weighted(def.modifiers.list.map((m) => m.weight), rng)];
      const applied = applyModifier(c, grid, mod, rng, transforms);
      modifiers.push(applied);
      features.add(applied.kind);
      if (applied.kind === 'ORRERY') spinMult = applied.multiplier;
    }
  }

  // 3. Deterministic transforms
  if (applyExpander(c, grid, transforms)) features.add('SUPERNOVA');
  const expand = def.wildRules.expand ?? 'never';
  if (expand === 'always' || (expand === 'free-spins' && isFree)) {
    if (applyExpandingWilds(c, grid, transforms)) features.add('EXPANDING_WILD');
  }

  // 4. Evaluate (+ cascades)
  const persistLadder = isFree && !!def.cascadeRules?.persistInFreeSpins;
  let level = persistLadder ? bs!.cascadeLevel : 0;
  const bonusMult = isFree ? bs!.multiplier : 1;
  const steps: SpinStep[] = [];
  const ladderTop = c.ladder.length - 1;
  for (let i = 0; ; i++) {
    const mult = c.ladder[Math.min(level, ladderTop)] * spinMult * bonusMult;
    const wins = evaluateMain(c, grid, bet, mult);
    let stepWin = 0;
    for (const w of wins) stepWin += w.amount;
    const step: SpinStep = { grid, wins, multiplier: mult, stepWin };
    if (i === 0 && transforms.length) {
      step.landed = landed;
      step.transforms = transforms;
    }
    if (i === 0 && modifiers.length) step.modifiers = modifiers;
    steps.push(step);
    if (!def.cascadeRules || wins.length === 0 || i >= c.maxCascades) break;
    // cascade: remove every winning cell
    const mark = new Uint8Array(def.reels * def.rows);
    const removed: Pos[] = [];
    for (const w of wins)
      for (const [r, y] of w.positions) {
        const k = r * def.rows + y;
        if (!mark[k]) {
          mark[k] = 1;
          removed.push([r, y]);
        }
      }
    removed.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    step.removed = removed;
    features.add('CASCADE');
    grid = refill(c, refillTables, grid, removed, rng);
    level++;
  }

  // 5. Scatters on the final grid
  const last = steps[steps.length - 1];
  const sr = def.scatterRules;
  const scatterPos: Pos[] = [];
  for (let r = 0; r < def.reels; r++) for (let y = 0; y < def.rows; y++) if (last.grid[r][y] === sr.symbol) scatterPos.push([r, y]);
  let awarded = 0;
  let triggered = false;
  let retriggered = false;
  if (scatterPos.length >= sr.minCount) {
    const pay = lookupCount(sr.pays, scatterPos.length);
    if (pay > 0) {
      const amount = winAmount(bet, pay, 1, 1);
      last.wins.push({ kind: 'scatter', symbol: sr.symbol, positions: scatterPos, count: scatterPos.length, pay, multiplier: 1, amount });
      last.stepWin += amount;
      features.add('SCATTER_WIN');
    }
    if (!isFree) {
      awarded = lookupCount(sr.freeSpins, scatterPos.length);
      triggered = awarded > 0;
    } else if (sr.retrigger) {
      awarded = lookupCount(sr.retrigger, scatterPos.length);
      retriggered = awarded > 0;
    }
  }

  // 6. Totals + max-win cap (per round)
  let raw = 0;
  for (const s of steps) raw += s.stepWin;
  const cap = def.maxWinX * bet;
  const before = isFree ? bs!.roundWin : 0;
  let totalWin = raw;
  let maxWinReached = false;
  if (before + raw >= cap) {
    totalWin = Math.max(0, cap - before);
    maxWinReached = true;
    features.add('MAX_WIN');
  }

  // 7. Bonus state transitions
  let bonusStateAfter: BonusState | null = null;
  let freeSpins: FreeSpinsInfo | null = null;
  const relicRules = def.bonusRules.relics;
  const ladderValue = (lv: number) => (def.cascadeRules?.persistInFreeSpins ? c.ladder[Math.min(lv, ladderTop)] : 1);

  if (!isFree) {
    if (triggered && !maxWinReached) {
      features.add('FREE_SPINS_TRIGGERED');
      const startMult = def.bonusRules.startMultiplier ?? relicRules?.multipliers[0] ?? 1;
      bonusStateAfter = {
        v: 1,
        kind: 'FREE_SPINS',
        slotId: def.id,
        betLevel: bet,
        remaining: awarded,
        total: awarded,
        played: 0,
        multiplier: startMult,
        cascadeLevel: 0,
        relics: 0,
        relicTier: 0,
        bonusWin: 0,
        roundWin: totalWin,
      };
      freeSpins = {
        awarded,
        remaining: awarded,
        total: awarded,
        played: 0,
        multiplier: startMult * ladderValue(0),
        bonusWin: 0,
        roundWin: totalWin,
        triggered: true,
        retriggered: false,
        ended: false,
        ...(relicRules ? { relics: { landed: 0, collected: 0, tier: 0, nextAt: relicRules.thresholds[0] ?? null, tiersGained: 0 } } : {}),
      };
    }
  } else {
    const prev = bs!;
    let relics: RelicProgress | undefined;
    let multiplier = prev.multiplier;
    let relicCount = prev.relics;
    let tier = prev.relicTier;
    if (relicRules) {
      let landedRelics = 0;
      for (const col of last.grid) for (const s of col) if (s === relicRules.symbol) landedRelics++;
      relicCount += landedRelics;
      let gained = 0;
      while (tier < relicRules.thresholds.length && relicCount >= relicRules.thresholds[tier]) {
        tier++;
        gained++;
      }
      if (gained > 0) {
        features.add('RELIC_TIER_UP');
        awarded += gained * relicRules.spinsPerTier;
        multiplier = relicRules.multipliers[Math.min(tier, relicRules.multipliers.length - 1)];
      }
      relics = { landed: landedRelics, collected: relicCount, tier, nextAt: relicRules.thresholds[tier] ?? null, tiersGained: gained };
    }
    if (retriggered) features.add('FREE_SPINS_RETRIGGERED');
    const remaining = maxWinReached ? 0 : prev.remaining - 1 + awarded;
    const cascadeLevel = persistLadder ? Math.min(level, ladderTop) : 0;
    const next: BonusState = {
      ...prev,
      remaining,
      total: prev.total + awarded,
      played: prev.played + 1,
      multiplier,
      cascadeLevel,
      relics: relicCount,
      relicTier: tier,
      bonusWin: prev.bonusWin + totalWin,
      roundWin: prev.roundWin + totalWin,
    };
    const ended = remaining <= 0;
    if (ended) features.add('FREE_SPINS_ENDED');
    bonusStateAfter = ended ? null : next;
    freeSpins = {
      awarded,
      remaining: Math.max(0, remaining),
      total: next.total,
      played: next.played,
      multiplier: multiplier * ladderValue(cascadeLevel),
      bonusWin: next.bonusWin,
      roundWin: next.roundWin,
      triggered: false,
      retriggered,
      ended,
      ...(relics ? { relics } : {}),
    };
  }

  return {
    v: 1,
    slotId: def.id,
    betLevel: bet,
    isFreeSpin: isFree,
    steps,
    totalWin,
    features: [...features],
    freeSpins,
    bonusStateAfter,
    maxWinReached,
  };
}

// ─────────────────────────────────────────────────────────────
// Bonus state validation (persisted JSON / verifier input)
// ─────────────────────────────────────────────────────────────

const isInt = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min;

/** Validate an untrusted bonus state. Returns null for "base game"; throws on malformed input. */
export function parseBonusState(def: SlotDefinition, raw: unknown): BonusState | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object') throw new Error('Invalid bonus state');
  const b = raw as Record<string, unknown>;
  const ok =
    b.v === 1 &&
    b.kind === 'FREE_SPINS' &&
    b.slotId === def.id &&
    isInt(b.betLevel, 1) &&
    isInt(b.remaining) &&
    isInt(b.total) &&
    isInt(b.played) &&
    isInt(b.multiplier, 1) &&
    isInt(b.cascadeLevel) &&
    isInt(b.relics) &&
    isInt(b.relicTier) &&
    isInt(b.bonusWin) &&
    isInt(b.roundWin);
  if (!ok) throw new Error('Invalid bonus state');
  const s: BonusState = {
    v: 1,
    kind: 'FREE_SPINS',
    slotId: def.id,
    betLevel: b.betLevel as number,
    remaining: b.remaining as number,
    total: b.total as number,
    played: b.played as number,
    multiplier: b.multiplier as number,
    cascadeLevel: b.cascadeLevel as number,
    relics: b.relics as number,
    relicTier: b.relicTier as number,
    bonusWin: b.bonusWin as number,
    roundWin: b.roundWin as number,
  };
  return s.remaining > 0 ? s : null;
}
