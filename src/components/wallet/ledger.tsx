'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Gift, RotateCcw, Sparkles, SlidersHorizontal, Trophy } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatCredits, formatShortDateTime } from '@/lib/format';
import { GAME_LABEL, GAMES, type GameKey } from '@/lib/games';
import { useSocketEvent } from '@/hooks/use-socket';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import type { serializeTransaction } from '@/server/services/wallet/wallet-service';

export type LedgerEntry = ReturnType<typeof serializeTransaction>;
type TxType = LedgerEntry['type'];

const FILTERS: { value: string; label: string; types: TxType[] }[] = [
  { value: 'all', label: 'All', types: [] },
  { value: 'wagers', label: 'Wagers', types: ['BET'] },
  { value: 'wins', label: 'Wins', types: ['WIN'] },
  { value: 'rewards', label: 'Rewards', types: ['FREE_CREDIT_CLAIM', 'SIGNUP_GRANT'] },
  { value: 'refunds', label: 'Refunds', types: ['REFUND'] },
  { value: 'adjustments', label: 'Adjustments', types: ['ADMIN_ADJUSTMENT'] },
];

const TYPE_META: Record<TxType, { label: string; icon: React.ReactNode }> = {
  BET: { label: 'Wager', icon: <ArrowUpRight size={15} /> },
  WIN: { label: 'Win', icon: <Trophy size={14} /> },
  REFUND: { label: 'Refund', icon: <RotateCcw size={14} /> },
  FREE_CREDIT_CLAIM: { label: 'Reward', icon: <Gift size={14} /> },
  SIGNUP_GRANT: { label: 'Welcome Credits', icon: <Sparkles size={14} /> },
  ADMIN_ADJUSTMENT: { label: 'Adjustment', icon: <SlidersHorizontal size={14} /> },
};

const REWARD_LABEL: Record<string, string> = {
  DAILY: 'Daily Credits',
  REFILL: 'Emergency refill',
  WEEKLY: 'Weekly bonus',
  LEVEL_UP: 'Level milestone',
};

function describe(t: LedgerEntry): string {
  const m = (t.metadata ?? {}) as Record<string, unknown>;
  if (t.type === 'FREE_CREDIT_CLAIM') return REWARD_LABEL[String(m.reward)] ?? 'Reward claim';
  if (t.type === 'SIGNUP_GRANT') return 'Account opened';
  if (t.type === 'ADMIN_ADJUSTMENT') return typeof m.reason === 'string' ? m.reason : 'Balance adjustment';
  const game = typeof m.game === 'string' ? (m.game as GameKey) : null;
  const variant = typeof m.variant === 'string' ? GAMES.find((g) => g.slotId === m.variant)?.name : null;
  const name = variant ?? (game ? GAME_LABEL[game] : null);
  if (t.type === 'REFUND') return [name, typeof m.reason === 'string' ? m.reason : 'Stake returned'].filter(Boolean).join(' · ');
  return name ?? t.referenceType.replace(/_/g, ' ').toLowerCase();
}

function shortRef(id: string) {
  return id.length > 10 ? `${id.slice(0, 4)}…${id.slice(-5)}` : id;
}

function Amount({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('tabular font-semibold', value > 0 ? 'text-win' : 'text-fg', className)}>
      {formatCredits(value, { sign: true })}
    </span>
  );
}

function TypeIcon({ type }: { type: TxType }) {
  return (
    <span
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
        type === 'BET' ? 'bg-surface-3 text-fg-subtle' : type === 'WIN' ? 'bg-win-soft text-win' : type === 'FREE_CREDIT_CLAIM' || type === 'SIGNUP_GRANT' ? 'bg-accent-soft text-accent' : 'bg-surface-3 text-fg-muted',
      )}
    >
      {TYPE_META[type].icon}
    </span>
  );
}

export function Ledger() {
  const [filter, setFilter] = useState('all');
  const types = FILTERS.find((f) => f.value === filter)!.types;
  const qc = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ['wallet-ledger', filter],
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ take: '30' });
      if (pageParam) p.set('cursor', pageParam);
      if (types.length) p.set('types', types.join(','));
      return api.get<{ items: LedgerEntry[]; nextCursor: string | null }>(`/api/wallet/transactions?${p}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });

  // New ledger rows arrive with every balance change; refresh the first page.
  const onWallet = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['wallet-ledger'] });
  }, [qc]);
  useSocketEvent('wallet:update', onWallet);

  // Auto-load when the sentinel scrolls into view ("Load more" stays as a fallback).
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver((e) => {
      if (e[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
    }, { rootMargin: '240px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface-1">
      <div className="flex flex-col gap-3 border-b border-line-soft px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">Transactions</h2>
          <p className="text-xs text-fg-subtle">Every Credit in and out of your wallet, newest first.</p>
        </div>
        <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Filter transactions">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              role="tab"
              aria-selected={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors',
                filter === f.value ? 'border-fg-muted/50 bg-surface-3 text-fg' : 'border-line bg-surface-2 text-fg-muted hover:border-line-strong hover:text-fg',
              )}
              data-testid={`ledger-filter-${f.value}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_130px_130px_130px] gap-4 border-b border-line-soft bg-bg-raised/50 px-5 py-2 text-2xs font-semibold uppercase tracking-[0.1em] text-fg-subtle md:grid">
        <span>Type</span>
        <span>Reference</span>
        <span className="text-right">Amount</span>
        <span className="text-right">Balance after</span>
        <span className="text-right">Time</span>
      </div>

      {query.isLoading ? (
        <div className="divide-y divide-line-soft">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="ml-auto h-4 w-20" />
            </div>
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState title="Couldn’t load transactions" onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ArrowDownLeft size={20} />}
          title={filter === 'all' ? 'No transactions yet' : 'Nothing here yet'}
          body={filter === 'all' ? 'Wagers, wins and rewards will appear here as they happen.' : 'No transactions match this filter.'}
        />
      ) : (
        <ul className="divide-y divide-line-soft" data-testid="ledger-rows">
          {rows.map((t) => (
            <li key={t.id} className="px-4 py-3 transition-colors hover:bg-surface-2/50 sm:px-5">
              {/* Desktop row */}
              <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_130px_130px_130px] items-center gap-4 md:grid">
                <span className="flex min-w-0 items-center gap-3">
                  <TypeIcon type={t.type} />
                  <span className="truncate text-[13px] font-medium text-fg">{TYPE_META[t.type].label}</span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-fg-muted">{describe(t)}</span>
                  <span className="block truncate font-mono text-[11px] text-fg-faint" title={t.referenceId}>
                    {shortRef(t.referenceId)}
                  </span>
                </span>
                <Amount value={t.amount} className="text-right text-[13px]" />
                <span className="tabular text-right text-[13px] text-fg-muted">{formatCredits(t.balanceAfter)}</span>
                <span className="text-right text-xs text-fg-subtle">{formatShortDateTime(t.createdAt)}</span>
              </div>
              {/* Mobile card */}
              <div className="flex items-center gap-3 md:hidden">
                <TypeIcon type={t.type} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-fg">{TYPE_META[t.type].label}</span>
                    <Amount value={t.amount} className="text-[13px]" />
                  </div>
                  <div className="mt-0.5 flex items-baseline justify-between gap-2 text-xs text-fg-subtle">
                    <span className="truncate">
                      {describe(t)} · {formatShortDateTime(t.createdAt)}
                    </span>
                    <span className="tabular shrink-0">{formatCredits(t.balanceAfter)}</span>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 ? (
        <div ref={sentinel} className="flex items-center justify-center border-t border-line-soft px-4 py-3">
          {query.hasNextPage ? (
            <Button variant="ghost" size="sm" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()} data-testid="ledger-more">
              Load more
            </Button>
          ) : (
            <span className="text-xs text-fg-faint">You’ve reached the beginning of your history</span>
          )}
        </div>
      ) : null}
    </section>
  );
}
