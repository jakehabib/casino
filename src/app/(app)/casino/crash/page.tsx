'use client';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const CrashGame = dynamic(() => import('@/components/games/crash/crash-game').then((m) => m.CrashGame), {
  ssr: false,
  loading: () => (
    <div className="mx-auto w-full max-w-[1320px] px-3 pt-3 sm:px-5 sm:pt-5">
      <Skeleton className="mb-3 h-8 w-40 rounded-md" />
      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        <Skeleton className="order-2 h-[420px] rounded-xl lg:order-1" />
        <Skeleton className="order-1 h-[300px] rounded-xl sm:h-[400px] lg:order-2 lg:h-[470px]" />
      </div>
    </div>
  ),
});

export default function CrashPage() {
  return <CrashGame />;
}
