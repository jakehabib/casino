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

/** Dealing shoe: angled box, card backs, remaining-cards gauge. */
function ShoeGraphic({ shoe, anchor, compact }: { shoe: ShoeInfo | null; anchor: React.RefObject<HTMLDivElement | null>; compact: boolean }) {
  const remaining = shoe ? shoe.remaining / shoe.total : 1;
  const cut = shoe ? shoe.cutCard / shoe.total : 0.75;
  return (
    <div className={cn('absolute right-3 top-3 z-10 flex flex-col items-end gap-1.5 sm:right-5 sm:top-4', compact && 'right-2 top-2')} aria-label="Card shoe">
      <div className="relative" style={{ width: compact ? 58 : 84, height: compact ? 40 : 56 }}>
        {/* body */}
        <div className="absolute inset-0 rounded-[8px] bg-gradient-to-b from-[#232733] to-[#14161c] shadow-[0_6px_16px_-4px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-black/60" style={{ transform: 'perspective(220px) rotateX(18deg) skewX(-8deg)' }} />
        {/* mouth with the next card back */}
        <div ref={anchor} className="absolute bottom-[18%] left-[10%] h-[46%] w-[46%] -rotate-[8deg] rounded-[3px] bg-[#1b1640] ring-1 ring-white/15" style={{ background: 'repeating-linear-gradient(45deg, #2a2160 0 3px, #221a52 3px 6px)' }} />
        <div className="absolute right-[10%] top-[24%] h-[52%] w-[24%] rounded-[3px] bg-black/35 ring-1 ring-white/5" />
      </div>
      <div className="flex items-center gap-1.5">
        <div className="relative h-1 overflow-hidden rounded-full bg-black/40" style={{ width: compact ? 40 : 56 }} title="Cards remaining">
          <motion.div className="absolute inset-y-0 left-0 rounded-full bg-white/50" initial={false} animate={{ width: `${remaining * 100}%` }} transition={{ duration: DUR.game, ease: EASE.out }} />
          <div className="absolute inset-y-0 w-px bg-gold/80" style={{ left: `${(1 - cut) * 100}%` }} />
        </div>
        {!compact ? <span className="tabular text-[10px] font-medium text-white/45">{shoe ? `Shoe ${shoe.number}` : 'Shoe'}</span> : null}
      </div>
    </div>
  );
}

/** Discard tray: stacked card edges, height follows the cards dealt from this shoe. */
function DiscardTray({ shoe, compact }: { shoe: ShoeInfo | null; compact: boolean }) {
  const lines = shoe ? Math.min(18, Math.round((shoe.dealt / shoe.total) * 26)) : 0;
  const w = compact ? 34 : 46;
  return (
    <div className={cn('absolute left-3 top-3 z-10 sm:left-5 sm:top-4', compact && 'left-2 top-2')} aria-hidden>
      <div className="relative rounded-[6px] bg-black/25 p-1 ring-1 ring-white/5" style={{ width: w + 8, height: (compact ? 40 : 56) }}>
        <div className="absolute inset-x-1 bottom-1 flex flex-col-reverse">
          {Array.from({ length: lines }).map((_, i) => (
            <div key={i} className="h-[2px] rounded-[1px] border-t border-black/30 bg-[#2a2160]" style={{ width: w, transform: `translateX(${((i * 7) % 3) - 1}px)` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Felt printing: arcs + payout lines (from the live table config). */
function FeltPrint({ config, compact }: { config: BlackjackTableConfig | null; compact: boolean }) {
  const bj = config?.blackjackPayout === '6:5' ? 'BLACKJACK PAYS 6 TO 5' : 'BLACKJACK PAYS 3 TO 2';
  const dealer = config?.dealerHitsSoft17 ? 'DEALER HITS SOFT 17' : 'DEALER STANDS ON SOFT 17';
  const ins = config?.insurance === false ? '' : '  ·  INSURANCE PAYS 2 TO 1';
  return (
    <svg viewBox="0 0 1000 260" className="pointer-events-none absolute inset-x-0 mx-auto w-full max-w-[860px] select-none" style={{ top: compact ? 108 : 150 }} aria-hidden>
      <defs>
        <path id="bj-arc-1" d="M 130 40 Q 500 250 870 40" />
        <path id="bj-arc-2" d="M 175 92 Q 500 280 825 92" />
        <path id="bj-arc-3" d="M 150 64 Q 500 266 850 64" />
      </defs>
      <use href="#bj-arc-3" fill="none" stroke="#e2b456" strokeOpacity="0.16" strokeWidth="1.2" />
      <use href="#bj-arc-2" fill="none" stroke="#e2b456" strokeOpacity="0.1" strokeWidth="1.2" />
      <text fontFamily="var(--font-geist-sans)" fontSize="25" fontWeight="700" letterSpacing="7" fill="#e2b456" fillOpacity="0.32">
        <textPath href="#bj-arc-1" startOffset="50%" textAnchor="middle">{bj}</textPath>
      </text>
      <text fontFamily="var(--font-geist-sans)" fontSize="13" fontWeight="600" letterSpacing="3.5" fill="#ffffff" fillOpacity="0.22">
        <textPath href="#bj-arc-2" startOffset="50%" textAnchor="middle" dy="-8">{dealer}{ins}</textPath>
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
  const showBetSpot = !view || (view.settled && hands.length === 0);
  const dealerTone = view?.dealer.blackjack ? 'gold' : view && view.dealer.total > 21 ? 'bust' : 'default';

  return (
    <ShoeAnchor.Provider value={shoeAnchor}>
      <div
        ref={ref}
        className="felt relative flex select-none flex-col overflow-hidden rounded-xl border border-felt-line/60 shadow-[inset_0_0_120px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.05)]"
        style={{ minHeight: compact ? 470 : 590 }}
        data-testid="bj-table"
      >
        <div className="noise pointer-events-none absolute inset-0 opacity-70" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <FeltPrint config={config} compact={compact} />
        <DiscardTray shoe={shoe} compact={compact} />
        <ShoeGraphic shoe={shoe} anchor={shoeAnchor} compact={compact} />

        <LayoutGroup id="bj-table">
          {/* Dealer */}
          <div className={cn('relative z-[1] flex flex-col items-center', compact ? 'pt-4' : 'pt-7')} style={{ minHeight: compact ? 150 : 196 }}>
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
            {view ? <CardFan roundId={roundId} cards={view.dealer.cards} size={dealerSize} seen={seen} dim={settled && view.net > 0 && !view.dealer.blackjack} /> : null}
          </div>

          {/* Middle: result / insurance note */}
          <div className="relative z-[2] flex min-h-[64px] flex-1 items-center justify-center px-4">
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
