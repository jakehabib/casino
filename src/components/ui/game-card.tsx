'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Heart, Play, Users } from 'lucide-react';
import { GAME_ART } from '@/components/brand/game-art';
import type { GameMeta } from '@/lib/games';
import { cn } from '@/lib/cn';
import { SPRING } from '@/lib/motion';

/** GameCard — portrait artwork card with favourite + quick play. */
export function GameCard({
  game,
  favorite,
  onToggleFavorite,
  playersOnline,
  className,
  priority,
}: {
  game: GameMeta;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  playersOnline?: number;
  className?: string;
  priority?: boolean;
}) {
  const Art = GAME_ART[game.id];
  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={SPRING.snappy}
      className={cn('group relative w-full', className)}
      data-testid={`game-card-${game.id}`}
    >
      <Link
        href={game.href}
        prefetch={priority}
        className="relative block aspect-[3/4] overflow-hidden rounded-xl border border-line bg-surface-2 shadow-card outline-none transition-[border,box-shadow] duration-200 group-hover:border-line-strong group-hover:shadow-2 focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Art className="absolute inset-0 h-full w-full transition-transform duration-500 ease-[var(--ease-out-quint)] group-hover:scale-[1.04]" />
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-3">
          <div className="text-2xs font-semibold uppercase tracking-[0.12em] text-white/55">{game.category === 'Originals' ? 'NOVA Original' : game.category}</div>
          <div className="mt-0.5 text-[15px] font-semibold leading-tight tracking-tight text-white">{game.name}</div>
          <div className="mt-0.5 truncate text-xs text-white/55">{game.tagline}</div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-glow-accent">
            <Play size={20} fill="currentColor" className="ml-0.5" />
          </span>
        </div>
        {playersOnline !== undefined && playersOnline > 0 ? (
          <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[10.5px] font-semibold text-white/85 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-win" />
            <Users size={11} />
            {playersOnline}
          </span>
        ) : null}
      </Link>
      {onToggleFavorite ? (
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-label={favorite ? `Remove ${game.name} from favourites` : `Add ${game.name} to favourites`}
          aria-pressed={favorite}
          className={cn(
            'absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 backdrop-blur transition-all duration-150 hover:bg-black/70',
            favorite ? 'text-loss opacity-100' : 'text-white/80 opacity-100 sm:opacity-0 sm:group-hover:opacity-100',
          )}
        >
          <Heart size={15} fill={favorite ? 'currentColor' : 'none'} />
        </button>
      ) : null}
    </motion.div>
  );
}
