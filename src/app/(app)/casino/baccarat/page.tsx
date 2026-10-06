'use client';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const BaccaratGame = dynamic(() => import('@/components/games/baccarat/baccarat-game').then((m) => m.BaccaratGame), {
  ssr: false,
  loading: () => (
    <div className="mx-auto w-full max-w-[1320px] px-3 pt-3 sm:px-5 sm:pt-5">
      <Skeleton className="mb-3 h-10 w-48 rounded-lg" />
      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        <Skeleton className="h-[440px] rounded-xl" />
        <Skeleton className="h-[440px] rounded-xl" />
      </div>
    </div>
  ),
});

export default function BaccaratPage() {
  return <BaccaratGame />;
}
