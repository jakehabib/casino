'use client';
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import type { RoundDetail } from '@/lib/round-detail';
import type { GameKey } from '@/lib/games';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Game-specific round visuals for the history modal. Each game owns its
 * <RoundDetail/> component; they are lazy-loaded so /history stays light.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DetailComponent = ComponentType<{ detail: RoundDetail<any> }>;

const loading = () => <Skeleton className="h-48 w-full rounded-xl" />;

export const ROUND_DETAIL_REGISTRY: Record<GameKey, DetailComponent> = {
  BLACKJACK: dynamic(() => import('@/components/games/blackjack/round-detail').then((m) => m.BlackjackRoundDetail as DetailComponent), { loading }),
  BACCARAT: dynamic(() => import('@/components/games/baccarat/round-detail').then((m) => m.BaccaratRoundDetail as DetailComponent), { loading }),
  ROULETTE: dynamic(() => import('@/components/games/roulette/round-detail').then((m) => m.RouletteRoundDetail as DetailComponent), { loading }),
  CRASH: dynamic(() => import('@/components/games/crash/round-detail').then((m) => m.CrashRoundDetail as DetailComponent), { loading }),
  SLOTS: (() => null) as DetailComponent, // TEMP until slots/round-detail lands
};

/** API path of a round's detail payload. Crash uses the CrashBet id; slots the SlotSpin id. */
export function roundDetailUrl(game: GameKey, id: string) {
  return `/api/games/${game.toLowerCase()}/rounds/${encodeURIComponent(id)}`;
}
