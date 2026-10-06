'use client';
import { create } from 'zustand';

/**
 * Display balance. The server is authoritative; this store mirrors the latest
 * server-confirmed balance (from /api/me, `wallet:update` pushes and game
 * responses).
 *
 * Games may temporarily *hold* the displayed value during an animation (e.g.
 * show the stake deducted while reels spin) so winnings land when the result
 * is revealed — never before. `release()` always returns to server truth.
 */
interface BalanceState {
  balance: number | null;
  held: number | null;
  lastDelta: { amount: number; at: number } | null;
  set: (balance: number, delta?: number) => void;
  hold: (value: number) => void;
  release: () => void;
}

export const useBalance = create<BalanceState>((set, get) => ({
  balance: null,
  held: null,
  lastDelta: null,
  // While a game holds the display, the delta is deferred to release() so wins never show before the reveal.
  set: (balance, delta) => set({ balance, lastDelta: delta && get().held === null ? { amount: delta, at: Date.now() } : get().lastDelta }),
  hold: (value) => set({ held: value }),
  release: () => {
    const { held, balance } = get();
    if (held !== null && balance !== null && balance !== held) {
      set({ held: null, lastDelta: { amount: balance - held, at: Date.now() } });
    } else set({ held: null });
  },
}));

export function useDisplayBalance(): number | null {
  return useBalance((s) => s.held ?? s.balance);
}
