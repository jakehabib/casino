'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import type { CardSize } from '@/components/ui/playing-card';
import { ChipStackView } from '@/components/ui/casino-chip';
import { formatCredits } from '@/lib/format';
import { cn } from '@/lib/cn';
import { DUR, EASE, SPRING } from '@/lib/motion';
import { formatTotal } from '@/engines/blackjack/view';
import type { ShoeInfo } from '@/server/services/blackjack/shoe-service';
import type { BlackjackTableConfig } from '@/server/services/blackjack/blackjack-service';
import type { RoundView } from './reveal';
import { CardFan, PlayerHand, ShoeAnchor, TotalPill, handWidth } from './hand-view';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Dealing shoe: angled body, the next card back at the mouth, remaining gauge. */
function ShoeGraphic({ shoe, anchor, compact }: { shoe: ShoeInfo | null; anchor: React.RefObject<HTMLDivElement | null>; compact: boolean }) {
  const remaining = shoe ? shoe.remaining / shoe.total : 1;
  const cut = shoe ? shoe.cutCard / shoe.total : 0.75;
  const w = compact ? 64 : 92;
  return (
    <div className={cn('absolute z-10 flex flex-col items-end gap-1', compact ? 'right-2.5 top-2.5' : 'right-5 top-4')} aria-label="Card shoe">
      <div className="relative drop-shadow-[0_8px_14px_rgba(0,0,0,0.55)]" style={{ width: w, height: w * 0.62 }}>
        <svg viewBox="0 0 100 62" className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <linearGradient id="bj-shoe-body" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2c303b" />
              <stop offset="1" stopColor="#14161c" />
            </linearGradient>
            <pattern id="bj-shoe-back" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="4" height="4" fill="#221a52" />
              <rect width="2" height="4" fill="#2c2266" />
            </pattern>
          </defs>
          {/* body */}
          <path d="M18 58 H92 a4 4 0 0 0 4-4 V14 a4 4 0 0 0-4-4 H40 a6 6 0 0 0-4.6 2.2 L8.6 46.4 A6 6 0 0 0 13.3 58 Z" fill="url(#bj-shoe-body)" stroke="#000" strokeOpacity="0.55" />
          <path d="M40 11 H92" stroke="#fff" strokeOpacity="0.12" />
          {/* cards inside */}
          <path d="M40 18 H90 V52 H22 Z" fill="#000" fillOpacity="0.28" />
          {Array.from({ length: 5 }).map((_, i) => (
            <path key={i} d={`M${44 + i * 9} 20 V50`} stroke="#fff" strokeOpacity="0.05" />
          ))}
          {/* next card at the mouth */}
          <g transform="rotate(-52 24 40)">
            <rect x="9" y="30" width="30" height="20" rx="2.2" fill="url(#bj-shoe-back)" stroke="#fff" strokeOpacity="0.22" />
          </g>
        </svg>
        <div ref={anchor} className="absolute" style={{ left: '8%', top: '38%', width: '30%', height: '40%' }} />
      </div>
      {shoe?.reshuffleNext ? (
        <motion.span
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-full bg-gold-soft px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-gold ring-1 ring-gold/30"
          title="The cut card has been reached: a freshly shuffled shoe opens next round"
        >
          New shoe next
        </motion.span>
      ) : null}
      <div className="flex items-center gap-1.5">
        {!compact ? <span className="tabular text-[10px] font-medium text-white/40">{shoe ? `Shoe ${shoe.number}` : 'Shoe'}</span> : null}
        <div className="relative h-[3px] overflow-hidden rounded-full bg-black/45" style={{ width: compact ? 40 : 52 }} title="Cards remaining in the shoe">
          <motion.div className="absolute inset-y-0 left-0 rounded-full bg-white/55" initial={false} animate={{ width: `${remaining * 100}%` }} transition={{ duration: DUR.game, ease: EASE.out }} />
          <div className="absolute inset-y-0 w-[2px] bg-gold" style={{ left: `${(1 - cut) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

/** Discard pile: face-down cards lying in the tray; thickness follows the cards dealt from this shoe. */
function DiscardTray({ shoe, compact }: { shoe: ShoeInfo | null; compact: boolean }) {
  const layers = shoe && shoe.dealt > 0 ? Math.max(1, Math.min(14, Math.round((shoe.dealt / shoe.total) * 18))) : 0;
  if (layers === 0) return null;
  const w = compact ? 38 : 50;
  const edge = Array.from({ length: layers }, (_, i) => `0 ${i + 1}px 0 ${i % 2 ? '#130f33' : '#2f2670'}`).join(', ');
  return (
    <div className={cn('absolute z-10', compact ? 'left-3 top-3' : 'left-6 top-5')} aria-hidden title="Discard tray">
      <motion.div
        initial={false}
        animate={{ boxShadow: `${edge}, 0 ${layers + 6}px 14px rgba(0,0,0,0.45)` }}
        transition={{ duration: DUR.game }}
        className="rounded-[3px] ring-1 ring-white/15"
        style={{ width: w, height: Math.round(w * 0.68), transform: 'rotate(-5deg)', background: 'repeating-linear-gradient(45deg, #2a2160 0 3px, #221a52 3px 6px)' }}
      />
    </div>
  );
}

/** Felt printing: arcs + payout lines (from the live table config). */
function FeltPrint({ config, faded }: { config: BlackjackTableConfig | null; faded: boolean }) {
  const bj = config?.blackjackPayout === '6:5' ? 'BLACKJACK PAYS 6 TO 5' : 'BLACKJACK PAYS 3 TO 2';
  const dealer = config?.dealerHitsSoft17 ? 'DEALER HITS SOFT 17' : 'DEALER STANDS ON SOFT 17';
  const ins = config?.insurance === false ? '' : '  ·  INSURANCE PAYS 2 TO 1';
  return (
    <svg
      viewBox="0 0 1000 170"
      preserveAspectRatio="xMidYMid meet"
      className="pointer-events-none absolute inset-0 m-auto h-full w-full max-w-[900px] select-none transition-opacity duration-500"
      style={{ opacity: faded ? 0.35 : 1 }}
      aria-hidden
    >
      <defs>
        <path id="bj-arc-1" d="M 110 22 Q 500 196 890 22" />
        <path id="bj-arc-2" d="M 160 66 Q 500 214 840 66" />
        <path id="bj-arc-3" d="M 136 44 Q 500 206 864 44" />
      </defs>
      <use href="#bj-arc-3" fill="none" stroke="#e2b456" strokeOpacity="0.18" strokeWidth="1.4" />
      <use href="#bj-arc-2" fill="none" stroke="#e2b456" strokeOpacity="0.1" strokeWidth="1.2" />
      <text fontFamily="var(--font-geist-sans)" fontSize="27" fontWeight="700" letterSpacing="7" fill="#e2b456" fillOpacity="0.34">
        <textPath href="#bj-arc-1" startOffset="50%" textAnchor="middle">{bj}</textPath>
      </text>
      <text fontFamily="var(--font-geist-sans)" fontSize="14" fontWeight="600" letterSpacing="3.5" fill="#ffffff" fillOpacity="0.24">
        <textPath href="#bj-arc-2" startOffset="50%" textAnchor="middle">{dealer}{ins}</textPath>
      </text>
    </svg>
  );
}

/** Round summary in the middle of the felt once a round settles. */
function RoundResult({ view }: { view: RoundView }) {
  const bj = view.hands.some((h) => h.outcome === 'BLACKJACK');
  const net = view.net;
  const label = bj ? 'Blackjack' : net > 0 ? 'You win' : net === 0 ? 'Push' : view.dealer.blackjack ? 'Dealer blackjack' : 'Dealer wins';
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: DUR.fast } }}
      transition={SPRING.soft}
      className={cn(
        'pointer-events-none flex flex-col items-center rounded-2xl px-5 py-2.5 text-center backdrop-blur-md',
        bj ? 'bg-black/50 ring-1 ring-gold/50 shadow-glow-gold' : net > 0 ? 'bg-black/45 ring-1 ring-win/40' : 'bg-black/40 ring-1 ring-white/10',
      )}
      data-testid="bj-round-result"
    >
      <span className={cn('text-[11px] font-semibold uppercase tracking-[0.18em]', bj ? 'text-gold-bright' : net > 0 ? 'text-win' : 'text-white/60')}>{label}</span>
      {net !== 0 ? (
        <span className={cn('tabular text-xl font-bold leading-tight sm:text-2xl', bj ? 'text-gold-bright' : net > 0 ? 'text-white' : 'text-white/70')}>
          {net > 0 ? '+' : '−'}
          {formatCredits(Math.abs(net))}
        </span>
      ) : (
        <span className="tabular text-sm font-semibold text-white/80">Stake returned</span>
      )}
    </motion.div>
  );
}

export function BlackjackTable({
  view,
  shoe,
  config,
  bet,
  onBetSpot,
  canBet,
  actionBar,
  instantIds,
}: {
  view: RoundView | null;
  shoe: ShoeInfo | null;
  config: BlackjackTableConfig | null;
  bet: number;
  onBetSpot?: () => void;
  canBet: boolean;
  actionBar: ReactNode;
  /** Round restored without animation: its cards are already "on screen". */
  instantIds: string | null;
}) {
  const shoeAnchor = useRef<HTMLDivElement>(null);
  const [ref, width] = useWidth<HTMLDivElement>();
  const compact = width > 0 && width < 640;

  // Cards already presented — anything else flies in from the shoe.
  const seenRef = useRef(new Set<string>());
  const roundId = view?.id ?? 'none';
  const seen = useMemo(() => {
    const s = new Set(seenRef.current);
    if (view && instantIds === view.id) {
      for (const c of view.dealer.cards) s.add(`${view.id}:${c.i}`);
      for (const h of view.hands) for (const c of h.cards) s.add(`${view.id}:${c.i}`);
    }
    return s;
  }, [view, instantIds]);
  useEffect(() => {
    if (!view) return;
    const s = seenRef.current;
    for (const c of view.dealer.cards) s.add(`${view.id}:${c.i}`);
    for (const h of view.hands) for (const c of h.cards) s.add(`${view.id}:${c.i}`);
    if (s.size > 400) seenRef.current = new Set([...s].filter((k) => k.startsWith(`${view.id}:`)));
  }, [view]);

  const hands = view?.hands ?? [];
  const multi = hands.length > 1;
  const playerSize: CardSize = compact ? (hands.length > 1 ? 'sm' : 'md') : hands.length > 2 ? 'md' : 'lg';
  const dealerSize: CardSize = compact ? 'md' : 'lg';

  // Fit all hands in the available width.
  const gap = compact ? 14 : 36;
  const needed = hands.reduce((a, h) => a + Math.max(handWidth(h.cards.length, playerSize, h.doubled), 64), 0) + gap * Math.max(0, hands.length - 1);
  const avail = Math.max(1, width - (compact ? 16 : 48));
  const scale = needed > avail ? Math.max(0.6, avail / needed) : 1;

  const settled = !!view?.settled;
  const showBetSpot = !view;
  const dealerTone = view?.dealer.blackjack ? 'gold' : view && view.dealer.total > 21 ? 'bust' : 'default';

  return (
    <ShoeAnchor.Provider value={shoeAnchor}>
      <div
        ref={ref}
        className="felt relative flex select-none flex-col overflow-hidden rounded-xl border border-felt-line/60 shadow-[inset_0_0_120px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.05)]"
        style={{ minHeight: compact ? 520 : 610 }}
        data-testid="bj-table"
      >
        <div className="noise pointer-events-none absolute inset-0 opacity-70" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <DiscardTray shoe={shoe} compact={compact} />
        <ShoeGraphic shoe={shoe} anchor={shoeAnchor} compact={compact} />

        <LayoutGroup id="bj-table">
          {/* Dealer */}
          <div className={cn('relative z-[1] flex flex-col items-center', compact ? 'pt-3' : 'pt-6')} style={{ minHeight: compact ? 150 : 190 }}>
            <div className="mb-2 flex h-6 items-center">
              {view && view.dealer.cards.length ? (
                <TotalPill
                  label="Dealer"
                  tone={dealerTone}
                  total={view.dealer.blackjack ? 'BJ' : view.dealer.revealed ? formatTotal(view.dealer.total, view.dealer.soft && !settled) : formatTotal(view.dealer.total, view.dealer.soft)}
                />
              ) : (
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/25">Dealer</span>
              )}
            </div>
            {view ? <CardFan roundId={roundId} cards={view.dealer.cards} size={dealerSize} seen={seen} /> : null}
          </div>

          {/* Middle: result / insurance note */}
          <div className="relative z-[2] flex flex-1 items-center justify-center px-4" style={{ minHeight: compact ? 92 : 124 }}>
            <FeltPrint config={config} faded={settled || view?.status === 'INSURANCE_OFFERED'} />
            <AnimatePresence mode="wait">
              {view && settled ? <RoundResult key={`res-${view.id}`} view={view} /> : null}
              {view && view.status === 'INSURANCE_OFFERED' && view.legal.length ? (
                <motion.div key="ins" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-full bg-black/45 px-4 py-1.5 text-[12px] font-semibold text-white/85 ring-1 ring-white/10 backdrop-blur">
                  Dealer shows an Ace · Insurance?
                </motion.div>
              ) : null}
              {view?.insurance.taken && !settled ? (
                <motion.div key="ins-taken" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rounded-full bg-black/35 px-3 py-1 text-[11px] font-medium text-white/60 ring-1 ring-white/10">
                  Insured · {formatCredits(view.insurance.bet)}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {/* Player */}
          <div className={cn('relative z-[3] flex items-end justify-center', compact ? 'pb-4' : 'pb-6')} style={{ minHeight: compact ? 200 : 236 }}>
            {showBetSpot ? (
              <BetSpot bet={bet} onClick={onBetSpot} disabled={!canBet} compact={compact} />
            ) : (
              <div className="flex items-end justify-center" style={{ gap, transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: 'bottom center' }}>
                {hands.map((h, i) => (
                  <PlayerHand
                    key={`${roundId}-h${i}`}
                    roundId={roundId}
                    hand={h}
                    index={i}
                    size={playerSize}
                    seen={seen}
                    active={i === view!.active && !settled}
                    multi={multi}
                    settled={settled}
                    showAmount={multi}
                  />
                ))}
              </div>
            )}
          </div>
        </LayoutGroup>

        {/* Action bar (thumb zone) */}
        <div className="relative z-20 border-t border-white/[0.06] bg-black/30 px-2.5 py-2.5 backdrop-blur-md sm:px-4">{actionBar}</div>
      </div>
    </ShoeAnchor.Provider>
  );
}

function BetSpot({ bet, onClick, disabled, compact }: { bet: number; onClick?: () => void; disabled: boolean; compact: boolean }) {
  const size = compact ? 88 : 108;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Add chip to bet"
      className="group relative mb-6 flex flex-col items-center disabled:cursor-default"
      data-testid="bj-bet-spot"
    >
      <div
        className="relative flex items-center justify-center rounded-full border-2 border-dashed border-gold/30 transition-colors duration-200 group-enabled:group-hover:border-gold/55"
        style={{ width: size, height: size }}
      >
        <div className="absolute inset-[7px] rounded-full border border-white/[0.07] bg-black/10" />
        <AnimatePresence mode="popLayout">
          {bet > 0 ? (
            <motion.div key={bet} initial={{ y: -14, opacity: 0, scale: 0.9 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={SPRING.snappy} className="relative">
              <ChipStackView amount={bet} size={compact ? 40 : 46} />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <span className="tabular mt-2 rounded-full bg-black/40 px-2.5 py-0.5 text-[12px] font-semibold text-white/85 ring-1 ring-white/10">
        {formatCredits(bet)}
      </span>
    </button>
  );
}
