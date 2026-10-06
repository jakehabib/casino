'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift, Zap, Clock } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Popover } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { formatCredits, formatDuration } from '@/lib/format';
import { toast } from '@/components/ui/toast';
import type { getRewardStatus } from '@/server/services/rewards/rewards-service';
import { cn } from '@/lib/cn';

export type RewardStatus = Awaited<ReturnType<typeof getRewardStatus>>;

export function useRewards(enabled = true) {
  return useQuery({ queryKey: ['rewards'], queryFn: () => api.get<RewardStatus>('/api/rewards'), enabled, staleTime: 15_000 });
}

export function useClaimReward() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { type: 'DAILY' | 'REFILL' | 'WEEKLY' | 'LEVEL_UP'; level?: number }) => api.post<{ amount: number; balance: number }>('/api/rewards/claim', v),
    onSuccess: (r) => {
      toast.reward(`+${formatCredits(r.amount)} Credits`, 'Added to your balance.');
      void qc.invalidateQueries({ queryKey: ['rewards'] });
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.title : 'Could not claim', e.message),
  });
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function Row({ icon, title, sub, action }: { icon: React.ReactNode; title: string; sub: React.ReactNode; action: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2.5 py-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-3">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-fg">{title}</div>
        <div className="truncate text-xs text-fg-subtle">{sub}</div>
      </div>
      {action}
    </div>
  );
}

export function RewardsPopover({ compact }: { compact?: boolean }) {
  const { data } = useRewards();
  const claim = useClaimReward();
  const now = useNow();
  const ready = (data?.daily.available ? 1 : 0) + (data?.refill.available ? 1 : 0);
  return (
    <Popover
      align="end"
      className="w-[min(340px,calc(100vw-24px))] p-1.5"
      trigger={
        <button
          className={cn(
            'relative flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-semibold transition-colors',
            ready ? 'bg-gold-soft text-gold hover:bg-gold/15' : 'border border-line bg-surface-2 text-fg-muted hover:text-fg',
            compact && 'w-9 justify-center px-0',
          )}
          aria-label="Free Credits"
          data-testid="free-credits"
        >
          <Gift size={16} />
          {compact ? null : <span className="hidden xl:inline">Free Credits</span>}
          {ready ? <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-gold ring-2 ring-bg" /> : null}
        </button>
      }
    >
      <div className="px-2.5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">Free Credits</div>
      {data ? (
        <>
          <Row
            icon={<Gift size={17} className="text-gold" />}
            title={`Daily · ${formatCredits(data.daily.amount)}`}
            sub={data.daily.available ? 'Ready to claim' : <span className="inline-flex items-center gap-1"><Clock size={11} /> {formatDuration(new Date(data.daily.nextAt).getTime() - now)}</span>}
            action={
              <Button size="sm" variant={data.daily.available ? 'gold' : 'subtle'} disabled={!data.daily.available} loading={claim.isPending && claim.variables?.type === 'DAILY'} onClick={() => claim.mutate({ type: 'DAILY' })}>
                Claim
              </Button>
            }
          />
          <Row
            icon={<Zap size={17} className="text-accent" />}
            title={`Emergency refill · ${formatCredits(data.refill.amount)}`}
            sub={
              data.refill.available
                ? 'Ready to claim'
                : !data.refill.belowThreshold
                  ? `Below ${formatCredits(data.refill.threshold)} Credits`
                  : `Ready in ${formatDuration(new Date(data.refill.nextAt).getTime() - now)}`
            }
            action={
              <Button size="sm" variant={data.refill.available ? 'primary' : 'subtle'} disabled={!data.refill.available} loading={claim.isPending && claim.variables?.type === 'REFILL'} onClick={() => claim.mutate({ type: 'REFILL' })}>
                Claim
              </Button>
            }
          />
          <Link href="/rewards" className="mx-1 mt-1 block rounded-md px-2 py-2 text-center text-xs font-medium text-fg-muted hover:bg-surface-2 hover:text-fg">
            All rewards
          </Link>
        </>
      ) : (
        <div className="space-y-2 p-2.5">
          <div className="skeleton h-12 rounded-lg" />
          <div className="skeleton h-12 rounded-lg" />
        </div>
      )}
    </Popover>
  );
}
