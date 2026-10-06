'use client';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const RouletteGame = dynamic(() => import('@/components/games/roulette/roulette-game').then((m) => m.RouletteGame), {
  ssr: false,
  loading: () => (
    <div className="mx-auto w-full max-w-[1320px] space-y-3 px-3 pt-3 sm:px-5 sm:pt-5">
      <Skeleton className="h-8 w-56 rounded-md" />
      <Skeleton className="h-[460px] rounded-xl" />
      <Skeleton className="h-[84px] rounded-xl" />
    </div>
  ),
});

export default function RoulettePage() {
  return <RouletteGame />;
}
