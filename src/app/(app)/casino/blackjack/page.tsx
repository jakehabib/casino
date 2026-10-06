'use client';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const BlackjackGame = dynamic(() => import('@/components/games/blackjack/blackjack-game'), {
  ssr: false,
  loading: () => (
    <div className="mx-auto w-full max-w-[1320px] px-3 pt-3 sm:px-5 sm:pt-5">
      <Skeleton className="mb-3 h-10 w-48 rounded-lg" />
      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        <Skeleton className="order-2 h-[420px] rounded-xl lg:order-1" />
        <Skeleton className="order-1 h-[470px] rounded-xl sm:h-[590px] lg:order-2" />
      </div>
    </div>
  ),
});

export default function BlackjackPage() {
  return <BlackjackGame />;
}
