'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useReducedMotion } from 'framer-motion';
import { api, ApiError, requestId } from '@/lib/api';
import { useBalance } from '@/stores/balance-store';
import { playSound } from '@/audio/audio-manager';
import { useGameErrorHandler } from '@/components/games/shared/use-game-action';
import type { BlackjackAction } from '@/engines/blackjack/types';
import type {
  BlackjackResponse,
  BlackjackTableConfig,
} from '@/server/services/blackjack/blackjack-service';
import type { ShoeInfo } from '@/server/services/blackjack/shoe-service';
import { buildFrames, type RoundView } from './reveal';

export interface ActiveResponse {
  game: RoundView | null;
  config: BlackjackTableConfig;
  shoe: ShoeInfo;
  balance: number;
}

export const ACTIVE_KEY = ['blackjack', 'active'] as const;

/** Retry transport failures only, with the SAME requestId (idempotent server). */
async function postWithRetry<T>(url: string, body: unknown): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await api.post<T>(url, body);
    } catch (err) {
      last = err;
      const transient = err instanceof ApiError && (err.status === 0 || err.status >= 502);
      if (!transient) throw err;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw last;
}

/**
 * Blackjack client state.
 *  • `server` is the latest server-authoritative round; `view` is what is on
 *    screen, stepped towards `server` through paced reveal frames.
 *  • A new server state is always accepted immediately — any running reveal is
 *    re-planned from what is currently displayed.
 *  • Balance: the stake is held (shown deducted) when a request is sent; the
 *    payout lands when the result frame is revealed.
 */
export function useBlackjack() {
  const qc = useQueryClient();
  const onError = useGameErrorHandler();
  const reduced = useReducedMotion();

  const active = useQuery({
    queryKey: ACTIVE_KEY,
    queryFn: () => api.get<ActiveResponse>('/api/games/blackjack/active'),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const [view, setView] = useState<RoundView | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [shoe, setShoe] = useState<ShoeInfo | null>(null);
  const [pending, setPending] = useState<null | 'DEAL' | BlackjackAction>(null);
  const [lastBet, setLastBet] = useState<number | null>(null);
  /** Card ids that should animate in from the shoe (others render in place). */
  const viewRef = useRef<RoundView | null>(null);
  const timers = useRef<number[]>([]);
  const restored = useRef(false);
  const releaseOnFinal = useRef(false);

  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const present = useCallback(
    (next: RoundView, opts: { instant?: boolean } = {}) => {
      clearTimers();
      const frames = buildFrames(viewRef.current, next, { instant: opts.instant || !!reduced });
      let at = 0;
      setRevealing(frames.length > 1);
      frames.forEach((f, idx) => {
        at += f.delay;
        const show = () => {
          viewRef.current = f.view;
          setView(f.view);
          if (f.sound && !opts.instant) playSound(f.sound);
          if (f.final) {
            setRevealing(false);
            if (releaseOnFinal.current) {
              releaseOnFinal.current = false;
              useBalance.getState().release();
            }
          }
        };
        if (idx === 0 && at === 0) show();
        else timers.current.push(window.setTimeout(show, at));
      });
    },
    [reduced],
  );

  // Restore an unfinished hand after refresh (no animation).
  useEffect(() => {
    if (!active.data || restored.current) return;
    restored.current = true;
    setShoe(active.data.shoe);
    useBalance.getState().set(active.data.balance);
    if (active.data.game) {
      setLastBet(active.data.game.baseBet);
      present(active.data.game, { instant: true });
    }
  }, [active.data, present]);

  const apply = useCallback(
    (res: BlackjackResponse) => {
      setShoe(res.shoe);
      const bal = useBalance.getState();
      bal.set(res.balance);
      if (res.game.settled) releaseOnFinal.current = true;
      else bal.release();
      present(res.game);
      qc.setQueryData<ActiveResponse>(ACTIVE_KEY, (old) =>
        old ? { ...old, game: res.game.settled ? null : res.game, shoe: res.shoe, balance: res.balance } : old,
      );
      if (res.game.settled) {
        void qc.invalidateQueries({ queryKey: ['history'] });
        void qc.invalidateQueries({ queryKey: ['me'] });
      }
    },
    [present, qc],
  );

  const holdStake = (stake: number) => {
    const s = useBalance.getState();
    const shown = s.held ?? s.balance;
    if (shown !== null) s.hold(Math.max(0, shown - stake));
  };

  const deal = useCallback(
    async (bet: number) => {
      if (pending) return;
      const rid = requestId();
      setPending('DEAL');
      releaseOnFinal.current = false;
      holdStake(bet);
      playSound('chipStack');
      try {
        const res = await postWithRetry<BlackjackResponse>('/api/games/blackjack/deal', { bet, requestId: rid });
        setLastBet(bet);
        apply(res);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'ROUND_IN_PROGRESS') {
          // Another tab/device has a hand open — load it.
          const fresh = await api.get<ActiveResponse>('/api/games/blackjack/active').catch(() => null);
          if (fresh?.game) {
            useBalance.getState().release();
            setShoe(fresh.shoe);
            present(fresh.game, { instant: true });
            return;
          }
        }
        onError(err);
      } finally {
        setPending(null);
      }
    },
    [pending, apply, onError, present],
  );

  const act = useCallback(
    async (action: BlackjackAction) => {
      const current = viewRef.current;
      if (pending || !current || revealing || !current.legal.includes(action)) return;
      const rid = requestId();
      setPending(action);
      releaseOnFinal.current = false;
      const h = current.hands[current.active];
      const stake =
        action === 'DOUBLE' || action === 'SPLIT' ? (h?.bet ?? 0) : action === 'INSURANCE' ? Math.floor(current.baseBet / 2) : 0;
      holdStake(stake);
      if (stake > 0) playSound('chip');
      try {
        const res = await postWithRetry<BlackjackResponse>('/api/games/blackjack/action', {
          gameId: current.id,
          action,
          requestId: rid,
        });
        apply(res);
      } catch (err) {
        onError(err);
        if (err instanceof ApiError && (err.code === 'ACTION_UNAVAILABLE' || err.code === 'CONFLICT' || err.code === 'NOT_FOUND')) {
          // Our view is stale — resync with the server.
          const fresh = await api.get<ActiveResponse>('/api/games/blackjack/active').catch(() => null);
          if (fresh) {
            setShoe(fresh.shoe);
            useBalance.getState().set(fresh.balance);
            if (fresh.game) present(fresh.game, { instant: true });
          }
        }
      } finally {
        setPending(null);
      }
    },
    [pending, revealing, apply, onError, present],
  );

  return {
    loading: active.isLoading,
    error: active.isError,
    refetch: active.refetch,
    config: active.data?.config ?? null,
    shoe: shoe ?? active.data?.shoe ?? null,
    view,
    revealing,
    pending,
    lastBet,
    deal,
    act,
    inRound: !!view && !view.settled,
  };
}
