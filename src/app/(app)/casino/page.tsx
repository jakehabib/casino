'use client';
import { useState } from 'react';
import { GameCard } from '@/components/ui/game-card';
import { GameTile, GAME_FACTS } from '@/components/lobby/game-tiles';
import { LobbySection } from '@/components/lobby/section';
import { useFavorites } from '@/components/lobby/use-favorites';
import { usePresenceDetail } from '@/hooks/use-socket';
import { GAMES } from '@/lib/games';
import { Tabs } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/states';
import { Heart } from 'lucide-react';

const FILTERS = [
  { value: 'all', label: 'All games' },
  { value: 'Table', label: 'Table' },
  { value: 'Slots', label: 'Slots' },
  { value: 'Originals', label: 'Originals' },
  { value: 'favorites', label: 'Favourites' },
];

export default function CasinoPage() {
  const [filter, setFilter] = useState('all');
  const fav = useFavorites();
  const presence = usePresenceDetail();
  const players = (id: string) => presence?.games?.[id];

  const grid =
    filter === 'favorites'
      ? GAMES.filter((g) => fav.isFavorite(g.id))
      : filter === 'all'
        ? GAMES
        : GAMES.filter((g) => g.category === filter);

  return (
    <div className="mx-auto max-w-[1240px] px-4 pt-6 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Casino</h1>
          <p className="mt-1 text-sm text-fg-muted">A focused library: every game here is built to the same standard.</p>
        </div>
        <Tabs items={FILTERS} value={filter} onValueChange={setFilter} />
      </div>

      {filter === 'all' ? (
        <>
          <LobbySection title="Table games" subtitle="Real multi-deck shoes, exact rules.">
            <div className="grid gap-3 md:grid-cols-3">
              {GAMES.filter((g) => g.category === 'Table').map((g) => (
                <GameTile key={g.id} game={g} facts={GAME_FACTS[g.id]} players={players(g.id)} />
              ))}
            </div>
          </LobbySection>
          <LobbySection title="Slots" subtitle="Three engines, three identities.">
            <div className="grid gap-3 md:grid-cols-3">
              {GAMES.filter((g) => g.category === 'Slots').map((g) => (
                <GameTile key={g.id} game={g} facts={GAME_FACTS[g.id]} players={players(g.id)} />
              ))}
            </div>
          </LobbySection>
          <LobbySection title="Originals" subtitle="Live, multiplayer, built in-house.">
            <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
              {GAMES.filter((g) => g.category === 'Originals').map((g) => (
                <GameTile key={g.id} game={g} facts={GAME_FACTS[g.id]} players={players(g.id)} />
              ))}
              <div className="hidden rounded-xl border border-dashed border-line p-5 text-[13px] text-fg-subtle md:flex md:items-center">
                More originals are in the workshop. We only ship a game when it’s ready.
              </div>
            </div>
          </LobbySection>
        </>
      ) : (
        <div className="mt-8">
          {grid.length === 0 ? (
            <EmptyState icon={<Heart size={18} />} title="No favourites yet" body="Tap the heart on any game to pin it here." />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {grid.map((g) => (
                <GameCard key={g.id} game={g} favorite={fav.isFavorite(g.id)} onToggleFavorite={() => fav.toggle(g.id)} playersOnline={players(g.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
