'use client';
import { createContext, useContext, useLayoutEffect, useRef, type RefObject } from 'react';
import { animate, AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { PlayingCard, CARD_DIMS, type CardSize } from '@/components/ui/playing-card';
import { ChipStackView } from '@/components/ui/casino-chip';
import { formatCredits } from '@/lib/format';
import { cn } from '@/lib/cn';
import { DUR, EASE, SPRING } from '@/lib/motion';
import { formatTotal } from '@/engines/blackjack/view';
import type { HandView, ViewCard } from '@/engines/blackjack/view';

/** Where cards fly in from (the shoe graphic). */
export const ShoeAnchor = createContext<RefObject<HTMLDivElement | null> | null>(null);

/** Deterministic tiny tilt per card so stacks look hand-dealt, not stamped. */
function tilt(i: number) {
  return (((i * 37) % 9) - 4) * 0.45;
}

export function fanMetrics(size: CardSize) {
  const d = CARD_DIMS[size];
  return { w: d.w, h: d.h, dx: Math.round(d.w * 0.34), dy: Math.round(d.h * 0.045) };
}

/** Pixel footprint of a hand (used to fit several hands on small screens). */
export function handWidth(cards: number, size: CardSize, doubled: boolean) {
  const m = fanMetrics(size);
  if (cards <= 0) return m.w;
  const plain = doubled ? cards - 1 : cards;
  let w = m.w + Math.max(0, plain - 1) * m.dx;
  if (doubled) w = Math.max(w, (plain - 1) * m.dx + m.dx + m.h);
  return w;
}

/**
 * One card on the felt. The outer element owns layout (cards slide between
 * hands on a split via layoutId); the inner element owns the deal flight from
 * the shoe, measured at mount.
 */
function DealtCard({
  card,
  layoutKey,
  size,
  left,
  top,
  rotate,
  z,
  fromShoe,
  highlight,
  dim,
}: {
  card: ViewCard;
  layoutKey: string;
  size: CardSize;
  left: number;
  top: number;
  rotate: number;
  z: number;
  fromShoe: boolean;
  highlight?: 'win' | 'gold' | null;
  dim?: boolean;
}) {
  const shoe = useContext(ShoeAnchor);
  const inner = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    const el = inner.current;
    const src = shoe?.current;
    if (!fromShoe || !el) return;
    if (reduced || !src) {
      animate(el, { opacity: [0, 1] }, { duration: DUR.standard });
      return;
    }
    const a = src.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const dx = a.left + a.width / 2 - (b.left + b.width / 2);
    const dy = a.top + a.height / 2 - (b.top + b.height / 2);
    animate(
      el,
      { x: [dx, 0], y: [dy, 0], rotate: [-28, 0], scale: [0.72, 1], opacity: [0, 1, 1] },
      { duration: 0.46, ease: EASE.outExpo },
    );
    // Mount-only: a card flies in once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      layout="position"
      layoutId={layoutKey}
      className="absolute"
      style={{ left, top, zIndex: z }}
      transition={SPRING.card}
      exit={{ opacity: 0, y: -16, transition: { duration: DUR.standard, ease: EASE.out } }}
    >
      <div ref={inner} className="will-change-transform" style={fromShoe ? { opacity: 0 } : undefined}>
        <div style={{ transform: `rotate(${rotate}deg)`, transition: 'transform 300ms var(--ease-out-quint)' }}>
          <PlayingCard code={card.c} size={size} highlight={highlight} dim={dim} />
        </div>
      </div>
    </motion.div>
  );
}

export function TotalPill({ total, soft, tone = 'default', label, className }: { total: string | number; soft?: boolean; tone?: 'default' | 'active' | 'bust' | 'win' | 'gold'; label?: string; className?: string }) {
  void soft;
  return (
    <span
      className={cn(
        'tabular inline-flex h-6 min-w-8 items-center justify-center gap-1 rounded-full px-2.5 text-[12px] font-semibold leading-none shadow-[0_2px_8px_rgba(0,0,0,0.35)] ring-1 backdrop-blur-sm transition-colors duration-200',
        tone === 'default' && 'bg-black/55 text-white/95 ring-white/10',
        tone === 'active' && 'bg-accent text-white ring-white/20',
        tone === 'bust' && 'bg-loss/85 text-white ring-white/10',
        tone === 'win' && 'bg-win text-[#04150d] ring-white/20',
        tone === 'gold' && 'bg-gradient-to-b from-gold-bright to-gold text-[#2a1d05] ring-gold-bright/40',
        className,
      )}
    >
      {label ? <span className="font-medium opacity-70">{label}</span> : null}
      {total}
    </span>
  );
}

export function ResultBanner({ hand }: { hand: HandView }) {
  if (!hand.outcome) return null;
  const net = hand.payout - hand.bet;
  const map = {
    BLACKJACK: { text: 'Blackjack', cls: 'bg-gradient-to-b from-gold-bright to-gold text-[#2a1d05] shadow-glow-gold' },
    WIN: { text: 'Win', cls: 'bg-win text-[#04150d] shadow-glow-win' },
    PUSH: { text: 'Push', cls: 'bg-surface-4/95 text-fg ring-1 ring-white/10' },
    LOSS: { text: 'Lose', cls: 'bg-black/70 text-fg-muted ring-1 ring-white/10' },
    BUST: { text: 'Bust', cls: 'bg-loss/90 text-white' },
  } as const;
  const m = map[hand.outcome];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={SPRING.snappy}
      className={cn('tabular pointer-events-none inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12px] font-bold uppercase tracking-wide', m.cls)}
      data-testid="bj-result"
    >
      {m.text}
      {net > 0 ? <span className="font-semibold normal-case tracking-normal">+{formatCredits(net)}</span> : null}
    </motion.div>
  );
}

/** A fan of cards (player hand or dealer). */
export function CardFan({
  roundId,
  cards,
  size,
  doubled,
  seen,
  highlight,
  dim,
}: {
  roundId: string;
  cards: ViewCard[];
  size: CardSize;
  doubled?: boolean;
  /** Card keys already on screen — anything else flies in from the shoe. */
  seen: Set<string>;
  highlight?: 'win' | 'gold' | null;
  dim?: boolean;
}) {
  const m = fanMetrics(size);
  const n = cards.length;
  const width = handWidth(n, size, !!doubled);
  const height = m.h + Math.max(0, n - 1) * m.dy;
  return (
    <div className="relative transition-[width] duration-300" style={{ width, height }}>
      <AnimatePresence initial={false}>
        {cards.map((c, idx) => {
          const sideways = !!doubled && idx === 2;
          const key = `${roundId}:${c.i}`;
          const left = sideways ? (idx - 1) * m.dx + m.dx + (m.h - m.w) / 2 : idx * m.dx;
          const top = (n - 1 - idx) * m.dy + (sideways ? (m.h - m.w) / 2 - m.dy : 0);
          return (
            <DealtCard
              key={key}
              layoutKey={`bjcard-${key}`}
              card={c}
              size={size}
              left={left}
              top={top}
              rotate={sideways ? 90 : tilt(c.i)}
              z={idx + 1}
              fromShoe={!seen.has(key)}
              highlight={highlight}
              dim={dim}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/** A player hand: total, cards, bet chips and its result. */
export function PlayerHand({
  roundId,
  hand,
  size,
  seen,
  active,
  multi,
  index,
  settled,
}: {
  roundId: string;
  hand: HandView;
  size: CardSize;
  seen: Set<string>;
  active: boolean;
  multi: boolean;
  index: number;
  settled: boolean;
}) {
  const highlight = hand.outcome === 'BLACKJACK' ? 'gold' : hand.outcome === 'WIN' ? 'win' : null;
  const dim = hand.outcome === 'LOSS' || hand.outcome === 'BUST' || (multi && !active && !settled && !hand.outcome);
  const tone = hand.outcome === 'BLACKJACK' || (hand.blackjack && !hand.outcome)
    ? 'gold'
    : hand.bust
      ? 'bust'
      : hand.outcome === 'WIN'
        ? 'win'
        : active && multi
          ? 'active'
          : 'default';
  return (
    <motion.div layout="position" transition={SPRING.soft} className="relative flex flex-col items-center" data-testid={`bj-hand-${index}`}>
      <div className="mb-2 flex h-6 items-center gap-1.5">
        {hand.cards.length ? (
          <TotalPill total={hand.blackjack && hand.cards.length === 2 ? 'BJ' : hand.bust ? hand.total : formatTotal(hand.total, hand.soft)} tone={tone} />
        ) : null}
      </div>
      <div className={cn('relative rounded-xl transition-opacity duration-300', dim && !hand.outcome && 'opacity-60')}>
        <CardFan roundId={roundId} cards={hand.cards} size={size} doubled={hand.doubled} seen={seen} highlight={highlight} dim={hand.outcome === 'LOSS' || hand.outcome === 'BUST'} />
        <div className="pointer-events-none absolute inset-x-0 -bottom-3 z-30 flex justify-center">
          <AnimatePresence>{hand.outcome ? <ResultBanner key="r" hand={hand} /> : null}</AnimatePresence>
        </div>
      </div>
      <div className="mt-5 flex h-9 items-center gap-2">
        <motion.div key={hand.bet} initial={{ scale: 0.85 }} animate={{ scale: 1 }} transition={SPRING.snappy}>
          <ChipStackView amount={hand.bet} size={size === 'sm' ? 22 : 26} />
        </motion.div>
        <span className="tabular text-[12px] font-semibold text-white/80">{formatCredits(hand.bet)}</span>
      </div>
      {multi && active && !settled ? (
        <motion.span layoutId="bj-active-marker" className="absolute -bottom-2 h-[3px] w-10 rounded-full bg-accent shadow-[0_0_12px_#7c5cff]" transition={SPRING.soft} />
      ) : null}
    </motion.div>
  );
}
