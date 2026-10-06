'use client';
import { create } from 'zustand';
import { multiplierAt } from '@/engines/crash/crash-math';
import type {
  CrashBetPublic,
  CrashCashoutEvent,
  CrashHistoryItem,
  CrashMyBet,
  CrashRoundPublic,
  CrashSnapshot,
  CrashStatePayload,
} from '@/engines/crash/types';

/**
 * Client mirror of the Launch round. The server is authoritative; this store
 * only holds the latest snapshot + deltas and a server-clock offset so the
 * curve can be animated from `startedAt` (not from ticks alone).
 */

/** Sliding window of (serverTime − localTime) samples. Network delay only ever
 *  makes a sample smaller than the true offset, so the max is the best estimate. */
const OFFSET_WINDOW = 24;
const offsetSamples: number[] = [];
let offset = 0;

export function sampleServerTime(serverTime: number) {
  offsetSamples.push(serverTime - Date.now());
  if (offsetSamples.length > OFFSET_WINDOW) offsetSamples.shift();
  offset = Math.max(...offsetSamples);
}

export function serverNow() {
  return Date.now() + offset;
}

export interface CashoutMark {
  betId: string;
  cashoutAt: number;
  payout: number;
  mine: boolean;
  username: string;
}

interface CrashState {
  ready: boolean;
  round: CrashRoundPublic | null;
  bets: Record<string, CrashBetPublic>;
  /** Own bets of the CURRENT round by slot. */
  mine: [CrashMyBet | null, CrashMyBet | null];
  history: CrashHistoryItem[];
  marks: CashoutMark[];
  config: CrashStatePayload['config'] | null;
  /** Last multiplier tick from the server (×100) — used as a floor for the animation. */
  lastTick: number;
  applyPayload: (p: CrashStatePayload) => void;
  applySnapshot: (s: CrashSnapshot, opts?: { withMine?: boolean }) => void;
  applyBet: (roundId: string, bet: CrashBetPublic) => void;
  applyCashout: (e: CrashCashoutEvent) => void;
  applyMyBet: (b: CrashMyBet) => void;
  applyTick: (m: number, t: number) => void;
}

function pushHistory(history: CrashHistoryItem[], round: CrashRoundPublic): CrashHistoryItem[] {
  if (round.crashPoint === undefined || round.voided || history.some((h) => h.id === round.id)) return history;
  return [{ id: round.id, number: round.number, crashPoint: round.crashPoint }, ...history].slice(0, 30);
}

export const useCrash = create<CrashState>((set, get) => ({
  ready: false,
  round: null,
  bets: {},
  mine: [null, null],
  history: [],
  marks: [],
  config: null,
  lastTick: 100,

  applyPayload: (p) => {
    set({ history: p.history, config: p.config });
    get().applySnapshot(p, { withMine: p.me !== undefined });
  },

  applySnapshot: (s, opts) => {
    if (s.round) sampleServerTime(s.round.serverTime);
    const prev = get();
    const round = s.round;
    const sameRound = prev.round && round && prev.round.id === round.id;
    const bets: Record<string, CrashBetPublic> = {};
    for (const b of s.bets) bets[b.id] = b;
    let mine = prev.mine;
    if (opts?.withMine) {
      mine = [null, null];
      for (const b of s.me ?? []) mine[b.slot] = b;
    } else if (!sameRound) {
      mine = [null, null];
    } else {
      // Refresh own bets from the public list (status/payout) while keeping private fields.
      mine = mine.map((m) => (m && bets[m.id] ? { ...m, ...bets[m.id] } : m)) as CrashState['mine'];
    }
    const marks = sameRound
      ? prev.marks
      : [];
    const merged = Object.values(bets)
      .filter((b) => b.status === 'CASHED_OUT' && b.cashoutAt)
      .map((b) => ({
        betId: b.id,
        cashoutAt: b.cashoutAt!,
        payout: b.payout ?? 0,
        mine: mine.some((m) => m?.id === b.id),
        username: b.user.displayName,
      }));
    const known = new Set(marks.map((m) => m.betId));
    set({
      ready: true,
      round,
      bets,
      mine,
      marks: [...marks, ...merged.filter((m) => !known.has(m.betId))],
      history: round ? pushHistory(prev.history, round) : prev.history,
      lastTick: sameRound ? prev.lastTick : 100,
    });
  },

  applyBet: (roundId, bet) => {
    const { round, bets } = get();
    if (!round || round.id !== roundId) return;
    set({ bets: { ...bets, [bet.id]: bet } });
  },

  applyCashout: (e) => {
    const { round, bets, mine, marks } = get();
    if (!round || round.id !== e.roundId) return;
    const b = bets[e.betId];
    const nextBets = b ? { ...bets, [e.betId]: { ...b, status: 'CASHED_OUT' as const, cashoutAt: e.cashoutAt, payout: e.payout } } : bets;
    const nextMine = mine.map((m) => (m && m.id === e.betId ? { ...m, status: 'CASHED_OUT' as const, cashoutAt: e.cashoutAt, payout: e.payout } : m)) as CrashState['mine'];
    const mark: CashoutMark = { betId: e.betId, cashoutAt: e.cashoutAt, payout: e.payout, mine: mine.some((m) => m?.id === e.betId), username: b?.user.displayName ?? e.username };
    set({ bets: nextBets, mine: nextMine, marks: marks.some((m) => m.betId === e.betId) ? marks : [...marks, mark] });
  },

  applyMyBet: (bet) => {
    const { round, mine, bets, marks } = get();
    if (!round || round.id !== bet.roundId) return;
    const next = [...mine] as CrashState['mine'];
    next[bet.slot] = bet;
    const nextMarks =
      bet.status === 'CASHED_OUT' && bet.cashoutAt
        ? marks.some((m) => m.betId === bet.id)
          ? marks.map((m) => (m.betId === bet.id ? { ...m, mine: true } : m))
          : [...marks, { betId: bet.id, cashoutAt: bet.cashoutAt, payout: bet.payout ?? 0, mine: true, username: bet.user.displayName }]
        : marks;
    set({ mine: next, bets: { ...bets, [bet.id]: { ...bets[bet.id], ...bet } }, marks: nextMarks });
  },

  applyTick: (m, t) => {
    sampleServerTime(t);
    if (m > get().lastTick) set({ lastTick: m });
  },
}));

/** Current multiplier (×1) of the running round, from the synced server clock. */
export function liveMultiplier(round: CrashRoundPublic | null): number {
  if (!round) return 1;
  if (round.crashPoint !== undefined && (round.status === 'CRASHED' || round.status === 'SETTLED')) return round.crashPoint / 100;
  if (round.status !== 'RUNNING' || !round.startedAt) return 1;
  return multiplierAt(serverNow() - round.startedAt);
}
