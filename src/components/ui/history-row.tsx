'use client';
import { cn } from '@/lib/cn';
import { formatCredits, formatShortDateTime } from '@/lib/format';
import { ChevronRight } from 'lucide-react';

/** HistoryRow — one settled round. Used in /history, profiles and game sidebars. */
export function HistoryRow({
  time,
  title,
  detail,
  wager,
  payout,
  net,
  onClick,
  compact,
}: {
  time: string;
  title: React.ReactNode;
  detail?: React.ReactNode;
  wager: number;
  payout: number;
  net: number;
  onClick?: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'group grid w-full items-center gap-3 border-b border-line-soft px-3 text-left transition-colors last:border-0 enabled:hover:bg-surface-2',
        compact ? 'grid-cols-[1fr_auto] py-2.5' : 'grid-cols-[1fr_auto] py-3 sm:grid-cols-[150px_1fr_110px_110px_110px_16px]',
      )}
    >
      <span className={cn('text-xs text-fg-subtle', compact ? 'hidden' : 'hidden sm:block')}>{formatShortDateTime(time)}</span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-fg">{title}</span>
        <span className={cn('block truncate text-xs text-fg-subtle', !compact && 'sm:hidden')}>
          {detail ?? formatShortDateTime(time)}
        </span>
        {detail && !compact ? <span className="hidden truncate text-xs text-fg-subtle sm:block">{detail}</span> : null}
      </span>
      <span className={cn('tabular text-right text-[13px] text-fg-muted', compact ? 'hidden' : 'hidden sm:block')}>{formatCredits(wager)}</span>
      <span className={cn('tabular text-right text-[13px] text-fg-muted', compact ? 'hidden' : 'hidden sm:block')}>{formatCredits(payout)}</span>
      <span className={cn('tabular text-right text-[13px] font-semibold', net > 0 ? 'text-win' : net < 0 ? 'text-fg-subtle' : 'text-fg-muted')}>
        {formatCredits(net, { sign: true })}
      </span>
      <ChevronRight size={14} className={cn('text-fg-faint transition-transform group-hover:translate-x-0.5', compact ? 'hidden' : 'hidden sm:block')} />
    </button>
  );
}
