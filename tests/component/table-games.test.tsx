import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { startRound } from '@/engines/blackjack/engine';
import { DEFAULT_RULES } from '@/engines/blackjack/types';
import { toTableView } from '@/engines/blackjack/view';
import { useBalance } from '@/stores/balance-store';

vi.mock('@/audio/audio-manager', () => ({ playSound: () => undefined }));
const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('@/lib/api', async (orig) => {
  const real = await orig<typeof import('@/lib/api')>();
  return { ...real, api: { get: (u: string) => apiGet(u), post: (u: string, b: unknown) => apiPost(u, b) } };
});

// jsdom has no matchMedia (framer-motion's useReducedMotion reads it).
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const SHOE = { id: 's1', number: 1, decks: 6, total: 312, dealt: 4, remaining: 308, cutCard: 234, penetration: 0, reshuffleNext: false };

beforeEach(() => {
  apiGet.mockReset();
  apiPost.mockReset();
  useBalance.setState({ balance: 10_000, held: null, lastDelta: null });
  sessionStorage.clear();
});

describe('useBlackjack', () => {
  it('releases a held balance when unmounted mid-reveal (regression)', async () => {
    const { useBlackjack } = await import('@/components/games/blackjack/use-blackjack');
    // Player natural vs dealer 7: settles on the deal, paying 250 on a 100 bet.
    const cards = ['AS', 'TC', 'KH', '7D'];
    const s = startRound(DEFAULT_RULES, 100n, () => cards.shift()!).state;
    const view = toTableView(s);
    const game = { ...view, id: 'g1', status: 'SETTLED', settled: true, net: 150, forced: false, createdAt: new Date(0).toISOString(), settledAt: null };
    apiGet.mockResolvedValue({ game: null, config: { ...DEFAULT_RULES, enabled: true, minBet: 100, maxBet: 1000, penetration: 0.75 }, shoe: SHOE, balance: 10_000 });
    apiPost.mockResolvedValue({ game, balance: 10_150, shoe: SHOE });

    const { result, unmount } = renderHook(() => useBlackjack(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.config).not.toBeNull());
    await act(async () => {
      await result.current.deal(100);
    });
    // Reveal in progress: the payout is held back.
    expect(useBalance.getState().held).toBe(9_900);
    unmount();
    expect(useBalance.getState().held).toBeNull();
    expect(useBalance.getState().balance).toBe(10_150);
  });
});

describe('useRouletteTable', () => {
  it('does not keep a spinning (already wagered) slip as a restorable draft (regression)', async () => {
    const { useRouletteTable } = await import('@/components/games/roulette/use-roulette-table');
    const state = {
      enabled: true,
      limits: { minBet: 100, maxBet: 500_000, maxStraightBet: 50_000, maxOutsideBet: 250_000 },
      betLimits: {} as never,
      recent: [],
      lastRound: null,
    };
    const { result } = renderHook(() => useRouletteTable(state), { wrapper: wrapper() });
    act(() => result.current.onSpinStart({ RED: 1_000 }));
    expect(sessionStorage.getItem('nova:roulette:draft')).toBeNull();
    // A failed spin returns the slip to the layout as a draft again.
    act(() => result.current.onSpinFailed());
    expect(JSON.parse(sessionStorage.getItem('nova:roulette:draft') ?? 'null')).toEqual({ RED: 1_000 });
  });
});
