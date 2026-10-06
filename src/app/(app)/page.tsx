'use client';
import Link from 'next/link';
import { Clock, Flame, Sparkles } from 'lucide-react';
import { FeaturedGame } from '@/components/lobby/featured';
import { LobbySection, CardRow } from '@/components/lobby/section';
import { GameCard } from '@/components/ui/game-card';
import { GameTile, GAME_FACTS } from '@/components/lobby/game-tiles';
import { useFavorites, useRecentGames } from '@/components/lobby/use-favorites';
import { usePresenceDetail } from '@/hooks/use-socket';
import { useMe } from '@/hooks/use-me';
import { GAMES, gameById } from '@/lib/games';
import { Button } from '@/components/ui/button';
import { LevelProgress } from '@/components/layout/account-menu';
import { CreditIcon } from '@/components/ui/credit-icon';
import { formatCredits } from '@/lib/format';
import { useRewards, useClaimReward } from '@/components/layout/rewards-popover';
import { GAME_ART } from '@/components/brand/game-art';

function RecentArt({ id }: { id: string }) {
  const Art = GAME_ART[id];
  return <Art className="absolute inset-0 h-full w-full" />;
}

function WelcomePanel() {
  const { data: me } = useMe();
  const rewards = useRewards(!!me);
  const claim = useClaimReward();
  if (!me) {
    return (
      <div className="flex h-full flex-col justify-between rounded-2xl border border-line bg-surface-1 p-5 sm:p-6">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">Welcome to NOVA</div>
          <div className="mt-2 text-xl font-semibold tracking-tight">Start with 100,000 Credits</div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">Free play money for every game. Credits can’t be bought or cashed out — just played.</p>
        </div>
        <div className="mt-5 flex gap-2">
          <Link href="/register" className="flex-1">
            <Button block>Create account</Button>
          </Link>
          <Link href="/login" className="flex-1">
            <Button block variant="secondary">Sign in</Button>
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col justify-between rounded-2xl border border-line bg-surface-1 p-5 sm:p-6">
      <div>
        <div className="text-2xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">Welcome back</div>
        <div className="mt-1.5 truncate text-xl font-semibold tracking-tight">{me.user.displayName}</div>
        <div className="mt-3 flex items-center gap-2 text-sm text-fg-muted">
          <CreditIcon size={16} />
          <span className="tabular font-semibold text-fg">{formatCredits(me.balance)}</span> Credits
        </div>
        <LevelProgress me={me} className="mt-4" />
      </div>
      {rewards.data?.daily.available ? (
        <Button variant="gold" block className="mt-5" loading={claim.isPending} onClick={() => claim.mutate({ type: 'DAILY' })}>
          Claim {formatCredits(rewards.data.daily.amount)} daily Credits
        </Button>
      ) : (
        <Link href="/rewards" className="mt-5">
          <Button variant="secondary" block>
            View rewards
          </Button>
        </Link>
      )}
    </div>
  );
}

export default function HomePage() {
  const fav = useFavorites();
  const presence = usePresenceDetail();
  const recent = useRecentGames();
  const recentGames = (recent.data?.games ?? []).map((id) => gameById(id)).filter(Boolean) as typeof GAMES;
  const popular = [...GAMES].sort((a, b) => (presence?.games?.[b.id] ?? 0) - (presence?.games?.[a.id] ?? 0));

  return (
    <div className="mx-auto max-w-[1240px] px-4 pt-5 sm:px-6 sm:pt-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <FeaturedGame />
        <WelcomePanel />
      </div>

      {recentGames.length ? (
        <LobbySection title="Recently played" icon={<Clock size={16} className="text-fg-subtle" />}>
          <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
            {recentGames.slice(0, 6).map((g) => (
              <Link key={g.id} href={g.href} className="flex shrink-0 items-center gap-2.5 rounded-xl border border-line bg-surface-1 py-2 pl-2 pr-4 transition-colors hover:border-line-strong hover:bg-surface-2">
                <span className="relative h-10 w-8 overflow-hidden rounded-md">
                  <RecentArt id={g.id} />
                </span>
                <span>
                  <span className="block text-[13px] font-semibold">{g.name}</span>
                  <span className="block text-[11px] text-fg-subtle">{g.category}</span>
                </span>
              </Link>
            ))}
          </div>
        </LobbySection>
      ) : null}

      <LobbySection title="Popular now" subtitle="Seven games, built properly." icon={<Flame size={16} className="text-fg-subtle" />} href="/casino">
        <CardRow>
          {popular.map((g, i) => (
            <div key={g.id} className="w-[42vw] max-w-[188px] shrink-0 snap-start sm:w-[176px]">
              <GameCard game={g} favorite={fav.isFavorite(g.id)} onToggleFavorite={() => fav.toggle(g.id)} playersOnline={presence?.games?.[g.id]} priority={i < 4} />
            </div>
          ))}
        </CardRow>
      </LobbySection>

      <LobbySection title="Slots spotlight" subtitle="Three machines. Three different ways to win." icon={<Sparkles size={16} className="text-fg-subtle" />} href="/casino/slots">
        <div className="grid gap-3 md:grid-cols-3">
          {GAMES.filter((g) => g.category === 'Slots').map((g) => (
            <GameTile key={g.id} game={g} facts={GAME_FACTS[g.id]} players={presence?.games?.[g.id]} />
          ))}
        </div>
      </LobbySection>
    </div>
  );
}
