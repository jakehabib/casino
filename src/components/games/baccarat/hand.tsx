'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { PlayingCard, CARD_DIMS, type CardSize } from '@/components/ui/playing-card';
import { cn } from '@/lib/cn';
import { EASE } from '@/lib/motion';
import type { DealtCard } from '@/engines/baccarat/types';
import { SIDE_TONE } from './theme';

/**
 * One side of the table (Player or Banker): label, running total and the
 * cards as dealt. Third cards slide in rotated 90°, as on a real table.
 */
export function HandArea({
  side,
  cards,
  revealed,
  total,
  size,
  tight = false,
  natural,
  caption,
  state,
  reduce,
}: {
  side: 'PLAYER' | 'BANKER';
  /** Cards on the table for this side, in deal order, with their global deal index. */
  cards: { card: DealtCard; index: number }[];
  revealed: number;
  total: number | null;
  size: CardSize;
  /** Narrow table: fan the cards more tightly. */
  tight?: boolean;
  natural: boolean;
  caption: string | null;
  state: 'idle' | 'win' | 'lose' | 'tie';
  reduce: boolean;
}) {
  const tone = SIDE_TONE[side];
  const d = CARD_DIMS[size];
  const overlap = Math.round(d.w * (tight ? 0.44 : 0.2));
  // Cards arrive from the shoe (top right of the table).
  const fromX = side === 'PLAYER' ? 260 : 110;

  return (
    <div className="flex min-w-0 flex-col items-center">
      <div className="mb-2.5 flex h-7 items-center gap-2">
        <span className={cn('text-[11px] font-bold uppercase tracking-[0.22em] sm:text-xs', tone.text)}>{tone.label}</span>
        <TotalBadge side={side} total={total} state={state} />
      </div>

      <div className="relative flex items-center justify-center" style={{ height: d.h, minWidth: d.w * 2 - overlap }}>
        <AnimatePresence initial={false}>
          {cards.map(({ card, index }, i) => {
            const faceUp = index < revealed;
            const third = card.third;
            return (
              <motion.div
                key={`${index}-${card.card}`}
                className="relative flex shrink-0 items-center justify-center"
                style={{ width: third ? d.h : d.w, height: d.h, marginLeft: i === 0 ? 0 : third ? -overlap / 2 : -overlap, zIndex: i }}
                initial={reduce ? { opacity: 0 } : { opacity: 0, x: fromX, y: -110, rotate: -14, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, y: 0, rotate: third ? 90 : 0, scale: 1 }}
                exit={{ opacity: 0, y: -24, transition: { duration: 0.2 } }}
                transition={reduce ? { duration: 0.12 } : { duration: 0.42, ease: EASE.outExpo }}
              >
                <PlayingCard
                  code={faceUp ? card.card : null}
                  size={size}
                  highlight={state === 'win' && faceUp ? 'win' : null}
                  dim={state === 'lose' && faceUp}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
        {cards.length === 0 ? <CardSlots size={size} /> : null}
      </div>

      <div className="mt-2.5 flex h-6 items-center">
        <AnimatePresence mode="wait">
          {natural ? (
            <motion.span
              key="natural"
              initial={{ opacity: 0, y: 6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE.out }}
              className="relative overflow-hidden rounded-full px-3 py-[3px] text-[11px] font-bold uppercase tracking-[0.16em] text-white"
              style={{ background: `linear-gradient(180deg, ${tone.hex}, ${tone.hex}b0)`, boxShadow: `0 0 0 1px ${tone.hex}80, 0 6px 22px -6px ${tone.hex}` }}
            >
              Natural {total}
              {!reduce ? (
                <motion.span
                  aria-hidden
                  className="absolute inset-y-0 w-8 -skew-x-12 bg-white/35 blur-[2px]"
                  initial={{ left: '-30%' }}
                  animate={{ left: '130%' }}
                  transition={{ duration: 0.9, delay: 0.15, ease: EASE.inOut }}
                />
              ) : null}
            </motion.span>
          ) : caption ? (
            <motion.span
              key="caption"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className={cn('rounded-full border bg-black/30 px-2.5 py-[3px] text-[11px] font-semibold tracking-wide backdrop-blur-sm', tone.border, tone.text)}
            >
              {caption}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

function TotalBadge({ side, total, state }: { side: 'PLAYER' | 'BANKER'; total: number | null; state: 'idle' | 'win' | 'lose' | 'tie' }) {
  const tone = SIDE_TONE[side];
  const active = total !== null;
  return (
    <motion.span
      key={total ?? 'none'}
      initial={active ? { scale: 0.7, opacity: 0.4 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 520, damping: 26 }}
      className={cn(
        'tabular flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-sm font-bold transition-[background,box-shadow,color] duration-300',
        !active && 'bg-black/25 text-white/25 ring-1 ring-white/10',
        active && state !== 'win' && 'bg-black/40 text-white ring-1 ring-white/15',
        state === 'win' && 'text-white',
        state === 'lose' && 'text-white/60',
      )}
      style={state === 'win' ? { background: tone.hex, boxShadow: `0 0 0 3px ${tone.hex}33, 0 0 22px -2px ${tone.hex}` } : undefined}
      aria-label={`${tone.label} total ${total ?? 'none'}`}
    >
      {total ?? '–'}
    </motion.span>
  );
}

function CardSlots({ size }: { size: CardSize }) {
  const d = CARD_DIMS[size];
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-2" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i} className="rounded-[9%/6.5%] border border-dashed border-white/[0.09]" style={{ width: d.w, height: d.h }} />
      ))}
    </div>
  );
}
