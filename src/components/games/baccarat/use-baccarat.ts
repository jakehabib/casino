'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useReducedMotion } from 'framer-motion';
import { api, requestId as newRequestId } from '@/lib/api';
import { useBalance } from '@/stores/balance-store';
import { playSound } from '@/audio/audio-manager';
import { toast } from '@/components/ui/toast';
import { useGameErrorHandler } from '@/components/games/shared/use-game-action';
import type { MainBetType } from '@/engines/baccarat/types';
import type { BaccaratResultDto, BaccaratStateDto } from '@/server/services/baccarat/types';

export type ZoneKey = MainBetType;
export type BetMap = Record<ZoneKey, number>;
export const EMPTY_BETS: BetMap = { PLAYER: 0, BANKER: 0, TIE: 0 };
export const ZONES: ZoneKey[] = ['PLAYER', 'TIE', 'BANKER'];

export type Phase = 'betting' | 'dealing' | 'result';

export interface Presentation {
  /** Cards on the table (index into result.deal). */
  shown: number;
  /** Cards turned face-up. */
  revealed: number;
  caption: { side: 'PLAYER' | 'BANKER'; text: string } | null;
  natural: boolean;
}

const STATE_KEY = ['baccarat', 'state'] as const;
const total = (b: BetMap) => b.PLAYER + b.BANKER + b.TIE;

/** Deal timing (ms). Reduced motion compresses everything. */
function timings(reduce: boolean) {
  return reduce
    ? { gap: 110, flip: 40, caption: 260, natural: 260, result: 150 }
    : { gap: 430, flip: 230, caption: 720, natural: 820, result: 520 };
}

export function useBaccarat() {
  const qc = useQueryClient();
  const onError = useGameErrorHandler();
  const reduce = useReducedMotion() ?? false;

  const state = useQuery({
    queryKey: STATE_KEY,
    queryFn: () => api.get<BaccaratStateDto>('/api/games/baccarat/state'),
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });
  const cfg = state.data?.config;

  const [phase, setPhase] = useState<Phase>('betting');
  const [bets, setBets] = useState<BetMap>(EMPTY_BETS);
  const [history, setHistory] = useState<BetMap[]>([]);
  const [lastBets, setLastBets] = useState<BetMap | null>(null);
  const [result, setResult] = useState<BaccaratResultDto | null>(null);
  const [pres, setPres] = useState<Presentation>({ shown: 0, revealed: 0, caption: null, natural: false });
  const [chip, setChip] = useState(1_000);
  const [pending, setPending] = useState(false);
  const timers = useRef<number[]>([]);
  const restored = useRef(false);
  const chipTick = useRef(0);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(
    () => () => {
      clearTimers();
      useBalance.getState().release();
    },
    [],
  );

  // Refresh restore: show the last settled round as-is (no animation).
  useEffect(() => {
    if (restored.current || !state.data) return;
    restored.current = true;
    const last = state.data.lastGame;
    if (last) {
      setResult(last);
      setPres({ shown: last.deal.length, revealed: last.deal.length, caption: null, natural: last.natural });
      setPhase('result');
      const lb = { ...EMPTY_BETS };
      for (const b of last.bets) lb[b.type] = b.amount;
      setLastBets(lb);
    }
  }, [state.data]);

  /** Commit the bead + shoe info once the animation reveals the result (never before). */
  const commitResult = useCallback(
    (r: BaccaratResultDto) => {
      qc.setQueryData<BaccaratStateDto>(STATE_KEY, (prev) => {
        if (!prev) return prev;
        const bead = { outcome: r.outcome, playerTotal: r.playerTotal, bankerTotal: r.bankerTotal, natural: r.natural };
        const newShoe = !prev.shoe || (r.shoe ? r.shoe.shoeNumber !== prev.shoe.shoeNumber : r.shoeRound === 1);
        return {
          ...prev,
          shoe: r.shoe ?? prev.shoe,
          beadPlate: newShoe ? [bead] : [...prev.beadPlate, bead],
          lastGame: r,
        };
      });
    },
    [qc],
  );

  const runPresentation = useCallback(
    (r: BaccaratResultDto) => {
      clearTimers();
      const T = timings(reduce);
      const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
      let t = 120;
      r.deal.forEach((d, i) => {
        if (d.third) {
          const text = d.side === 'PLAYER' ? 'Player draws' : 'Banker draws';
          at(t, () => setPres((p) => ({ ...p, caption: { side: d.side, text } })));
          t += T.caption;
        }
        at(t, () => {
          playSound(d.third ? 'cardSlide' : 'cardDeal');
          setPres((p) => ({ ...p, shown: i + 1 }));
        });
        at(t + T.flip, () => {
          playSound('cardFlip', { pitch: d.side === 'PLAYER' ? 1.04 : 0.96 });
          setPres((p) => ({ ...p, revealed: i + 1 }));
        });
        t += T.gap;
        if (d.third) {
          at(t + T.flip, () => setPres((p) => ({ ...p, caption: null })));
        }
        if (i === 3 && r.natural) {
          at(t + T.flip, () => {
            playSound('notify');
            setPres((p) => ({ ...p, natural: true }));
          });
          t += T.natural;
        }
      });
      at(t + T.result, () => {
        setPres((p) => ({ ...p, caption: null }));
        setPhase('result');
        commitResult(r);
        useBalance.getState().release();
        const won = r.totalPayout > r.totalWagered;
        const big = r.totalPayout >= r.totalWagered * 5 && r.totalPayout > 0;
        if (big) playSound('bigWin');
        else if (won) playSound('win');
        else if (r.totalPayout === r.totalWagered) playSound('push');
        else playSound('loss');
      });
    },
    [reduce, commitResult],
  );

  // ── Betting ──────────────────────────────────────────────
  const balance = useBalance((s) => s.balance);
  const staked = total(bets);
  const canBet = phase !== 'dealing' && !pending;

  const startBetting = useCallback(() => {
    if (phase === 'result') {
      setPhase('betting');
      setResult(null);
      setPres({ shown: 0, revealed: 0, caption: null, natural: false });
      setBets(EMPTY_BETS);
      setHistory([]);
      return true;
    }
    return false;
  }, [phase]);

  const applyBets = useCallback(
    (next: BetMap, from: BetMap) => {
      setHistory((h) => [...h.slice(-49), from]);
      setBets(next);
    },
    [],
  );

  const place = useCallback(
    (zone: ZoneKey) => {
      if (!canBet || !cfg) return;
      const base = startBetting() ? EMPTY_BETS : bets;
      const max = cfg.maxBet;
      const current = base[zone];
      if (current >= max) {
        toast.info('Table maximum reached', `Maximum ${max.toLocaleString('en-US')} per wager.`);
        return;
      }
      let add = Math.min(chip, max - current);
      const room = (balance ?? 0) - total(base);
      if (room <= 0 || add > room) {
        if (room < cfg.minBet || room <= 0) {
          toast.error('Insufficient Credits', 'You don’t have enough Credits for this chip.');
          return;
        }
        add = room;
      }
      chipTick.current = (chipTick.current + 1) % 5;
      playSound('chip', { pitch: 0.94 + chipTick.current * 0.03 });
      applyBets({ ...base, [zone]: current + add }, base);
    },
    [canBet, cfg, startBetting, bets, chip, balance, applyBets],
  );

  const undo = useCallback(() => {
    if (!canBet || phase !== 'betting' || !history.length) return;
    playSound('chip', { pitch: 0.8 });
    setBets(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  }, [canBet, phase, history]);

  const clear = useCallback(() => {
    if (!canBet) return;
    const base = startBetting() ? EMPTY_BETS : bets;
    if (!total(base)) return;
    playSound('chipStack', { pitch: 0.9 });
    applyBets(EMPTY_BETS, base);
  }, [canBet, startBetting, bets, applyBets]);

  const fits = useCallback(
    (b: BetMap) => !!cfg && total(b) <= (balance ?? 0) && ZONES.every((z) => b[z] === 0 || (b[z] >= cfg.minBet && b[z] <= cfg.maxBet)),
    [cfg, balance],
  );

  const doubleBets = useCallback(() => {
    if (!canBet || phase !== 'betting' || !staked) return;
    const next = { PLAYER: bets.PLAYER * 2, BANKER: bets.BANKER * 2, TIE: bets.TIE * 2 };
    if (!fits(next)) {
      toast.error('Can’t double', 'Doubling would exceed your balance or the table limit.');
      return;
    }
    playSound('chipStack');
    applyBets(next, bets);
  }, [canBet, phase, staked, bets, fits, applyBets]);

  const rebet = useCallback(() => {
    if (!canBet || !lastBets) return false;
    startBetting();
    if (!fits(lastBets)) {
      toast.error('Can’t rebet', 'Your last bet exceeds your balance or the table limit.');
      return false;
    }
    playSound('chipStack');
    applyBets(lastBets, phase === 'result' ? EMPTY_BETS : bets);
    return true;
  }, [canBet, lastBets, startBetting, fits, applyBets, phase, bets]);

  // ── Deal ─────────────────────────────────────────────────
  const reqRef = useRef<{ key: string; id: string } | null>(null);
  const deal = useCallback(
    async (override?: BetMap) => {
      const b = override ?? bets;
      const amount = total(b);
      if (pending || phase === 'dealing' || !cfg || amount <= 0) return;
      // One requestId per distinct user action (stable across retries of the same bets).
      const key = JSON.stringify(b);
      if (!reqRef.current || reqRef.current.key !== key) reqRef.current = { key, id: newRequestId() };
      const rid = reqRef.current.id;
      setPending(true);
      const bal = useBalance.getState().balance;
      if (bal !== null) useBalance.getState().hold(bal - amount);
      try {
        const body: Partial<BetMap> = {};
        for (const z of ZONES) if (b[z] > 0) body[z] = b[z];
        const r = await api.post<BaccaratResultDto>('/api/games/baccarat/deal', { bets: body, requestId: rid });
        reqRef.current = null;
        if (r.balance !== null) useBalance.getState().set(r.balance);
        setLastBets(b);
        setBets(b);
        setHistory([]);
        setResult(r);
        setPres({ shown: 0, revealed: 0, caption: null, natural: false });
        setPhase('dealing');
        runPresentation(r);
      } catch (err) {
        onError(err);
      } finally {
        setPending(false);
      }
    },
    [bets, pending, phase, cfg, runPresentation, onError],
  );

  /** Space: deal the current bets, or rebet + deal the last bets. */
  const primary = useCallback(() => {
    if (phase === 'dealing' || pending) return;
    if (phase === 'betting' && staked > 0) return void deal();
    if (lastBets && fits(lastBets)) {
      startBetting();
      setBets(lastBets);
      return void deal(lastBets);
    }
  }, [phase, pending, staked, deal, lastBets, fits, startBetting]);

  const primaryMode: 'deal' | 'rebet-deal' | 'none' =
    phase === 'betting' && staked > 0 ? 'deal' : phase !== 'dealing' && lastBets && total(lastBets) > 0 ? 'rebet-deal' : 'none';

  const potential = useMemo(() => {
    if (!cfg) return { PLAYER: 0, BANKER: 0, TIE: 0 };
    return {
      PLAYER: bets.PLAYER * 2,
      BANKER: bets.BANKER + Math.floor((bets.BANKER * (10_000 - cfg.bankerCommissionBps)) / 10_000),
      TIE: bets.TIE * (cfg.tiePayout + 1),
    };
  }, [bets, cfg]);

  return {
    state,
    cfg,
    phase,
    bets,
    staked,
    lastBets,
    history,
    result,
    pres,
    chip,
    setChip,
    pending,
    canBet,
    balance,
    place,
    undo,
    clear,
    doubleBets,
    rebet,
    deal,
    primary,
    primaryMode,
    potential,
    reduce,
  };
}

export type BaccaratController = ReturnType<typeof useBaccarat>;
