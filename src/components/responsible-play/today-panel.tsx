'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Clock, Globe2 } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatCredits } from '@/lib/format';
import { useNow } from '@/components/layout/rewards-popover';
import { Panel } from '@/components/wallet/page-frame';
import { COMMON_TIMEZONES, detectTimeZone, formatRemaining, offsetLabel } from './options';
import { RP_KEY, useSetTimezone, type RpSummary } from './use-rp';

/** Neutral progress meter; shifts to the warn tone near the limit. Never celebratory. */
export function LimitMeter({ label, used, limit, remaining, testId }: { label: string; used: number; limit: number | null; remaining: number | null; testId?: string }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  const tone = limit === null ? 'none' : pct >= 100 ? 'reached' : pct >= 80 ? 'near' : 'ok';
  return (
    <div data-testid={testId}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-fg-muted">{label}</span>
        <span className="tabular text-[13px] text-fg">
          {limit === null ? (
            <span className="text-fg-subtle">No limit set</span>
          ) : (
            <>
              <span className="font-semibold">{formatCredits(used)}</span>
              <span className="text-fg-subtle"> / {formatCredits(limit)}</span>
            </>
          )}
        </span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={limit ?? 0}
        aria-valuenow={limit === null ? 0 : Math.min(used, limit)}
      >
        {limit !== null ? (
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out-quint)]',
              tone === 'ok' && 'bg-fg-muted/70',
              (tone === 'near' || tone === 'reached') && 'bg-warn',
            )}
            style={{ width: `${Math.max(pct, used > 0 ? 1.5 : 0)}%` }}
          />
        ) : null}
      </div>
      <div className="mt-1.5 flex justify-between text-xs">
        <span className={cn(tone === 'near' || tone === 'reached' ? 'text-warn' : 'text-fg-subtle')}>
          {limit === null
            ? 'Set a limit below to track it here.'
            : tone === 'reached'
              ? 'Limit reached — new wagers are paused until the reset.'
              : tone === 'near'
                ? 'Approaching your limit.'
                : `${Math.round(pct)}% used`}
        </span>
        {remaining !== null ? <span className="tabular text-fg-subtle">{formatCredits(remaining)} left</span> : null}
      </div>
    </div>
  );
}

function TimezoneSelect({ value }: { value: string }) {
  const setTz = useSetTimezone();
  const detected = useMemo(() => detectTimeZone(), []);
  const zones = useMemo(() => {
    const list = new Set<string>();
    if (detected) list.add(detected);
    list.add(value);
    for (const z of COMMON_TIMEZONES) list.add(z);
    return [...list];
  }, [detected, value]);
  return (
    <label className="relative inline-flex h-8 max-w-full items-center gap-1.5 rounded-md border border-line bg-surface-2 pl-2.5 pr-2 text-xs font-medium text-fg-muted transition-colors focus-within:border-accent/70 hover:border-line-strong hover:text-fg">
      <Globe2 size={13} className="shrink-0 text-fg-subtle" />
      <span className="sr-only">Responsible play timezone</span>
      <select
        className="min-w-0 max-w-[220px] cursor-pointer appearance-none truncate bg-transparent pr-4 text-fg outline-none disabled:opacity-60"
        value={value}
        disabled={setTz.isPending}
        onChange={(e) => setTz.mutate(e.target.value)}
        data-testid="rp-timezone"
      >
        {zones.map((z) => (
          <option key={z} value={z} className="bg-surface-2">
            {z.replace(/_/g, ' ')} ({offsetLabel(z)}){z === detected ? ' · detected' : ''}
          </option>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-2 h-3 w-3 text-fg-subtle" viewBox="0 0 12 12" aria-hidden>
        <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </label>
  );
}

export function TodayPanel({ data }: { data: RpSummary }) {
  const now = useNow(1000);
  const qc = useQueryClient();
  const resetsAt = new Date(data.resetsAt).getTime();
  const remaining = resetsAt - now;
  const refetched = useRef<string | null>(null);

  // Roll over to the new day as soon as the countdown completes.
  useEffect(() => {
    if (remaining <= 0 && refetched.current !== data.resetsAt) {
      refetched.current = data.resetsAt;
      void qc.invalidateQueries({ queryKey: RP_KEY });
    }
  }, [remaining, data.resetsAt, qc]);

  const localDate = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: data.timezone }).format(new Date(now));
    } catch {
      return '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.timezone, Math.floor(now / 60_000)]);
  const resetClock = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: data.timezone }).format(new Date(data.resetsAt));
    } catch {
      return '';
    }
  }, [data.resetsAt, data.timezone]);

  const wager = data.limits.dailyWager;
  const loss = data.limits.dailyLoss;

  return (
    <Panel className="overflow-hidden" as="section">
      <div className="flex flex-col gap-3 border-b border-line-soft px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold tracking-tight">Today</h2>
            <span className="text-[13px] text-fg-subtle">{localDate}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TimezoneSelect value={data.timezone} />
          <div className="inline-flex h-8 items-center gap-1.5 rounded-md bg-surface-2 px-2.5 text-xs text-fg-muted" data-testid="rp-reset">
            <Clock size={13} className="text-fg-subtle" />
            <span>
              Resets in <span className="tabular font-semibold text-fg">{formatRemaining(remaining)}</span>
              <span className="hidden text-fg-subtle sm:inline"> · {resetClock}</span>
            </span>
          </div>
        </div>
      </div>
      <div className="grid gap-px bg-line-soft lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
        <div className="grid grid-cols-2 gap-px bg-line-soft">
          <div className="bg-surface-1 px-4 py-4 sm:px-5">
            <div className="text-xs font-medium text-fg-subtle">Credits wagered</div>
            <div className="tabular mt-1 text-2xl font-semibold tracking-tight" data-testid="rp-wagered">
              {formatCredits(data.today.wagered)}
            </div>
            <div className="mt-0.5 text-xs text-fg-subtle">Counted when accepted</div>
          </div>
          <div className="bg-surface-1 px-4 py-4 sm:px-5">
            <div className="text-xs font-medium text-fg-subtle">Net result</div>
            <div className="tabular mt-1 text-2xl font-semibold tracking-tight" data-testid="rp-net">
              {formatCredits(data.today.net, { sign: true })}
            </div>
            <div className="tabular mt-0.5 text-xs text-fg-subtle">{formatCredits(data.today.won)} returned</div>
          </div>
        </div>
        <div className="grid gap-5 bg-surface-1 px-4 py-4 sm:grid-cols-2 sm:px-5">
          <LimitMeter label="Daily wager limit" used={data.today.wagered} limit={wager.limit} remaining={wager.remaining} testId="meter-wager" />
          <LimitMeter label="Daily loss limit" used={data.today.loss} limit={loss.limit} remaining={loss.remaining} testId="meter-loss" />
        </div>
      </div>
      <p className="border-t border-line-soft px-4 py-2.5 text-xs text-fg-subtle sm:px-5">
        Your day runs from midnight to midnight in <span className="text-fg-muted">{data.timezone.replace(/_/g, ' ')}</span>. Changing timezone never resets today’s totals.
      </p>
    </Panel>
  );
}
