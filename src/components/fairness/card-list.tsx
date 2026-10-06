'use client';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

const SUIT: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

export function MiniCard({ code, active, index, dim }: { code: string; active?: boolean; index?: number; dim?: boolean }) {
  const red = code[1] === 'H' || code[1] === 'D';
  const rank = code[0] === 'T' ? '10' : code[0];
  return (
    <span
      title={index !== undefined ? `#${index} · ${rank}${SUIT[code[1]]}` : undefined}
      className={cn(
        'tabular inline-flex h-[30px] w-[26px] shrink-0 flex-col items-center justify-center rounded-[4px] bg-[#f4f2ec] text-[11px] font-bold leading-[1.05]',
        red ? 'text-[#c62f3d]' : 'text-[#16181d]',
        active && 'ring-2 ring-accent ring-offset-1 ring-offset-surface-1',
        dim && 'opacity-35',
      )}
    >
      <span>{rank}</span>
      <span className="text-[10px]">{SUIT[code[1]]}</span>
    </span>
  );
}

/**
 * The full shoe order as compact cards. Positions [from, to) — the round's
 * dealt cards — are highlighted and scrolled into view.
 */
export function ShoeList({ cards, from, to }: { cards: string[]; from?: number; to?: number }) {
  const hasRange = from !== undefined && to !== undefined && to > from && from >= 0;
  const [showAll, setShowAll] = useState(!hasRange);
  const firstRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (showAll && hasRange) firstRef.current?.scrollIntoView({ block: 'nearest' });
  }, [showAll, hasRange, from]);

  return (
    <div className="space-y-3">
      {hasRange ? (
        <div>
          <div className="mb-2 text-xs font-medium text-fg-subtle">
            This round · positions {from}–{to! - 1} (in deal order)
          </div>
          <div className="flex flex-wrap gap-1.5" data-testid="round-cards">
            {cards.slice(from, to).map((c, i) => (
              <span key={i} className="flex flex-col items-center gap-1">
                <MiniCard code={c} active />
                <span className="tabular text-[10px] text-fg-faint">#{from! + i}</span>
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-fg-subtle">Full shoe · {cards.length} cards</span>
          {hasRange ? (
            <button type="button" className="font-medium text-fg-muted hover:text-fg" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Hide full shoe' : 'Show full shoe'}
            </button>
          ) : null}
        </div>
        {showAll ? (
          <div className="max-h-[280px] overflow-y-auto rounded-lg border border-line bg-bg-raised p-2.5" data-testid="shoe-cards">
            <div className="flex flex-wrap gap-1">
              {cards.map((c, i) => {
                const inRange = hasRange && i >= from! && i < to!;
                return (
                  <span key={i} ref={hasRange && i === from ? firstRef : undefined}>
                    <MiniCard code={c} index={i} active={inRange} dim={hasRange && !inRange} />
                  </span>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
