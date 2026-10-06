'use client';
import { ErrorState } from '@/components/ui/states';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="px-4 py-16">
      <ErrorState title="This page hit a snag" body="Your balance and games are safe. Try loading it again." onRetry={reset} />
    </div>
  );
}
