'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useReducedMotion } from 'framer-motion';
import { api, ApiError, requestId } from '@/lib/api';
import { playSound } from '@/audio/audio-manager';
import { useBalance } from '@/stores/balance-store';
import { useGameErrorHandler } from '@/components/games/shared/use-game-action';
import type { GridTransform, Grid, Pos, SpinOutcome, SpinWin } from '@/engines/slots/types';
import type { PublicBonus, PublicSlotDefinition, ReelColumn, SlotSpinResponse, SlotStateResponse } from './types';
import { posKey } from './types';
import { winTier, type WinTier } from './win-counter';

/**
 * useSlotMachine — the shared slot controller. It owns server state (TanStack
 * Query), the spin request (idempotent requestId per action, retried once on
 * a dropped connection) and the presentation TIMELINE that animates a
 * predetermined server outcome:
 *
 *   spin → reels blur → response → staggered stops (+anticipation after
 *   minCount-1 scatters) → transforms (expanding wilds / modifiers) → for each
 *   cascade step: highlight wins → pop → gravity refill → … → big-win tier →
 *   free-spin intro / retrigger / outro → release held balance → autoplay /
 *   free-spin continuation.
 *
 * The client never computes outcomes; it only replays `SpinOutcome.steps`.
 * Machine UIs render the returned state with <ReelGrid/>, <WinOverlay/>,
 * <SlotControls/> etc. (see slot-machine.tsx for the default composition).
 */

export type SlotOverlay =
  | { kind: 'bigwin'; amount: number; bet: number }
  | { kind: 'fs-intro'; spins: number }
  | { kind: 'fs-outro'; spins: number; totalWin: number; bet: number }
  | null;

export interface AutoplayConfig {
  count: number;
  stopOnBonus: boolean;
  stopOnBigWin: boolean;
}

export type SlotPhase = 'loading' | 'idle' | 'spinning' | 'presenting' | 'overlay';

const STORAGE = (slotId: string) => `nova.slot.${slotId}.v1`;

let keySeq = 1;
const nextKey = () => keySeq++;

function toColumns(grid: Grid, dropFrom: number): ReelColumn[] {
  return grid.map((col) => col.map((symbol) => ({ key: nextKey(), symbol, dropFrom })));
}

/** Deterministic, cosmetic attract grid for a first visit (no outcome meaning, never a win line). */
function attractGrid(def: PublicSlotDefinition): Grid {
  const pool = def.symbols.filter((s) => s.kind === 'regular').map((s) => s.id);
  const grid: Grid = [];
  let x = def.id.length * 2654435761;
  for (let r = 0; r < def.reels; r++) {
    const col: string[] = [];
    for (let y = 0; y < def.rows; y++) {
      let pick = '';
      for (let tries = 0; tries < 8; tries++) {
        x = (Math.imul(x, 1103515245) + 12345) >>> 0;
        pick = pool[(x >>> 8) % pool.length];
        // avoid same symbol as the neighbour to the left or above
        if (pick !== grid[r - 1]?.[y] && pick !== col[y - 1]) break;
      }
      col.push(pick);
    }
    grid.push(col);
  }
  return grid;
}

function finalGrid(o: SpinOutcome): Grid {
  return o.steps[o.steps.length - 1].grid;
}

/** Apply a cascade: removed cells vanish, survivors keep keys and fall, new cells fall in. */
function cascadeColumns(cols: ReelColumn[], removed: Pos[], next: Grid): ReelColumn[] {
  const gone = new Set(removed.map(([r, y]) => posKey(r, y)));
  return cols.map((col, r) => {
    const survivors = col.filter((_, y) => !gone.has(posKey(r, y)));
    const n = col.length - survivors.length;
    const fresh = next[r].slice(0, n).map((symbol) => ({ key: nextKey(), symbol, dropFrom: n }));
    return [...fresh, ...survivors.map((c, i) => ({ ...c, symbol: next[r][n + i], dropFrom: 0 }))];
  });
}

function cellsOf(wins: SpinWin[]): Set<string> {
  const s = new Set<string>();
  for (const w of wins) for (const [r, y] of w.positions) s.add(posKey(r, y));
  return s;
}

function readPrefs(slotId: string): { betLevel?: number; turbo?: boolean } {
  try {
    return JSON.parse(localStorage.getItem(STORAGE(slotId)) ?? '{}');
  } catch {
    return {};
  }
}

export function useSlotMachine(slotId: string) {
  const qc = useQueryClient();
  const onError = useGameErrorHandler();
  const reduced = !!useReducedMotion();

  const stateQ = useQuery({
    queryKey: ['slot-state', slotId],
    queryFn: () => api.get<SlotStateResponse>(`/api/games/slots/${slotId}/state`),
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const def = stateQ.data?.definition ?? null;
  const betLevels = useMemo(() => stateQ.data?.betLevels ?? [], [stateQ.data]);

  // ── display state ────────────────────────────────────────
  const [columns, setColumns] = useState<ReelColumn[]>([]);
  const [spinning, setSpinning] = useState<boolean[]>([]);
  const [anticipation, setAnticipation] = useState<boolean[]>([]);
  const [highlight, setHighlight] = useState<Set<string> | null>(null);
  const [removing, setRemoving] = useState<Set<string> | null>(null);
  const [transformed, setTransformed] = useState<Set<string> | null>(null);
  const [presentWins, setPresentWins] = useState<SpinWin[]>([]);
  const [winAmount, setWinAmount] = useState(0);
  const [stepMultiplier, setStepMultiplier] = useState(1);
  const [phase, setPhase] = useState<SlotPhase>('loading');
  const [overlay, setOverlay] = useState<SlotOverlay>(null);
  const [banner, setBanner] = useState<{ id: number; text: string; sub?: string } | null>(null);
  const [bonus, setBonus] = useState<PublicBonus | null>(null);
  const [fsCurrent, setFsCurrent] = useState<number | null>(null);
  const [lastWin, setLastWin] = useState(0);
  const [lastOutcome, setLastOutcome] = useState<SpinOutcome | null>(null);
  const [betLevel, setBetLevelState] = useState<number>(0);
  const [turbo, setTurboState] = useState(false);
  const [autoplay, setAutoplay] = useState<(AutoplayConfig & { remaining: number }) | null>(null);
  const [cycleIndex, setCycleIndex] = useState(0);
  // Presentation beats (for machine-specific feature animations).
  const [current, setCurrent] = useState<SpinOutcome | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [activeTransform, setActiveTransform] = useState<GridTransform | null>(null);
  const [stepIndex, setStepIndex] = useState(-1);

  const busy = useRef(false);
  const slam = useRef(false);
  const alive = useRef(true);
  const overlayResolve = useRef<(() => void) | null>(null);
  const autoplayRef = useRef(autoplay);
  autoplayRef.current = autoplay;
  const turboRef = useRef(turbo);
  turboRef.current = turbo;
  const bonusRef = useRef(bonus);
  bonusRef.current = bonus;
  const betRef = useRef(betLevel);
  betRef.current = betLevel;
  const continueTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (continueTimer.current) clearTimeout(continueTimer.current);
      useBalance.getState().release();
    };
  }, []);

  // ── initialise from server state (refresh restore) ───────
  const initialised = useRef(false);
  useEffect(() => {
    const s = stateQ.data;
    if (!s || initialised.current) return;
    initialised.current = true;
    const d = s.definition;
    setColumns(toColumns(s.lastSpin ? finalGrid(s.lastSpin.outcome) : attractGrid(d), d.rows));
    setSpinning(new Array(d.reels).fill(false));
    setAnticipation(new Array(d.reels).fill(false));
    setBonus(s.bonus);
    const prefs = typeof window !== 'undefined' ? readPrefs(slotId) : {};
    const lv = prefs.betLevel && s.betLevels.includes(prefs.betLevel) ? prefs.betLevel : (s.betLevels[Math.min(2, s.betLevels.length - 1)] ?? 100);
    setBetLevelState(lv);
    setTurboState(!!prefs.turbo);
    setPhase('idle');
  }, [stateQ.data, slotId]);

  const persist = useCallback(
    (patch: { betLevel?: number; turbo?: boolean }) => {
      try {
        localStorage.setItem(STORAGE(slotId), JSON.stringify({ ...readPrefs(slotId), ...patch }));
      } catch {
        /* ignore */
      }
    },
    [slotId],
  );
  const setBetLevel = useCallback(
    (v: number) => {
      setBetLevelState(v);
      persist({ betLevel: v });
    },
    [persist],
  );
  const setTurbo = useCallback(
    (v: boolean) => {
      setTurboState(v);
      persist({ turbo: v });
    },
    [persist],
  );

  // ── timing helpers ──────────────────────────────────────
  const wait = useCallback(
    (ms: number) =>
      new Promise<void>((res) => {
        const factor = reduced ? 0.35 : slam.current ? 0.12 : turboRef.current ? 0.55 : 1;
        setTimeout(res, Math.max(0, ms * factor));
      }),
    [reduced],
  );
  const showOverlay = useCallback((o: Exclude<SlotOverlay, null>) => {
    return new Promise<void>((res) => {
      overlayResolve.current = res;
      setOverlay(o);
    });
  }, []);
  const closeOverlay = useCallback(() => {
    setOverlay(null);
    const r = overlayResolve.current;
    overlayResolve.current = null;
    r?.();
  }, []);
  const flashBanner = useCallback(
    async (text: string, sub?: string, ms = 1500) => {
      setBanner({ id: Date.now(), text, sub });
      await wait(ms);
      setBanner(null);
    },
    [wait],
  );

  // ── presentation timeline ───────────────────────────────
  const present = useCallback(
    async (d: PublicSlotDefinition, o: SpinOutcome, res: SlotSpinResponse) => {
      const step0 = o.steps[0];
      const landed = step0.landed ?? step0.grid;
      const scatter = d.scatter.symbol;
      const need = d.scatter.minCount;
      setCurrent(o);

      // Anticipation from the first reel after which minCount-1 scatters are visible.
      let seen = 0;
      let antFrom = -1;
      for (let r = 0; r < d.reels; r++) {
        if (antFrom < 0 && seen >= need - 1) antFrom = r;
        seen += landed[r].filter((s) => s === scatter).length;
      }
      const landedCols = toColumns(landed, d.rows);
      for (let r = 0; r < d.reels; r++) {
        if (r > 0) await wait(150 + (antFrom >= 0 && r >= antFrom ? 950 : 0));
        if (!alive.current) return;
        if (r === antFrom && !slam.current) {
          setAnticipation((a) => a.map((_, i) => i >= r));
          playSound('anticipation');
        }
        setColumns((cols) => cols.map((c, i) => (i === r ? landedCols[r] : c)));
        setSpinning((s) => s.map((v, i) => (i === r ? false : v)));
        setAnticipation((a) => a.map((v, i) => (i === r ? false : v)));
        playSound('reelStop', { pitch: 1 + r * 0.025 });
        if (landed[r].includes(scatter)) playSound('scatter', { pitch: 1 + seenBefore(landed, r, scatter) * 0.12 });
      }
      setAnticipation((a) => a.map(() => false));
      await wait(280);

      // Grid transforms (expanding wilds, modifiers, supernova)
      if (step0.modifiers?.length) {
        for (const m of step0.modifiers) {
          if (m.kind === 'ORRERY') void flashBanner(`Orrery ×${m.multiplier}`, 'Spin multiplier', 1300);
        }
        // Reveal beat: themes animate the modifier before it changes the grid.
        setRevealing(true);
        await wait(900);
        setRevealing(false);
      }
      if (step0.transforms?.length) {
        let cols = landedCols;
        for (const t of step0.transforms) {
          const set = new Set(t.positions.map(([r, y]) => posKey(r, y)));
          cols = cols.map((col, r) => col.map((c, y) => (set.has(posKey(r, y)) ? { ...c, symbol: t.symbol, dropFrom: 0 } : c)));
          setColumns(cols);
          setTransformed(set);
          setActiveTransform(t);
          playSound(t.kind === 'EXPANDING_WILD' ? 'bonus' : 'cascade', { pitch: t.kind === 'EXPANDING_WILD' ? 1.4 : 1.2 });
          await wait(t.kind === 'EXPANDING_WILD' ? 750 : 600);
        }
        setTransformed(null);
        setActiveTransform(null);
        setColumns(toColumnsKeep(cols, step0.grid));
      }

      // Steps: wins → cascade
      let running = 0;
      for (let i = 0; i < o.steps.length; i++) {
        if (!alive.current) return;
        const step = o.steps[i];
        setStepIndex(i);
        if (step.wins.length) {
          running += step.stepWin;
          setWinAmount(running);
          setStepMultiplier(step.multiplier);
          setPresentWins(step.wins);
          setHighlight(cellsOf(step.wins));
          playSound('win', { pitch: Math.min(1.6, 1 + i * 0.08) });
          await wait(o.steps.length > 1 ? 950 : 1150);
        }
        if (step.removed && o.steps[i + 1]) {
          setPresentWins([]);
          setHighlight(null);
          setRemoving(new Set(step.removed.map(([r, y]) => posKey(r, y))));
          await wait(260);
          setRemoving(null);
          setColumns((cols) => cascadeColumns(cols, step.removed!, o.steps[i + 1].grid));
          playSound('cascade', { pitch: 1 + i * 0.07 });
          await wait(560);
        }
      }
      if (o.totalWin !== running) setWinAmount(o.totalWin);
      setStepIndex(o.steps.length);
      // Collection beat: themes animate collected relics into their meter.
      if (o.freeSpins?.relics?.landed) await wait(750);

      // Celebrate
      const bet = o.betLevel;
      const tier: WinTier = winTier(o.totalWin, bet);
      if (o.maxWinReached) await flashBanner('Max win', `${d.maxWinX.toLocaleString('en-US')}× reached`, 1800);
      if ((tier === 'big' || tier === 'mega') && !reduced) {
        setHighlight(null);
        setPresentWins([]);
        await showOverlay({ kind: 'bigwin', amount: o.totalWin, bet });
      }

      // Feature transitions
      const fs = o.freeSpins;
      if (o.features.includes('RELIC_TIER_UP') && fs?.relics) {
        playSound('bonus');
        await flashBanner(`Relic tier ${fs.relics.tier}`, `×${fs.multiplier} multiplier · +${fs.awarded} spins`, 1700);
      } else if (o.features.includes('FREE_SPINS_RETRIGGERED') && fs) {
        playSound('bonus');
        await flashBanner(`+${fs.awarded} free spins`, 'Retrigger', 1600);
      }
      setBonus(res.bonus);
      if (o.features.includes('FREE_SPINS_TRIGGERED') && fs) {
        playSound('bonus');
        setHighlight(null);
        setPresentWins([]);
        const auto = autoplayRef.current;
        if (auto?.stopOnBonus) setAutoplay(null);
        await showOverlay({ kind: 'fs-intro', spins: fs.awarded });
        setFsCurrent(null);
      }
      if (o.features.includes('FREE_SPINS_ENDED') && fs) {
        setHighlight(null);
        setPresentWins([]);
        await showOverlay({ kind: 'fs-outro', spins: fs.played, totalWin: fs.roundWin, bet });
        setFsCurrent(null);
      }

      setLastWin(o.isFreeSpin ? (fs?.roundWin ?? o.totalWin) : o.totalWin);
      if (tier === 'big' || tier === 'mega') {
        const auto = autoplayRef.current;
        if (auto?.stopOnBigWin) setAutoplay(null);
      }
    },
    [wait, flashBanner, showOverlay, reduced],
  );

  // ── spin ────────────────────────────────────────────────
  const spinOnce = useCallback(async (): Promise<boolean> => {
    const d = def;
    if (!d || busy.current) return false;
    busy.current = true;
    slam.current = false;
    const free = !!bonusRef.current;
    const level = free ? bonusRef.current!.betLevel : betRef.current;
    const rid = requestId();
    const charged = free ? 0 : level;

    setPhase('spinning');
    setHighlight(null);
    setPresentWins([]);
    setWinAmount(0);
    setStepMultiplier(1);
    setCycleIndex(0);
    setLastOutcome(null);
    setCurrent(null);
    setRevealing(false);
    setActiveTransform(null);
    setStepIndex(-1);
    if (free) setFsCurrent((bonusRef.current?.played ?? 0) + 1);
    setSpinning(new Array(d.reels).fill(true));
    playSound('reelStart');
    const bal = useBalance.getState();
    const shown = bal.held ?? bal.balance;
    if (shown !== null) bal.hold(shown - charged);
    const t0 = performance.now();

    let res: SlotSpinResponse;
    try {
      const body = { betLevel: level, requestId: rid };
      const url = `/api/games/slots/${slotId}/spin`;
      try {
        res = await api.post<SlotSpinResponse>(url, body);
      } catch (e) {
        // Dropped connection: retry once with the SAME requestId (idempotent).
        if (e instanceof ApiError && e.status === 0) res = await api.post<SlotSpinResponse>(url, body);
        else throw e;
      }
    } catch (e) {
      busy.current = false;
      setAutoplay(null);
      setSpinning(new Array(d.reels).fill(false));
      setAnticipation(new Array(d.reels).fill(false));
      setFsCurrent(null);
      setPhase('idle');
      onError(e);
      if (e instanceof ApiError && ['COOLDOWN_ACTIVE', 'SELF_EXCLUDED', 'GAME_DISABLED', 'MAINTENANCE'].includes(e.code)) {
        void qc.invalidateQueries({ queryKey: ['slot-state', slotId] });
      }
      return false;
    }
    useBalance.getState().set(res.balance);
    const minSpin = reduced ? 150 : turboRef.current ? 260 : 620;
    const elapsed = performance.now() - t0;
    if (elapsed < minSpin && !slam.current) await new Promise((r) => setTimeout(r, minSpin - elapsed));
    if (!alive.current) return false;
    setPhase('presenting');
    try {
      await present(d, res.spin.outcome, res);
    } finally {
      useBalance.getState().release();
      setSpinning(new Array(d.reels).fill(false));
      setLastOutcome(res.spin.outcome);
      setBonus(res.bonus);
      busy.current = false;
      slam.current = false;
      setPhase('idle');
    }
    return true;
  }, [def, slotId, present, onError, qc, reduced]);

  // Auto-continue: free spins play on automatically; autoplay counts down.
  const scheduleNext = useCallback(() => {
    if (continueTimer.current) clearTimeout(continueTimer.current);
    const auto = autoplayRef.current;
    const inBonus = !!bonusRef.current;
    if (!inBonus && !auto) return;
    continueTimer.current = setTimeout(
      async () => {
        if (!alive.current || busy.current) return;
        if (!bonusRef.current) {
          const a = autoplayRef.current;
          if (!a) return;
          if (a.remaining <= 0) {
            setAutoplay(null);
            return;
          }
          setAutoplay({ ...a, remaining: a.remaining - 1 });
        }
        const ok = await spinOnce();
        if (ok) scheduleNext();
      },
      turboRef.current ? 220 : 520,
    );
  }, [spinOnce]);

  const spin = useCallback(async () => {
    if (overlay) {
      if (overlay.kind !== 'bigwin') closeOverlay();
      return;
    }
    if (busy.current) {
      slam.current = true; // quick-stop: compress the rest of the timeline
      return;
    }
    if (continueTimer.current) clearTimeout(continueTimer.current);
    const ok = await spinOnce();
    if (ok) scheduleNext();
  }, [overlay, closeOverlay, spinOnce, scheduleNext]);

  const startAutoplay = useCallback(
    (cfg: AutoplayConfig) => {
      setAutoplay({ ...cfg, remaining: cfg.count - 1 });
      autoplayRef.current = { ...cfg, remaining: cfg.count - 1 };
      if (!busy.current) {
        void (async () => {
          const ok = await spinOnce();
          if (ok) scheduleNext();
        })();
      }
    },
    [spinOnce, scheduleNext],
  );
  const stopAutoplay = useCallback(() => {
    setAutoplay(null);
    autoplayRef.current = null;
    if (continueTimer.current && !bonusRef.current) clearTimeout(continueTimer.current);
  }, []);

  // Idle win cycling: after a single-step spin, cycle through each win.
  const cycleWins = useMemo(() => {
    if (!lastOutcome || lastOutcome.steps.length !== 1) return [];
    return lastOutcome.steps[0].wins;
  }, [lastOutcome]);
  useEffect(() => {
    if (phase !== 'idle' || overlay || cycleWins.length === 0) return;
    const show = (i: number) => {
      const w = cycleWins[i % cycleWins.length];
      setPresentWins([w]);
      setHighlight(cellsOf([w]));
    };
    show(cycleIndex);
    if (cycleWins.length < 2) return;
    const t = setInterval(() => setCycleIndex((i) => i + 1), 1500);
    return () => clearInterval(t);
  }, [phase, overlay, cycleWins, cycleIndex]);

  const canChangeBet = phase === 'idle' && !bonus && !autoplay;

  return {
    // data
    state: stateQ.data ?? null,
    loading: stateQ.isLoading,
    error: stateQ.error,
    refetch: stateQ.refetch,
    def,
    betLevels,
    enabled: stateQ.data?.enabled ?? true,
    // display
    columns,
    spinning,
    anticipation,
    highlight,
    removing,
    transformed,
    presentWins: removing ? [] : presentWins,
    winAmount,
    stepMultiplier,
    phase,
    overlay,
    closeOverlay,
    banner,
    bonus,
    fsCurrent,
    lastWin,
    lastOutcome,
    /** Outcome being presented (null while the reels spin before the response). */
    current,
    /** True during the modifier reveal beat (before modifier transforms apply). */
    revealing,
    /** Grid transform currently animating (expanding wild / modifier / supernova). */
    activeTransform,
    /** Index of the step being presented; `steps.length` once every step is done; -1 before. */
    stepIndex,
    reduced,
    // controls
    betLevel,
    setBetLevel,
    canChangeBet,
    turbo,
    setTurbo,
    autoplay,
    startAutoplay,
    stopAutoplay,
    spin,
    busy: phase === 'spinning' || phase === 'presenting',
  };
}

export type SlotMachineController = ReturnType<typeof useSlotMachine>;

function seenBefore(grid: Grid, reel: number, scatter: string): number {
  let n = 0;
  for (let r = 0; r < reel; r++) n += grid[r].filter((s) => s === scatter).length;
  return n;
}

/** Keep keys but force symbols to `grid` (sync after transforms). */
function toColumnsKeep(cols: ReelColumn[], grid: Grid): ReelColumn[] {
  return cols.map((col, r) => col.map((c, y) => (c.symbol === grid[r][y] ? c : { ...c, symbol: grid[r][y] })));
}
