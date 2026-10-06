'use client';
import Link from 'next/link';
import { Ban, CalendarDays, Eye, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { ApiError } from '@/lib/api';
import { formatMultiplier } from '@/lib/format';
import { useChatActions } from '@/components/chat/moderation';
import { usePublicProfile } from './use-profile';
import { formatMonthYear } from './player-card';
import { Credits, FavoriteGameCard, HiddenStat, MetaChip, PrivacyNotice, ProfileHero, SectionTitle } from './profile-parts';

const n = (v: number) => v.toLocaleString('en-US');

export function PublicProfileView({ username }: { username: string }) {
  const q = usePublicProfile(username);
  const actions = useChatActions();
  if (q.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[150px] rounded-2xl" />
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-[84px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }
  if (q.error instanceof ApiError && q.error.code === 'NOT_FOUND') {
    return (
      <EmptyState
        icon={<UserRound size={18} />}
        title="Player not found"
        body={`There’s no player called @${username}.`}
        action={
          <Link href="/casino">
            <Button size="sm" variant="secondary">
              Back to the casino
            </Button>
          </Link>
        }
        className="rounded-2xl border border-line bg-surface-1 py-16"
      />
    );
  }
  if (q.error || !q.data) return <ErrorState title="Couldn’t load this profile" onRetry={() => void q.refetch()} />;

  const p = q.data;
  const s = p.stats;
  const hidden = new Set([...s.hidden, ...(s.derivedHidden ?? [])]);
  const target = { id: p.user.id, username: p.user.username, displayName: p.user.displayName };
  const canBlock = !!p.viewer && !p.isSelf && p.user.role === 'USER';

  const money = (key: 'totalWagered' | 'totalWon' | 'netResult', label: string) => {
    if (hidden.has(key)) return <HiddenStat key={key} label={label} reason={s.hidden.includes(key) ? 'Hidden by player' : 'Hidden to protect a private stat'} />;
    const v = s[key] ?? 0;
    return (
      <StatCard
        key={key}
        label={label}
        value={<Credits value={v} sign={key === 'netResult'} />}
        tone={key === 'netResult' ? (v > 0 ? 'win' : v < 0 ? 'loss' : 'default') : 'default'}
      />
    );
  };

  return (
    <div className="@container space-y-6" data-testid="public-profile">
      {p.isSelf ? (
        <div className="flex flex-col gap-2 rounded-xl border border-accent/25 bg-accent-soft px-4 py-3 text-[13px] sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2 text-fg-muted">
            <Eye size={15} className="text-accent" />
            This is how other players see your profile.
          </span>
          <Link href="/settings#privacy" className="font-medium text-accent hover:text-accent-hover">
            Privacy settings
          </Link>
        </div>
      ) : null}

      <ProfileHero
        user={p.user}
        tier={p.user.tier}
        meta={s.joinedAt ? <MetaChip icon={<CalendarDays size={13} />}>Joined {formatMonthYear(s.joinedAt)}</MetaChip> : null}
        actions={
          canBlock ? (
            <Button
              variant={p.viewer?.blocked ? 'secondary' : 'ghost'}
              size="sm"
              leftIcon={<Ban size={15} />}
              onClick={() => void actions.block(target, !p.viewer?.blocked)}
              data-testid="block-toggle"
            >
              {p.viewer?.blocked ? 'Unblock' : 'Block'}
            </Button>
          ) : p.isSelf ? (
            <Link href="/profile">
              <Button variant="secondary" size="sm">
                Your full stats
              </Button>
            </Link>
          ) : null
        }
      />

      {p.privacy === 'PRIVATE' ? (
        <PrivacyNotice kind="PRIVATE" self={p.isSelf} />
      ) : (
        <>
          <section>
            <SectionTitle title="Overview" />
            <div className="grid grid-cols-2 gap-2.5 @2xl:grid-cols-3">
              <StatCard label="Games played" value={n(s.gamesPlayed ?? 0)} />
              <StatCard label="Member since" value={s.joinedAt ? formatMonthYear(s.joinedAt) : '—'} />
              {p.privacy === 'PUBLIC' ? (
                <>
                  {hidden.has('largestWin') ? (
                    <HiddenStat label="Biggest win" />
                  ) : (
                    <StatCard label="Biggest win" value={s.largestWin ? <Credits value={s.largestWin.amount} /> : '—'} sub={s.largestWin?.game ?? undefined} tone={s.largestWin ? 'default' : 'muted'} />
                  )}
                  {money('totalWagered', 'Total wagered')}
                  {money('totalWon', 'Total won')}
                  {money('netResult', 'Net result')}
                </>
              ) : null}
            </div>
          </section>

          {p.privacy === 'LIMITED' ? (
            <PrivacyNotice kind="LIMITED" self={p.isSelf} />
          ) : (
            <>
              {s.favoriteGame ? (
                <section className="max-w-md">
                  <FavoriteGameCard game={s.favoriteGame} />
                </section>
              ) : null}
              {s.highlights ? (
                <section>
                  <SectionTitle title="Highlights" />
                  <div className="grid grid-cols-2 gap-2.5 @2xl:grid-cols-4">
                    <StatCard label="Blackjack hands" value={n(s.highlights.blackjackHands)} sub={`${n(s.highlights.blackjacks)} ${s.highlights.blackjacks === 1 ? 'blackjack' : 'blackjacks'}`} />
                    <StatCard label="Baccarat hands" value={n(s.highlights.baccaratHands)} />
                    <StatCard label="Roulette spins" value={n(s.highlights.rouletteSpins)} />
                    <StatCard label="Launch rounds" value={n(s.highlights.crashRounds)} sub={s.highlights.crashHighestCashout ? `Best ${formatMultiplier(s.highlights.crashHighestCashout)}` : undefined} />
                    <StatCard label="Slot spins" value={n(s.highlights.slotSpins)} />
                  </div>
                </section>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
