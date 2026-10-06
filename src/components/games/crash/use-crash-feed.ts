'use client';
import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getSocket, emitAck } from '@/lib/socket-client';
import { playSound } from '@/audio/audio-manager';
import type {
  CrashBetEvent,
  CrashCashoutEvent,
  CrashMyBet,
  CrashSnapshot,
  CrashStatePayload,
  CrashTick,
} from '@/engines/crash/types';
import { serverNow, useCrash } from './crash-store';

export const CRASH_STATE_KEY = ['crash', 'state'] as const;

/**
 * Wires the Launch store to the server: REST snapshot for first paint, then
 * the socket room. On every (re)connect the client re-joins and receives a
 * full snapshot including its own bets, so the UI restores a placed bet and a
 * valid cash-out button after a refresh or network drop.
 */
export function useCrashFeed(signedIn: boolean) {
  const qc = useQueryClient();
  const state = useQuery({
    queryKey: [...CRASH_STATE_KEY, signedIn],
    queryFn: () => api.get<CrashStatePayload>('/api/games/crash/state'),
    staleTime: 0,
  });

  useEffect(() => {
    if (state.data) useCrash.getState().applyPayload(state.data);
  }, [state.data]);

  useEffect(() => {
    const s = getSocket();
    const store = useCrash.getState;
    let joined = false;

    const join = async () => {
      try {
        const snap = await emitAck<CrashSnapshot>('crash:join', {});
        store().applySnapshot(snap, { withMine: snap.me !== undefined });
        if (joined) void qc.invalidateQueries({ queryKey: CRASH_STATE_KEY }); // refresh history after a gap
        joined = true;
      } catch {
        /* retried on next connect */
      }
    };
    const onState = (snap: CrashSnapshot) => store().applySnapshot(snap);
    const onTick = (t: CrashTick) => store().applyTick(t.m, t.t);
    const onBet = (e: CrashBetEvent) => store().applyBet(e.roundId, e.bet);
    const onCashout = (e: CrashCashoutEvent) => store().applyCashout(e);
    const onMine = (b: CrashMyBet) => store().applyMyBet(b);

    s.on('connect', join);
    s.on('crash:state', onState);
    s.on('crash:tick', onTick);
    s.on('crash:bet', onBet);
    s.on('crash:cashout', onCashout);
    s.on('crash:mybet', onMine);
    if (s.connected) void join();
    return () => {
      s.off('connect', join);
      s.off('crash:state', onState);
      s.off('crash:tick', onTick);
      s.off('crash:bet', onBet);
      s.off('crash:cashout', onCashout);
      s.off('crash:mybet', onMine);
      s.emit('crash:leave');
    };
  }, [qc, signedIn]);

  useCrashSounds();
  return state;
}

/** Countdown / launch / crash / own cash-out cues. */
function useCrashSounds() {
  const last = useRef<{ id: string | null; status: string | null; beeps: Set<number>; cashed: Set<string> }>({ id: null, status: null, beeps: new Set(), cashed: new Set() });
  useEffect(() => {
    const loop = () => {
      const { round } = useCrash.getState();
      if (round?.status === 'WAITING') {
        const left = Math.ceil((round.bettingEndsAt - serverNow()) / 1000);
        if (left >= 1 && left <= 3 && !last.current.beeps.has(left)) {
          last.current.beeps.add(left);
          playSound('countdown');
        }
      }
    };
    const timer = setInterval(loop, 100);
    const unsub = useCrash.subscribe((st, prev) => {
      const r = st.round;
      if (!r) return;
      const seen = last.current;
      if (r.id !== seen.id) {
        seen.id = r.id;
        seen.beeps = new Set();
      }
      if (prev.round && r.status !== seen.status) {
        if (r.status === 'RUNNING' && prev.round.status !== 'RUNNING') playSound('launch');
        if (r.status === 'CRASHED' && prev.round.status === 'RUNNING') playSound('crash');
      }
      seen.status = r.status;
      for (const m of st.mine) {
        if (m && m.status === 'CASHED_OUT' && !seen.cashed.has(m.id)) {
          seen.cashed.add(m.id);
          if (prev.mine.some((p) => p?.id === m.id && p.status === 'ACTIVE')) playSound('cashout');
        }
      }
    });
    return () => {
      clearInterval(timer);
      unsub();
    };
  }, []);
}
