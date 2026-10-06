'use client';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { CalendarDays, ChevronRight, Clock, Eye, Globe2, HeartHandshake, History, Lock, Settings, ShieldCheck, Wallet, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { Tabs, TabPanel } from '@/components/ui/tabs';
import { HistoryRow } from '@/components/ui/history-row';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { formatCredits, formatDate, formatMultiplier, timeAgo } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useOwnProfile, type OwnProfile } from './use-profile';
import { Credits, FavoriteGameCard, MetaChip, ProfileHero, SectionTitle, XpProgress } from './profile-parts';

const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—');
const n = (v: number) => v.toLocaleString('en-US');

const PRIVACY_META = {
  PUBLIC: { icon: <Globe2 size={13} />, label: 'Public profile' },
  LIMITED: { icon: <EyeOff size={13} />, label: 'Limited profile' },
  PRIVATE: { icon: <Lock size={13} />, label: 'Private profile' },
} as const;

function Split({ parts }: { parts: { label: string; value: number; className: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div className="rounded-xl border border-line bg-surface-1 p-4">
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-4">
        {total > 0 ? parts.map((p) => <div key={p.label} className={p.className} style={{ width: `${(p.value / total) * 100}%` }} />) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5 text-fg-muted">
            <span className={cn('h-2 w-2 rounded-full', p.className)} />
            {p.label}
            <span className="tabular font-semibold text-fg">{total ? pct(p.value, total) : '—'}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function GameStats({ p }: { p: OwnProfile }) {
  const favKey = p.general.favoriteGame?.key;
  const [tab, setTab] = useState(favKey ? (favKey === 'CRASH' ? 'crash' : favKey.toLowerCase()) : 'blackjack');
  const grid = 'mt-3 grid grid-cols-2 gap-2.5 @2xl:grid-cols-3';
  const play = (href: string, label: string) => (
    <Link href={href} className="inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:text-accent-hover">
      Play {label} <ChevronRight size={14} />
    </Link>
  );
  const maxSlot = Math.max(1, ...p.slots.bySlot.map((s) => s.spins));
  const panes: Record<string, ReactNode> = {
    blackjack: (
      <>
        <div className={grid}>
          <StatCard label="Hands played" value={n(p.blackjack.hands)} />
          <StatCard label="Wins" value={n(p.blackjack.wins)} sub={`${pct(p.blackjack.wins, p.blackjack.hands)} of hands`} />
          <StatCard label="Losses" value={n(p.blackjack.losses)} sub={`${pct(p.blackjack.losses, p.blackjack.hands)} of hands`} />
          <StatCard label="Pushes" value={n(p.blackjack.pushes)} />
          <StatCard label="Blackjacks" value={n(p.blackjack.blackjacks)} sub={`${pct(p.blackjack.blackjacks, p.blackjack.hands)} of hands`} />
          <StatCard label="Largest blackjack win" value={<Credits value={p.blackjack.largestBlackjackWin} />} />
        </div>
        <div className="mt-3">{play('/casino/blackjack', 'Blackjack')}</div>
      </>
    ),
    baccarat: (
      <>
        <div className={grid}>
          <StatCard label="Hands played" value={n(p.baccarat.hands)} />
          <StatCard label="Player wins" value={n(p.baccarat.playerWins)} />
          <StatCard label="Banker wins" value={n(p.baccarat.bankerWins)} />
          <StatCard label="Ties" value={n(p.baccarat.ties)} />
        </div>
        <div className="mt-2.5">
          <Split
            parts={[
              { label: 'Player', value: p.baccarat.playerWins, className: 'bg-info' },
              { label: 'Banker', value: p.baccarat.bankerWins, className: 'bg-loss' },
              { label: 'Tie', value: p.baccarat.ties, className: 'bg-win' },
            ]}
          />
        </div>
        <div className="mt-3">{play('/casino/baccarat', 'Baccarat')}</div>
      </>
    ),
    roulette: (
      <>
        <div className={grid}>
          <StatCard label="Spins" value={n(p.roulette.spins)} />
          <StatCard label="Largest win" value={<Credits value={p.roulette.largestWin} />} />
        </div>
        <div className="mt-3">{play('/casino/roulette', 'Roulette')}</div>
      </>
    ),
    crash: (
      <>
        <div className={grid}>
          <StatCard label="Rounds played" value={n(p.crash.rounds)} />
          <StatCard label="Highest cashout" value={p.crash.highestCashout ? formatMultiplier(p.crash.highestCashout) : '—'} tone={p.crash.highestCashout >= 1000 ? 'gold' : 'default'} />
          <StatCard label="Largest win" value={<Credits value={p.crash.largestWin} />} />
        </div>
        <div className="mt-3">{play('/casino/crash', 'Launch')}</div>
      </>
    ),
    slots: (
      <>
        <div className={grid}>
          <StatCard label="Total spins" value={n(p.slots.spins)} />
          <StatCard label="Largest slot win" value={<Credits value={p.slots.largestWin} />} />
          <StatCard label="Favourite slot" value={p.slots.favoriteSlot?.name ?? '—'} sub={p.slots.favoriteSlot ? `${n(p.slots.favoriteSlot.plays)} spins` : 'No spins yet'} />
        </div>
        <div className="mt-2.5 space-y-2.5 rounded-xl border border-line bg-surface-1 p-4">
          {p.slots.bySlot.map((s) => (
            <div key={s.id} className="flex items-center gap-3 text-[13px]">
              <span className="w-32 shrink-0 truncate text-fg-muted">{s.name}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-4">
                <span className="block h-full rounded-full bg-accent/80" style={{ width: `${(s.spins / maxSlot) * 100}%` }} />
              </span>
              <span className="tabular w-14 shrink-0 text-right font-medium text-fg">{n(s.spins)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3">{play('/casino/slots', 'Slots')}</div>
      </>
    ),
  };
  return (
    <section>
      <SectionTitle title="Game stats" sub="Lifetime results for each game." />
      <Tabs
        value={tab}
        onValueChange={setTab}
        listClassName="w-full sm:w-auto"
        items={[
          { value: 'blackjack', label: 'Blackjack' },
          { value: 'baccarat', label: 'Baccarat' },
          { value: 'roulette', label: 'Roulette' },
          { value: 'crash', label: 'Crash' },
          { value: 'slots', label: 'Slots' },
        ]}
      >
        {Object.entries(panes).map(([k, v]) => (
          <TabPanel key={k} value={k} className="outline-none">
            {v}
          </TabPanel>
        ))}
      </Tabs>
    </section>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-[210px] rounded-2xl" />
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[84px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-[260px] rounded-2xl" />
    </div>
  );
}

function LinkRow({ href, icon, title, sub }: { href: string; icon: ReactNode; title: string; sub: string }) {
  return (
    <Link href={href} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-fg-muted">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium text-fg">{title}</span>
        <span className="block truncate text-xs text-fg-subtle">{sub}</span>
      </span>
      <ChevronRight size={15} className="text-fg-faint transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export function OwnProfileView() {
  const q = useOwnProfile();
  if (q.isLoading) return <ProfileSkeleton />;
  if (q.error || !q.data) return <ErrorState title="Couldn’t load your profile" onRetry={() => void q.refetch()} />;
  const p = q.data;
  const g = p.general;
  const priv = PRIVACY_META[p.privacy.privacy];

  return (
    <div className="@container space-y-6" data-testid="own-profile">
      <ProfileHero
        user={{ ...p.user, level: p.level.level }}
        tier={p.level.tier}
        meta={
          <>
            <MetaChip icon={<CalendarDays size={13} />}>Member since {formatDate(p.user.createdAt)}</MetaChip>
            <MetaChip icon={<Clock size={13} />}>Active {timeAgo(p.user.lastActiveAt)}</MetaChip>
            <MetaChip icon={priv.icon} href="/settings#privacy">
              {priv.label}
            </MetaChip>
          </>
        }
        actions={
          <>
            <Link href={`/u/${p.user.username}`}>
              <Button variant="ghost" size="sm" leftIcon={<Eye size={15} />}>
                Public view
              </Button>
            </Link>
            <Link href="/settings">
              <Button variant="secondary" size="sm" leftIcon={<Settings size={15} />}>
                Edit profile
              </Button>
            </Link>
          </>
        }
      >
        <XpProgress level={p.level.level} xpIntoLevel={p.level.xpIntoLevel} xpForNext={p.level.xpForNext} lifetimeXp={p.level.lifetimeXp} />
      </ProfileHero>

      <div className="grid gap-6 @4xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <section>
            <SectionTitle title="Overview" sub="Across every game on NOVA." />
            <div className="grid grid-cols-2 gap-2.5 @2xl:grid-cols-3">
              <StatCard label="Games played" value={n(g.gamesPlayed)} />
              <StatCard label="Total wagered" value={<Credits value={g.totalWagered} />} />
              <StatCard label="Total won" value={<Credits value={g.totalWon} />} />
              <StatCard label="Net result" value={<Credits value={g.netResult} sign />} tone={g.netResult > 0 ? 'win' : g.netResult < 0 ? 'loss' : 'default'} sub="Play money — no cash value" />
              <StatCard label="Largest win" value={g.largestWin ? <Credits value={g.largestWin.amount} /> : '—'} sub={g.largestWin?.game ?? 'Single-round payout'} />
              <FavoriteGameCard game={g.favoriteGame} />
            </div>
          </section>

          <GameStats p={p} />

          <section>
            <SectionTitle
              title="Recent games"
              action={
                <Link href="/history" className="inline-flex items-center gap-1 text-[13px] font-medium text-fg-muted hover:text-fg">
                  Full history <ChevronRight size={14} />
                </Link>
              }
            />
            <div className="overflow-hidden rounded-2xl border border-line bg-surface-1">
              {p.recent.length ? (
                <>
                  <div className="hidden grid-cols-[150px_1fr_110px_110px_110px_16px] gap-3 border-b border-line px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-fg-subtle sm:grid">
                    <span>Time</span>
                    <span>Game</span>
                    <span className="text-right">Wager</span>
                    <span className="text-right">Payout</span>
                    <span className="text-right">Net</span>
                    <span />
                  </div>
                  {p.recent.map((r) => (
                    <HistoryRow key={r.id} time={r.createdAt} title={r.gameName} detail={r.summary} wager={r.wager} payout={r.payout} net={r.net} />
                  ))}
                </>
              ) : (
                <EmptyState
                  icon={<History size={18} />}
                  title="No games yet"
                  body="Your last ten rounds will show up here."
                  action={
                    <Link href="/casino">
                      <Button size="sm">Browse games</Button>
                    </Link>
                  }
                />
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-line bg-surface-1">
            <div className="border-b border-line px-4 py-3 text-2xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">Account</div>
            <div className="divide-y divide-line-soft">
              <LinkRow href="/settings" icon={<Settings size={16} />} title="Settings" sub="Username, avatar, privacy, sound" />
              <LinkRow href="/settings#privacy" icon={<ShieldCheck size={16} />} title="Privacy" sub={`${priv.label} · choose what others see`} />
              <LinkRow href="/wallet" icon={<Wallet size={16} />} title="Wallet" sub="Balance and transactions" />
              <LinkRow href="/responsible-play" icon={<HeartHandshake size={16} />} title="Responsible play" sub="Limits, breaks and self-exclusion" />
            </div>
          </div>
          <p className="px-1 text-xs leading-relaxed text-fg-subtle">Credits are play money. They can’t be purchased, withdrawn or exchanged for anything of value.</p>
        </aside>
      </div>
    </div>
  );
}
