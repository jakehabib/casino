'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Lock, WifiOff, AlertTriangle, Inbox } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './button';
import { formatDateTime, formatDuration } from '@/lib/format';
import { useEffect, useState } from 'react';

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface-2 text-fg-subtle">{icon ?? <Inbox size={20} />}</div>
      <div className="text-sm font-semibold text-fg">{title}</div>
      {body ? <div className="mt-1 max-w-sm text-[13px] text-fg-muted">{body}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', body = 'Please try again in a moment.', onRetry, className }: { title?: string; body?: ReactNode; onRetry?: () => void; className?: string }) {
  return (
    <EmptyState
      className={className}
      icon={<AlertTriangle size={20} className="text-warn" />}
      title={title}
      body={body}
      action={onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button> : undefined}
    />
  );
}

export function ConnectionBanner({ state }: { state: 'connected' | 'reconnecting' | 'offline' }) {
  if (state === 'connected') return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 text-[13px] font-medium text-warn">
      <WifiOff size={14} />
      {state === 'reconnecting' ? 'Connection lost — reconnecting…' : 'You are offline'}
    </div>
  );
}

function useCountdown(until: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  return until ? new Date(until).getTime() - now : null;
}

/**
 * PlayDisabled — shown in place of a game when wagering is blocked by a
 * cooldown, self-exclusion, suspension or maintenance. Calm and neutral. No
 * bypass.
 */
export function PlayDisabled({ code, until, label, note }: { code: string; until: string | null; label?: string; /** Extra context, e.g. a saved bonus. */ note?: ReactNode }) {
  const remaining = useCountdown(until);
  const reason =
    code === 'SELF_EXCLUDED'
      ? `You have an active ${label?.toLowerCase() ?? 'self-exclusion'}.`
      : code === 'COOLDOWN_ACTIVE'
        ? `You are taking a ${label?.toLowerCase() ?? 'break'}.`
        : code === 'ACCOUNT_SUSPENDED'
          ? 'Your account is suspended.'
          : code === 'MAINTENANCE'
            ? 'Games are paused for scheduled maintenance.'
            : 'Play is not available on this account.';
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center rounded-2xl border border-line bg-surface-1 px-6 py-10 text-center" data-testid="play-disabled">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-3 text-fg-muted">
        <Lock size={20} />
      </div>
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">Play currently disabled</h2>
      <p className="mt-2 text-base font-medium text-fg">{reason}</p>
      {until ? (
        <p className="mt-2 text-sm text-fg-muted">
          Casino play is disabled until <span className="font-medium text-fg">{formatDateTime(until)}</span>
          {remaining !== null && remaining > 0 ? <span className="text-fg-subtle"> · {formatDuration(remaining)} remaining</span> : null}
        </p>
      ) : code === 'SELF_EXCLUDED' ? (
        <p className="mt-2 text-sm text-fg-muted">This exclusion has no end date. Contact support to request a review.</p>
      ) : null}
      {note ? <div className="mt-4 w-full rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm text-fg-muted">{note}</div> : null}
      <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
        <Link href="/history" className="w-full sm:w-auto">
          <Button variant="secondary" block>View history</Button>
        </Link>
        <Link href="/responsible-play" className="w-full sm:w-auto">
          <Button variant="secondary" block>Manage account</Button>
        </Link>
        <Link href="/support" className="w-full sm:w-auto">
          <Button variant="ghost" block>Contact support</Button>
        </Link>
      </div>
    </div>
  );
}
