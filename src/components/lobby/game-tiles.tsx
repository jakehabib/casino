'use client';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { GAME_ART } from '@/components/brand/game-art';
import type { GameMeta } from '@/lib/games';

/** Wide tile used for category sections (table games / slots). */
export function GameTile({ game, facts, players }: { game: GameMeta; facts: string[]; players?: number }) {
  const Art = GAME_ART[game.id];
  return (
    <Link
      href={game.href}
      className="group relative flex min-h-[180px] overflow-hidden rounded-xl border border-line bg-surface-1 transition-[border,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong"
      data-testid={`game-tile-${game.id}`}
    >
      <Art wide className="absolute inset-0 h-full w-full transition-transform duration-500 group-hover:scale-[1.03]" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/0" />
      <div className="relative flex flex-1 flex-col justify-between p-4 sm:p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-lg font-semibold tracking-tight text-white">{game.name}</div>
            <div className="mt-0.5 max-w-[260px] text-[13px] leading-snug text-white/65">{game.description}</div>
          </div>
          <ArrowUpRight size={18} className="text-white/40 transition-colors group-hover:text-white" />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {facts.map((f) => (
            <span key={f} className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/80 backdrop-blur">
              {f}
            </span>
          ))}
          {players ? (
            <span className="flex items-center gap-1 rounded-md bg-black/40 px-2 py-0.5 text-[11px] font-medium text-white/80">
              <span className="h-1.5 w-1.5 rounded-full bg-win" /> {players} playing
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export const GAME_FACTS: Record<string, string[]> = {
  blackjack: ['3:2 Blackjack', 'S17', 'Double after split', 'Insurance'],
  baccarat: ['8 decks', 'Banker 5% commission', 'Tie 8:1', 'Bead plate'],
  roulette: ['Single zero', '2.70% edge', 'All inside bets'],
  crash: ['Multiplayer', 'Auto cash-out', '99% RTP'],
  'gilded-vault': ['20 paylines', 'Free spins', 'Expanding wilds', '96.1% RTP'],
  overcharge: ['1,024 ways', 'Cascades', 'Up to 10× chain', '96.0% RTP'],
  'starforged-relics': ['Cluster pays', 'Random modifiers', 'Upgrading bonus', '96.2% RTP'],
};
