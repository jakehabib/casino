'use client';
import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { History as HistoryIcon } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatCredits, formatMultiplier } from '@/lib/format';
import type { GameKey } from '@/lib/games';
import { Tabs } from '@/components/ui/tabs';
import { HistoryRow } from '@/components/ui/history-row';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import type { HistoryItem, historyTotals } from '@/server/services/history/history-service';
import { RoundDetailModal, gameName } from './round-detail-modal';

type Totals = Awaited<ReturnType<typeof historyTotals>>;
type Page = { items: HistoryItem[]; nextCursor: string | null; totals: Totals | null };

const TABS: { value: 'ALL' | GameKey; label: string }[] = [
  { value: 'ALL', label: 'All games' },
  { value: 'BLACKJACK', label: 'Blackjack' },
  { value: 'BACCARAT', label: 'Baccarat' },
  { value: 'ROULETTE', label: 'Roulette' },
  { value: 'CRASH', label: 'Crash' },
  { value: 'SLOTS', label: 'Slots' },
];

const GAME_HREF: Record<GameKey, string> = {
  BLACKJACK: '/casino/blackjack',
  BACCARAT: '/casino/baccarat',
  ROULETTE: '/casino/roulette',
  CRASH: '/casino/crash',
  SLOTS: '/casino/slots',
};

function TotalsStrip({ totals }: { totals: Totals | null | undefined }) {
  const cells = [
    { label: 'Rounds', value: totals ? totals.rounds.toLocaleString('en-US') : null },
    { label: 'Wagered', value: totals ? formatCredits(totals.wagered) : null },
    { label: 'Returned', value: totals ? formatCredits(totals.returned) : null },
    { label: 'Net result', value: totals ? formatCredits(totals.net, { sign: true }) : null, tone: totals && totals.net > 0 ? 'text-win' : undefined },
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
      {cells.map((c) => (
        <div key={c.label} className="bg-surface-1 px-4 py-3">
          <div className="text-xs font-medium text-fg-subtle">{c.label}</div>
          {c.value === null ? <Skeleton className="mt-1.5 h-5 w-20" /> : <div className={cn('tabular mt-0.5 text-lg font-semibold tracking-tight', c.tone)}>{c.value}</div>}
        </div>
      ))}
    </div>
  );
}

export function HistoryView() {
  const [tab, setTab] = useState<'ALL' | GameKey>('ALL');
  const [open, setOpen] = useState<HistoryItem | null>(null);
  const q = useInfiniteQuery({
    queryKey: ['history', tab],
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ take: '25' });
      if (tab !== 'ALL') p.set('game', tab);
      if (pageParam) p.set('cursor', pageParam);
      return api.get<Page>(`/api/history?${p}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 15_000,
  });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  const totals = q.data?.pages[0]?.totals;

  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver((e) => {
      if (e[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
    }, { rootMargin: '240px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="space-y-4">
      <Tabs items={TABS} value={tab} onValueChange={(v) => setTab(v as typeof tab)} listClassName="w-full sm:w-auto" />
      <TotalsStrip totals={q.isLoading ? undefined : totals ?? null} />

      <section className="overflow-hidden rounded-xl border border-line bg-surface-1">
        <div className="hidden grid-cols-[150px_1fr_110px_110px_110px_16px] gap-3 border-b border-line-soft bg-bg-raised/50 px-3 py-2 text-2xs font-semibold uppercase tracking-[0.1em] text-fg-subtle sm:grid">
          <span>Time</span>
          <span>Game · Result</span>
          <span className="text-right">Bet</span>
          <span className="text-right">Payout</span>
          <span className="text-right">Net</span>
          <span />
        </div>
        {q.isLoading ? (
          <div>
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-line-soft px-3 py-3.5 last:border-0">
                <Skeleton className="hidden h-3.5 w-24 sm:block" />
                <Skeleton className="h-4 w-44" />
                <Skeleton className="ml-auto h-4 w-16" />
              </div>
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState title="Couldn’t load your history" onRetry={() => void q.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<HistoryIcon size={20} />}
            title={tab === 'ALL' ? 'No rounds played yet' : `No ${TABS.find((t) => t.value === tab)?.label} rounds yet`}
            body="Settled rounds appear here with their full result and provably fair details."
            action={
              <Link href={tab === 'ALL' ? '/casino' : GAME_HREF[tab]}>
                <Button variant="secondary" size="sm">
                  {tab === 'ALL' ? 'Browse games' : `Play ${TABS.find((t) => t.value === tab)?.label}`}
                </Button>
              </Link>
            }
          />
        ) : (
          <div data-testid="history-rows">
            {rows.map((r) => (
              <HistoryRow
                key={r.id}
                time={r.createdAt}
                title={
                  <span className="flex items-center gap-2">
                    {gameName(r.game, r.variant)}
                    {r.multiplier && r.multiplier > 0 && r.net > 0 ? <span className="tabular rounded bg-surface-3 px-1.5 text-[11px] font-semibold text-fg-muted">{formatMultiplier(r.multiplier)}</span> : null}
                  </span>
                }
                detail={r.summary}
                wager={r.wager}
                payout={r.payout}
                net={r.net}
                onClick={() => setOpen(r)}
              />
            ))}
          </div>
        )}
        {rows.length > 0 ? (
          <div ref={sentinel} className="flex justify-center border-t border-line-soft px-4 py-3">
            {q.hasNextPage ? (
              <Button variant="ghost" size="sm" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
                Load more
              </Button>
            ) : (
              <span className="text-xs text-fg-faint">That’s everything</span>
            )}
          </div>
        ) : null}
      </section>

      <RoundDetailModal round={open ? { game: open.game, id: open.referenceId, variant: open.variant } : null} createdAt={open?.createdAt} onClose={() => setOpen(null)} />
    </div>
  );
}
