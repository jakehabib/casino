'use client';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

// Dev tooling stays out of every other route's bundle.
const DevPanel = dynamic(() => import('@/components/dev/dev-panel').then((m) => m.DevPanel), {
  loading: () => (
    <div className="mx-auto grid max-w-[1400px] gap-4 px-4 pt-5 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-56 rounded-xl" />
      ))}
    </div>
  ),
});

export default function DevPage() {
  return <DevPanel />;
}
