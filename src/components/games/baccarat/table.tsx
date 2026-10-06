'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { EASE } from '@/lib/motion';
import type { CardSize } from '@/components/ui/playing-card';
import { formatCredits } from '@/lib/format';
import type { BaccaratController } from './use-baccarat';
import { HandArea } from './hand';
import { BetZone } from './bet-zone';
import { ShoeMeter, ShoeBox } from './shoe';
import { SIDE_TONE } from './theme';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** The felt: shoe, both hands, status line and the three betting zones. */
export function BaccaratTable({ c }: { c: BaccaratController }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const size: CardSize = width >= 760 ? 'lg' : width >= 500 ? 'md' : 'sm';
  const compact = width > 0 && width < 520;
  const { result, pres, phase, cfg } = c;

  const deal = result?.deal ?? [];
  const shown = deal.slice(0, pres.shown).map((card, index) => ({ card, index }));
  const playerCards = shown.filter((x) => x.card.side === 'PLAYER');
  const bankerCards = shown.filter((x) => x.card.side === 'BANKER');
  const lastRevealed = pres.revealed > 0 ? deal[pres.revealed - 1] : null;
  // Running totals over the face-up cards only.
  const pTotal = lastRevealed ? totalOf(deal.slice(0, pres.revealed), 'PLAYER') : null;
  const bTotal = lastRevealed ? totalOf(deal.slice(0, pres.revealed), 'BANKER') : null;
  const done = phase === 'result' && !!result;
  const sideState = (s: 'PLAYER' | 'BANKER') =>
    !done ? 'idle' : result!.outcome === 'TIE' ? 'tie' : result!.outcome === s ? 'win' : 'lose';
  const naturalOn = (s: 'PLAYER' | 'BANKER') =>
    pres.natural && !!result && (result.naturalSide === s || result.naturalSide === 'BOTH');

  const settledFor = (z: 'PLAYER' | 'BANKER' | 'TIE') => {
    if (!done) return null;
    const b = result!.bets.find((x) => x.type === z);
    return b ? { outcome: b.outcome, payout: b.payout } : null;
  };

  return (
    <div
      ref={ref}
      className="felt noise relative overflow-hidden rounded-xl border border-felt-line/60 shadow-[inset_0_1px_0_rgb(255_255_255/0.05),inset_0_-40px_80px_-40px_rgb(0_0_0/0.6)]"
      data-testid="bac-table"
    >
      <TablePrint commissionBps={cfg?.bankerCommissionBps ?? 500} tiePayout={cfg?.tiePayout ?? 8} />

      {/* Top rail: shoe status + shoe */}
      <div className="relative flex items-start justify-between gap-3 px-3 pt-3 sm:px-5 sm:pt-4">
        <ShoeMeter shoe={c.state.data?.shoe ?? null} />
        <ShoeBox dealing={phase === 'dealing'} />
      </div>

      {/* Hands */}
      <div className={cn('relative grid grid-cols-[1fr_auto_1fr] items-start px-2 sm:px-5', compact ? 'mt-1 gap-1' : 'mt-2 gap-3')}>
        <HandArea
          side="PLAYER"
          cards={playerCards}
          revealed={pres.revealed}
          total={pTotal}
          size={size}
          natural={naturalOn('PLAYER')}
          caption={pres.caption?.side === 'PLAYER' ? pres.caption.text : null}
          state={sideState('PLAYER')}
          reduce={c.reduce}
        />
        <div className="flex h-full flex-col items-center pt-10" aria-hidden>
          <div className="h-full w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />
        </div>
        <HandArea
          side="BANKER"
          cards={bankerCards}
          revealed={pres.revealed}
          total={bTotal}
          size={size}
          natural={naturalOn('BANKER')}
          caption={pres.caption?.side === 'BANKER' ? pres.caption.text : null}
          state={sideState('BANKER')}
          reduce={c.reduce}
        />
      </div>

      <StatusLine c={c} />

      {/* Betting zones */}
      <div className={cn('relative grid px-2.5 pb-3 sm:px-5 sm:pb-5', compact ? 'grid-cols-[1fr_0.82fr_1fr] gap-1.5' : 'grid-cols-[1fr_0.8fr_1fr] gap-2.5')}>
        <BetZone zone="PLAYER" amount={c.bets.PLAYER} odds="Pays 1:1" disabled={!c.canBet} settled={settledFor('PLAYER')} compact={compact} onPlace={() => c.place('PLAYER')} />
        <BetZone zone="TIE" amount={c.bets.TIE} odds={`Pays ${cfg?.tiePayout ?? 8}:1`} disabled={!c.canBet} settled={settledFor('TIE')} compact={compact} onPlace={() => c.place('TIE')} />
        <BetZone
          zone="BANKER"
          amount={c.bets.BANKER}
          odds={`Pays ${bankerOdds(cfg?.bankerCommissionBps ?? 500)}`}
          disabled={!c.canBet}
          settled={settledFor('BANKER')}
          compact={compact}
          onPlace={() => c.place('BANKER')}
        />
      </div>
    </div>
  );
}

export function bankerOdds(bps: number) {
  const r = (10_000 - bps) / 10_000;
  return `${+r.toFixed(3)}:1`;
}

function totalOf(cards: { side: string; card: string }[], side: 'PLAYER' | 'BANKER') {
  const VAL: Record<string, number> = { A: 1, T: 0, J: 0, Q: 0, K: 0 };
  let t = 0;
  for (const c of cards) if (c.side === side) t += VAL[c.card[0]] ?? Number(c.card[0]);
  return t % 10;
}

function StatusLine({ c }: { c: BaccaratController }) {
  const { phase, result, staked } = c;
  let key = 'idle';
  let node: React.ReactNode;
  if (phase === 'result' && result) {
    key = `r-${result.id}`;
    const tone = SIDE_TONE[result.outcome];
    const net = result.net;
    node = (
      <span className="flex items-center gap-2.5">
        <span className="text-[13px] font-bold uppercase tracking-[0.2em] sm:text-sm" style={{ color: tone.hex }}>
          {result.outcome === 'TIE' ? 'Tie' : `${tone.label} wins`}
        </span>
        <span className="tabular text-[13px] font-semibold text-white/70">
          {result.playerTotal} – {result.bankerTotal}
        </span>
        {result.totalWagered > 0 ? (
          <span
            className={cn(
              'tabular rounded-md px-1.5 py-0.5 text-xs font-bold',
              net > 0 ? 'bg-win/15 text-win' : net === 0 ? 'bg-white/10 text-fg-muted' : 'bg-black/30 text-white/45',
            )}
          >
            {net > 0 ? `+${formatCredits(net)}` : net === 0 ? 'Push' : formatCredits(net)}
          </span>
        ) : null}
      </span>
    );
  } else if (phase === 'dealing') {
    key = 'dealing';
    node = <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">Dealing</span>;
  } else {
    key = staked > 0 ? 'ready' : 'bets';
    node = (
      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
        {staked > 0 ? 'Ready to deal' : 'Place your bets'}
      </span>
    );
  }
  return (
    <div className="relative flex h-11 items-center justify-center" aria-live="polite">
      <AnimatePresence mode="wait">
        <motion.div
          key={key}
          initial={{ opacity: 0, y: 6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.22, ease: EASE.out }}
        >
          {node}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Subtle printed felt: arc and payout legend, like a real layout. */
function TablePrint({ commissionBps, tiePayout }: { commissionBps: number; tiePayout: number }) {
  const pct = commissionBps / 100;
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 1000 600">
      <defs>
        <radialGradient id="bac-vignette" cx="50%" cy="35%" r="75%">
          <stop offset="60%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.35" />
        </radialGradient>
      </defs>
      <rect width="1000" height="600" fill="url(#bac-vignette)" />
      <path d="M -40 330 Q 500 520 1040 330" fill="none" stroke="#ffffff" strokeOpacity="0.06" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <text x="500" y="20" fill="none" />
      <title>{`Banker pays 1:1 less ${pct}% commission · Tie pays ${tiePayout}:1`}</title>
    </svg>
  );
}
