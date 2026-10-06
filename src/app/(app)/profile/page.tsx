'use client';
import Link from 'next/link';
import { UserRound } from 'lucide-react';
import { useMe } from '@/hooks/use-me';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';
import { OwnProfileView } from '@/components/profile/own-profile';

export default function ProfilePage() {
  const { data: me, isLoading } = useMe();
  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-12 pt-6 sm:px-6">
      {isLoading ? (
        <Skeleton className="h-[210px] rounded-2xl" />
      ) : me ? (
        <OwnProfileView />
      ) : (
        <EmptyState
          icon={<UserRound size={18} />}
          title="Sign in to see your profile"
          body="Your level, stats and recent games live here."
          className="rounded-2xl border border-line bg-surface-1 py-16"
          action={
            <Link href="/login?next=/profile">
              <Button size="sm">Sign in</Button>
            </Link>
          }
        />
      )}
    </div>
  );
}
