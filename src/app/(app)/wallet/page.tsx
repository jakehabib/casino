'use client';
import Link from 'next/link';
import { ChevronRight, Gift, HeartHandshake, History, Info, Wallet } from 'lucide-react';
import { PageContainer, PageHeader, RequireAuth } from '@/components/wallet/page-frame';
import { Ledger } from '@/components/wallet/ledger';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { CreditIcon } from '@/components/ui/credit-icon';
import { Skeleton } from '@/components/ui/skeleton';
import { useDisplayBalance } from '@/stores/balance-store';
import { useRewards, useNow } from '@/components/layout/rewards-popover';
import { useRpSummary } from '@/components/responsible-play/use-rp';
import { formatCredits, formatDuration } from '@/lib/format';
import { BRAND } from '@/lib/branding';
import { cn } from '@/lib/cn';

function QuickLink({ href, icon, title, sub, highlight, testId }: { href: string; icon: React.ReactNode; title: string; sub: React.ReactNode; highlight?: boolean; testId?: string }) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className="group flex items-center gap-3 rounded-xl border border-line bg-surface-1 px-3.5 py-3 transition-colors hover:border-line-strong hover:bg-surface-2"
    >
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', highlight ? 'bg-gold-soft text-gold' : 'bg-surface-3 text-fg-muted')}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-fg">{title}</span>
        <span className="block truncate text-xs text-fg-subtle">{sub}</span>
      </span>
      <ChevronRight size={15} className="shrink-0 text-fg-faint transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function Hero() {
  const balance = useDisplayBalance();
  const rewards = useRewards();
  const rp = useRpSummary();
  const now = useNow(30_000);
  const r = rewards.data;
  const rewardReady = !!(r && (r.daily.available || r.refill.available || r.weekly.available || r.levels.some((l) => l.available)));
  const rewardSub = !r
    ? 'Daily Credits, refills and milestones'
    : r.daily.available
      ? `Daily ${formatCredits(r.daily.amount)} Credits ready to claim`
      : rewardReady
        ? 'A reward is ready to claim'
        : `Next daily Credits in ${formatDuration(new Date(r.daily.nextAt).getTime() - now)}`;
  const rpSub = !rp.data
    ? 'Limits, breaks and self-exclusion'
    : rp.data.exclusion
      ? `${rp.data.exclusion.label} active`
      : rp.data.limits.dailyWager.limit !== null || rp.data.limits.dailyLoss.limit !== null
        ? `Limits on · ${formatCredits(rp.data.today.wagered)} wagered today`
        : 'No daily limits set';

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <section className="relative overflow-hidden rounded-2xl border border-line bg-surface-1 p-5 sm:p-7">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative">
          <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">Balance</div>
          <div className="mt-2 flex items-center gap-3">
            <CreditIcon size={34} />
            {balance === null ? (
              <Skeleton className="h-10 w-48" />
            ) : (
              <AnimatedNumber value={balance} className="tabular text-[40px] font-semibold leading-none tracking-tight text-fg sm:text-[46px]" />
            )}
          </div>
          <div className="mt-1.5 text-sm text-fg-muted">{BRAND.currency} · play money</div>
          <div className="mt-6 flex gap-2.5 rounded-lg border border-line bg-bg-raised/70 p-3 text-xs leading-relaxed text-fg-muted">
            <Info size={14} className="mt-px shrink-0 text-fg-subtle" />
            <p>
              Credits are virtual play money with no monetary value. They can’t be bought, withdrawn, redeemed, transferred or exchanged for anything of value.
            </p>
          </div>
        </div>
      </section>
      <div className="grid content-start gap-2.5">
        <QuickLink href="/rewards" icon={<Gift size={17} />} title="Rewards" sub={rewardSub} highlight={rewardReady} testId="wallet-rewards" />
        <QuickLink href="/responsible-play" icon={<HeartHandshake size={17} />} title="Responsible play" sub={rpSub} testId="wallet-rp" />
        <QuickLink href="/history" icon={<History size={17} />} title="Game history" sub="Every round, with provably fair details" />
      </div>
    </div>
  );
}

export default function WalletPage() {
  return (
    <PageContainer>
      <PageHeader icon={<Wallet size={20} />} eyebrow="Your account" title="Wallet" description="Your Credits balance and a complete, append-only record of every movement." />
      <RequireAuth title="your wallet">
        {() => (
          <div className="space-y-6">
            <Hero />
            <Ledger />
          </div>
        )}
      </RequireAuth>
    </PageContainer>
  );
}
