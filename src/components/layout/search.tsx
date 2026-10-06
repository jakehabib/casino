'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Popover } from '@/components/ui/popover';
import { GAMES } from '@/lib/games';
import { GAME_ART } from '@/components/brand/game-art';
import { cn } from '@/lib/cn';

export function GameSearch({ className }: { className?: string }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const router = useRouter();
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    return GAMES.filter((g) => !s || g.name.toLowerCase().includes(s) || g.category.toLowerCase().includes(s) || g.tagline.toLowerCase().includes(s));
  }, [q]);
  const go = (href: string) => {
    setOpen(false);
    setQ('');
    router.push(href);
  };
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="start"
      className="w-[min(420px,calc(100vw-24px))] p-1.5"
      trigger={
        <button
          className={cn('flex h-9 w-full max-w-[280px] items-center gap-2 rounded-lg border border-line bg-bg-raised px-3 text-[13px] text-fg-subtle transition-colors hover:border-line-strong hover:text-fg-muted', className)}
          aria-label="Search games"
        >
          <Search size={15} />
          <span>Search games</span>
        </button>
      }
    >
      <div className="flex items-center gap-2 border-b border-line px-2.5 pb-2 pt-1">
        <Search size={15} className="text-fg-subtle" />
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setIdx(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setIdx((i) => Math.min(results.length - 1, i + 1));
            if (e.key === 'ArrowUp') setIdx((i) => Math.max(0, i - 1));
            if (e.key === 'Enter' && results[idx]) go(results[idx].href);
          }}
          placeholder="Blackjack, slots, crash…"
          className="h-8 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-faint"
        />
      </div>
      <div className="max-h-[340px] overflow-y-auto pt-1">
        {results.length === 0 ? (
          <div className="px-3 py-6 text-center text-[13px] text-fg-subtle">No games match “{q}”.</div>
        ) : (
          results.map((g, i) => {
            const Art = GAME_ART[g.id];
            return (
              <button
                key={g.id}
                onMouseEnter={() => setIdx(i)}
                onClick={() => go(g.href)}
                className={cn('flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left', i === idx ? 'bg-surface-3' : 'hover:bg-surface-2')}
              >
                <span className="relative h-10 w-8 shrink-0 overflow-hidden rounded-md border border-line">
                  <Art className="absolute inset-0 h-full w-full" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-fg">{g.name}</span>
                  <span className="block truncate text-xs text-fg-subtle">{g.category} · {g.tagline}</span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </Popover>
  );
}
