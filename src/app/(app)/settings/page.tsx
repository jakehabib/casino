'use client';
import Link from 'next/link';
import { Settings } from 'lucide-react';
import { useMe } from '@/hooks/use-me';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';
import { SettingsView } from '@/components/profile/settings-view';

export default function SettingsPage() {
  const { data: me, isLoading } = useMe();
  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-12 pt-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-fg-muted">Your profile, privacy, sound and security.</p>
      </div>
      {isLoading ? (
        <Skeleton className="h-[320px] rounded-2xl" />
      ) : me ? (
        <SettingsView />
      ) : (
        <EmptyState
          icon={<Settings size={18} />}
          title="Sign in to manage settings"
          className="rounded-2xl border border-line bg-surface-1 py-16"
          action={
            <Link href="/login?next=/settings">
              <Button size="sm">Sign in</Button>
            </Link>
          }
        />
      )}
    </div>
  );
}
