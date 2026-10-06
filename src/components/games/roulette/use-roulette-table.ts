'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getSpot, spotId, type BetSpot, type BetType } from '@/engines/roulette/bets';
import type { RouletteSpinResult, RouletteState } from '@/engines/roulette/api-types';
import { useBalance } from '@/stores/balance-store';
import { formatCredits } from '@/lib/format';
import { toast } from '@/components/ui/toast';
import { playSound } from '@/audio/audio-manager';

/** spotId → amount */
export type BetMap = Record<string, number>;
export type Phase = 'idle' | 'spinning' | 'result';

export const STATE_KEY = ['roulette', 'state'] as const;
const DRAFT_KEY = 'nova:roulette:draft';
const LAST_KEY = 'nova:roulette:last';
const MAX_UNDO = 60;

function readSession<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeSession(key: string, value: unknown) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

/** Keep only legal, positive integer entries (defends against stale/tampered storage). */
function sanitize(m: BetMap | null): BetMap {
  const out: BetMap = {};
  if (!m || typeof m !== 'object') return out;
  for (const [id, amt] of Object.entries(m)) {
    if (getSpot(id) && Number.isSafeInteger(amt) && amt > 0) out[id] = amt;
  }
  return out;
}

export const total = (m: BetMap) => Object.values(m).reduce((a, b) => a + b, 0);

export function betsFromResult(r: Pick<RouletteSpinResult, 'bets'>): BetMap {
  const m: BetMap = {};
  for (const b of r.bets) {
    const id = spotId(b.type as BetType, b.numbers);
    m[id] = (m[id] ?? 0) + b.amount;
  }
  return m;
}

export function useRouletteState() {
  return useQuery({
    queryKey: STATE_KEY,
    queryFn: () => api.get<RouletteState>('/api/games/roulette/state'),
    staleTime: 60_000,
  });
}

export function useRouletteTable(state: RouletteState | undefined) {
  const qc = useQueryClient();
  const [bets, setBets] = useState<BetMap>({});
  const [undo, setUndo] = useState<BetMap[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<RouletteSpinResult | null>(null);
  const [lastBets, setLastBets] = useState<BetMap | null>(null);
  const [focusSpot, setFocusSpot] = useState<BetSpot | null>(null);
  const hydrated = useRef(false);

  // Restore draft + last bets from this tab's session (or the last server round).
  useEffect(() => {
    if (hydrated.current || !state) return;
    hydrated.current = true;
    const draft = sanitize(readSession<BetMap>(DRAFT_KEY));
    const last = sanitize(readSession<BetMap>(LAST_KEY));
    if (Object.keys(draft).length) setBets(draft);
    if (Object.keys(last).length) setLastBets(last);
    else if (state.lastRound) setLastBets(betsFromResult(state.lastRound));
  }, [state]);

  useEffect(() => {
    if (!hydrated.current) return;
    writeSession(DRAFT_KEY, Object.keys(bets).length ? bets : null);
  }, [bets]);

  const limits = state?.limits;
  const betLimits = state?.betLimits;

  const balance = useBalance((s) => s.balance);
  const draftTotal = useMemo(() => total(bets), [bets]);

  /** Apply a new bet map, recording undo history. */
  const commit = useCallback((next: BetMap, prev: BetMap) => {
    setUndo((u) => [...u.slice(-MAX_UNDO + 1), prev]);
    setBets(next);
  }, []);

  /** Leave the result view: the next placement starts a fresh layout. */
  const base = useCallback((): BetMap => {
    if (phase === 'result') {
      setPhase('idle');
      setResult(null);
      setUndo([]);
      return {};
    }
    return bets;
  }, [phase, bets]);

  const checkSlip = useCallback(
    (next: BetMap): string | null => {
      if (!limits || !betLimits) return 'Table is loading';
      const t = total(next);
      if (t > limits.maxBet) return `Table maximum is ${formatCredits(limits.maxBet)} per spin`;
      if (balance !== null && t > balance) return 'Not enough Credits for this bet';
      for (const [id, amt] of Object.entries(next)) {
        const spot = getSpot(id)!;
        const max = betLimits[spot.type].max;
        if (amt > max) return `${spot.label} is limited to ${formatCredits(max)}`;
      }
      return null;
    },
    [limits, betLimits, balance],
  );

  const place = useCallback(
    (spot: BetSpot, chip: number) => {
      if (phase === 'spinning' || !limits || !betLimits) return;
      const from = base();
      const current = from[spot.id] ?? 0;
      const spotRoom = betLimits[spot.type].max - current;
      const tableRoom = limits.maxBet - total(from);
      const balRoom = balance === null ? Infinity : balance - total(from);
      const add = Math.min(chip, spotRoom, tableRoom, balRoom);
      setFocusSpot(spot);
      if (add <= 0 || current + add < limits.minBet) {
        const why =
          spotRoom <= 0
            ? `${spot.label} is at its ${formatCredits(betLimits[spot.type].max)} limit`
            : tableRoom <= 0
              ? `Table maximum is ${formatCredits(limits.maxBet)} per spin`
              : 'Not enough Credits for this bet';
        toast.error('Bet limit reached', why);
        return;
      }
      if (add < chip) {
        toast.info(
          'Bet capped',
          add === spotRoom ? `${spot.label} is limited to ${formatCredits(betLimits[spot.type].max)}` : add === tableRoom ? `Table maximum is ${formatCredits(limits.maxBet)} per spin` : 'Capped at your available balance',
        );
      }
      playSound('chip', { pitch: 0.95 + Math.min(0.2, current / 50_000) });
      commit({ ...from, [spot.id]: current + add }, from);
    },
    [phase, limits, betLimits, balance, base, commit],
  );

  const actions = useMemo(
    () => ({
      undo() {
        if (phase === 'spinning' || !undo.length) return;
        playSound('click', { pitch: 0.9 });
        setBets(undo[undo.length - 1]);
        setUndo((u) => u.slice(0, -1));
      },
      clear() {
        if (phase === 'spinning') return;
        const from = base();
        if (!Object.keys(from).length) return;
        playSound('chipStack', { pitch: 0.9 });
        commit({}, from);
      },
      repeat() {
        if (phase === 'spinning' || !lastBets) return;
        const from = base();
        const err = checkSlip(lastBets);
        if (err) return void toast.error('Can’t repeat bets', err);
        playSound('chipStack');
        commit({ ...lastBets }, from);
      },
      double() {
        if (phase === 'spinning') return;
        const from = phase === 'result' && lastBets ? lastBets : bets;
        if (!Object.keys(from).length) return;
        const next: BetMap = {};
        for (const [id, amt] of Object.entries(from)) next[id] = amt * 2;
        const err = checkSlip(next);
        if (err) return void toast.error('Can’t double bets', err);
        const prev = base();
        playSound('chipStack', { pitch: 1.1 });
        commit(next, prev);
      },
    }),
    [phase, undo, base, commit, lastBets, checkSlip, bets],
  );

  const onSpinStart = useCallback((slip: BetMap) => {
    setLastBets(slip);
    writeSession(LAST_KEY, slip);
    setBets(slip);
    setPhase('spinning');
    setResult(null);
  }, []);

  const onSpinFailed = useCallback(() => setPhase('idle'), []);

  const onReveal = useCallback(
    (r: RouletteSpinResult) => {
      setResult(r);
      setPhase('result');
      setBets({});
      setUndo([]);
      qc.setQueryData<RouletteState>(STATE_KEY, (s) =>
        s
          ? {
              ...s,
              lastRound: r,
              recent: [
                { id: r.roundId, winningNumber: r.winningNumber, totalWagered: r.totalWagered, totalPayout: r.totalPayout, createdAt: r.createdAt },
                ...s.recent.filter((x) => x.id !== r.roundId),
              ].slice(0, 20),
            }
          : s,
      );
    },
    [qc],
  );

  return {
    bets,
    draftTotal,
    phase,
    result,
    lastBets,
    canUndo: undo.length > 0 && phase !== 'spinning',
    focusSpot,
    setFocusSpot,
    place,
    checkSlip,
    onSpinStart,
    onSpinFailed,
    onReveal,
    ...actions,
  };
}
