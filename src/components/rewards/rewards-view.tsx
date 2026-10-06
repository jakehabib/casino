'use client';
import { Check, Clock, Gift, Lock, PauseCircle, Trophy, Zap, CalendarRange } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { CreditIcon } from '@/components/ui/credit-icon';
import { LevelBadge } from '@/components/ui/level-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { useClaimReward, useNow, useRewards, type RewardStatus } from '@/components/layout/rewards-popover';
import { useBalance } from '@/stores/balance-store';
import { formatCredits } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { Me } from '@/hooks/use-me';
import { formatRemaining } from '@/components/responsible-play/options';

type ClaimType = 'DAILY' | 'REFILL' | 'WEEKLY' | 'LEVEL_UP';

function useClaim() {
  const claim = useClaimReward();
  const run = (type: ClaimType, level?: number) =>
    claim.mutate({ type, level }, { onSuccess: (r) => useBalance.getState().set(r.balance, r.amount) });
  const pending = (type: ClaimType, level?: number) => claim.isPending && claim.variables?.type === type && (level === undefined || claim.variables?.level === level);
  return { run, pending, busy: claim.isPending };
}

/** Next Monday 00:00 UTC — the weekly bonus window boundary (ISO weeks, UTC). */
function nextWeekStart(now: number) {
  const d = new Date(now);
  const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const day = d.getUTCDay() || 7;
  return t + (8 - day) * 86_400_000;
}

function RewardCard({
  icon,
  eyebrow,
  title,
  amount,
  status,
  children,
  action,
  tone = 'default',
  testId,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  amount: number;
  status: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  tone?: 'default' | 'ready' | 'muted';
  testId?: string;
}) {
  return (
    <article
      data-testid={testId}
      className={cn(
        'relative flex flex-col overflow-hidden rounded-xl border bg-surface-1 p-4 sm:p-5',
        tone === 'ready' ? 'border-accent/40 shadow-[0_0_0_1px_#7c5cff22,0_12px_40px_-20px_#7c5cff66]' : 'border-line',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg', tone === 'ready' ? 'bg-accent-soft text-accent' : 'bg-surface-3 text-fg-muted')}>{icon}</span>
          <div>
            <div className="text-2xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">{eyebrow}</div>
            <div className="text-[14px] font-semibold text-fg">{title}</div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <CreditIcon size={22} />
        <span className="tabular text-[28px] font-semibold leading-none tracking-tight">{formatCredits(amount)}</span>
      </div>
      <div className="mt-2 min-h-[20px] text-[13px] text-fg-muted">{status}</div>
      {children ? <div className="mt-3 flex flex-1 flex-col justify-end">{children}</div> : null}
      {action ? <div className="mt-auto pt-4">{action}</div> : null}
    </article>
  );
}

function Daily({ r, now, claim }: { r: RewardStatus; now: number; claim: ReturnType<typeof useClaim> }) {
  const d = r.daily;
  return (
    <RewardCard
      testId="reward-daily"
      icon={<Gift size={17} />}
      eyebrow="Every day"
      title="Daily Credits"
      amount={d.amount}
      tone={d.available ? 'ready' : 'default'}
      status={
        d.available ? (
          'Ready to claim'
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Clock size={13} /> Next claim in <span className="tabular font-medium text-fg">{formatRemaining(new Date(d.nextAt).getTime() - now)}</span>
          </span>
        )
      }
      action={
        <Button block variant={d.available ? 'primary' : 'subtle'} disabled={!d.available || claim.busy} loading={claim.pending('DAILY')} onClick={() => claim.run('DAILY')}>
          {d.available ? `Claim ${formatCredits(d.amount)}` : 'Claimed'}
        </Button>
      }
    />
  );
}

function Refill({ r, now, balance, claim }: { r: RewardStatus; now: number; balance: number; claim: ReturnType<typeof useClaim> }) {
  const f = r.refill;
  const cooling = f.belowThreshold && !f.available;
  return (
    <RewardCard
      testId="reward-refill"
      icon={<Zap size={17} />}
      eyebrow="When you’re low"
      title="Emergency refill"
      amount={f.amount}
      tone={f.available ? 'ready' : 'default'}
      status={
        f.available ? (
          'Your balance is low — top up now'
        ) : cooling ? (
          <span className="inline-flex items-center gap-1.5">
            <Clock size={13} /> Available again in <span className="tabular font-medium text-fg">{formatRemaining(new Date(f.nextAt).getTime() - now)}</span>
          </span>
        ) : (
          <>Available when your balance is below {formatCredits(f.threshold)} Credits</>
        )
      }
    >
      <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-xs">
        <span className="text-fg-subtle">Your balance</span>
        <span className={cn('tabular font-medium', f.belowThreshold ? 'text-fg' : 'text-fg-muted')}>{formatCredits(balance)}</span>
      </div>
      <Button block className="mt-4" variant={f.available ? 'primary' : 'subtle'} disabled={!f.available || claim.busy} loading={claim.pending('REFILL')} onClick={() => claim.run('REFILL')}>
        {f.available ? `Claim ${formatCredits(f.amount)}` : cooling ? 'Cooling down' : 'Not needed yet'}
      </Button>
    </RewardCard>
  );
}

function Weekly({ r, now, claim }: { r: RewardStatus; now: number; claim: ReturnType<typeof useClaim> }) {
  const w = r.weekly;
  const pct = w.minWagered > 0 ? Math.min(100, (w.wageredThisWeek / w.minWagered) * 100) : 100;
  const met = w.wageredThisWeek >= w.minWagered;
  const resetIn = nextWeekStart(now) - now;
  return (
    <RewardCard
      testId="reward-weekly"
      icon={<CalendarRange size={17} />}
      eyebrow="Every week"
      title="Weekly bonus"
      amount={w.amount}
      tone={w.available ? 'ready' : w.blockedByExclusion ? 'muted' : 'default'}
      status={
        w.blockedByExclusion && !w.claimed ? (
          <span className="inline-flex items-center gap-1.5">
            <PauseCircle size={13} /> Paused during your break
          </span>
        ) : w.claimed ? (
          <span className="inline-flex items-center gap-1.5">
            <Check size={13} /> Claimed this week · resets in {formatRemaining(resetIn)}
          </span>
        ) : met ? (
          'Target reached — ready to claim'
        ) : (
          `Wager ${formatCredits(w.minWagered - w.wageredThisWeek)} more this week to unlock`
        )
      }
    >
      <div>
        <div className="flex justify-between text-xs">
          <span className="text-fg-subtle">Wagered this week</span>
          <span className="tabular text-fg-muted">
            <span className="font-medium text-fg">{formatCredits(Math.min(w.wageredThisWeek, 10 ** 12))}</span> / {formatCredits(w.minWagered)}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Weekly bonus progress">
          <div className={cn('h-full rounded-full transition-[width] duration-700', met ? 'bg-accent' : 'bg-fg-muted/70')} style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1.5 text-[11px] text-fg-subtle">Week runs Monday–Sunday (UTC) · resets in {formatRemaining(resetIn)}</div>
      </div>
      <Button
        block
        className="mt-4"
        variant={w.available ? 'primary' : 'subtle'}
        disabled={!w.available || claim.busy}
        loading={claim.pending('WEEKLY')}
        onClick={() => claim.run('WEEKLY')}
      >
        {w.claimed ? 'Claimed' : w.blockedByExclusion ? 'Paused' : w.available ? `Claim ${formatCredits(w.amount)}` : 'Keep playing to unlock'}
      </Button>
    </RewardCard>
  );
}

function Milestones({ r, me, claim, paused }: { r: RewardStatus; me: Me; claim: ReturnType<typeof useClaim>; paused: boolean }) {
  const level = me.level.level;
  const claimable = r.levels.filter((l) => l.available).length;
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface-1">
      <div className="flex flex-col gap-3 border-b border-line-soft px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <Trophy size={16} className="text-gold" /> Level milestones
          </h2>
          <p className="mt-0.5 text-[13px] text-fg-muted">One-off rewards as you level up. You earn XP from every Credit wagered — winning is never required.</p>
        </div>
        <div className="flex shrink-0 items-center gap-3 rounded-lg bg-surface-2 px-3 py-2">
          <LevelBadge level={level} size="md" showTier />
          <div className="w-28">
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-4">
              <div className="h-full rounded-full bg-accent" style={{ width: `${me.level.xpForNext ? Math.min(100, (me.level.xpIntoLevel / me.level.xpForNext) * 100) : 100}%` }} />
            </div>
            <div className="tabular mt-1 text-[10.5px] text-fg-subtle">
              {formatCredits(me.level.xpIntoLevel)} / {formatCredits(me.level.xpForNext)} XP
            </div>
          </div>
        </div>
      </div>
      {claimable > 0 ? (
        <div className="border-b border-gold/20 bg-gold-soft px-4 py-2.5 text-[13px] font-medium text-gold sm:px-5">
          {claimable === 1 ? 'A milestone reward is ready to claim.' : `${claimable} milestone rewards are ready to claim.`}
        </div>
      ) : null}
      <ol className="grid gap-px bg-line-soft sm:grid-cols-2 lg:grid-cols-3">
        {r.levels.map((l) => {
          const ready = l.available;
          const blocked = paused && l.reached && !l.claimed;
          return (
            <li
              key={l.level}
              data-testid={`milestone-${l.level}`}
              className={cn('relative flex items-center gap-3.5 bg-surface-1 px-4 py-4 sm:px-5', ready && 'bg-[linear-gradient(180deg,#e2b4560f,transparent)]')}
            >
              {ready ? <span aria-hidden className="pointer-events-none absolute inset-0 shadow-[inset_0_0_0_1px_#e2b45655]" /> : null}
              <div
                className={cn(
                  'flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border',
                  ready ? 'border-gold/60 bg-gold-soft text-gold-bright shadow-glow-gold' : l.claimed ? 'border-line bg-surface-2 text-fg-muted' : 'border-line bg-surface-2 text-fg-subtle',
                )}
              >
                <span className="text-[9px] font-semibold uppercase tracking-wider opacity-80">Lvl</span>
                <span className="tabular -mt-0.5 text-base font-bold leading-none">{l.level}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className={cn('tabular flex items-center gap-1.5 text-[15px] font-semibold', ready ? 'text-gold-bright' : 'text-fg')}>
                  <CreditIcon size={15} /> {formatCredits(l.amount)}
                </div>
                <div className="mt-0.5 text-xs text-fg-subtle">
                  {l.claimed ? 'Claimed' : blocked ? 'Paused during your break' : l.reached ? 'Ready to claim' : `Unlocks at level ${l.level}`}
                </div>
              </div>
              {ready ? (
                <Button size="sm" variant="gold" disabled={claim.busy} loading={claim.pending('LEVEL_UP', l.level)} onClick={() => claim.run('LEVEL_UP', l.level)}>
                  Claim
                </Button>
              ) : l.claimed ? (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-3 text-fg-muted" aria-label="Claimed">
                  <Check size={14} />
                </span>
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-fg-faint" aria-label={blocked ? 'Paused' : 'Locked'}>
                  {blocked ? <PauseCircle size={14} /> : <Lock size={13} />}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function RewardsView({ me }: { me: Me }) {
  const { data: r, isLoading, isError, refetch } = useRewards();
  const now = useNow(1000);
  const claim = useClaim();
  const balance = useBalance((s) => s.balance) ?? me.balance;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[264px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }
  if (isError || !r) return <ErrorState title="Couldn’t load rewards" onRetry={() => void refetch()} />;

  const paused = r.weekly.blockedByExclusion;
  return (
    <div className="space-y-6">
      {paused ? (
        <div className="flex flex-col gap-2 rounded-xl border border-line-strong bg-surface-1 px-4 py-3 text-[13px] text-fg-muted sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <PauseCircle size={15} className="shrink-0 text-fg-subtle" /> Wagering-dependent rewards are paused during your break. Daily Credits and refills stay available.
          </span>
          <Link href="/responsible-play" className="shrink-0 text-[13px] font-medium text-fg hover:underline">
            View your break
          </Link>
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        <Daily r={r} now={now} claim={claim} />
        <Refill r={r} now={now} balance={balance} claim={claim} />
        <Weekly r={r} now={now} claim={claim} />
      </div>
      <Milestones r={r} me={me} claim={claim} paused={paused} />
      <p className="text-center text-xs text-fg-subtle">Rewards are play-money Credits only and have no cash value.</p>
    </div>
  );
}
