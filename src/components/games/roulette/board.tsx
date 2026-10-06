'use client';
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { BET_CATALOGUE, getSpot, type BetSpot } from '@/engines/roulette/bets';
import { colorOf } from '@/engines/roulette/wheel';
import { CasinoChip } from '@/components/ui/casino-chip';
import { formatCredits } from '@/lib/format';
import { cn } from '@/lib/cn';
import { SPRING } from '@/lib/motion';
import { anchorOf, cellOf, spotAt, toLogical, toPercent, type Orientation } from './board-geometry';
import type { BetMap } from './use-roulette-table';

const OUTSIDE = {
  dozens: ['DOZEN:1-2-3-4-5-6-7-8-9-10-11-12', 'DOZEN:13-14-15-16-17-18-19-20-21-22-23-24', 'DOZEN:25-26-27-28-29-30-31-32-33-34-35-36'],
  columns: BET_CATALOGUE.filter((s) => s.type === 'COLUMN').map((s) => s.id), // Column 1, 2, 3
  even: ['LOW', 'EVEN', 'RED', 'BLACK', 'ODD', 'HIGH'],
};
const OUTSIDE_TEXT: Record<string, string> = {
  LOW: '1–18',
  HIGH: '19–36',
  EVEN: 'Even',
  ODD: 'Odd',
  RED: 'Red',
  BLACK: 'Black',
  [OUTSIDE.dozens[0]]: '1st 12',
  [OUTSIDE.dozens[1]]: '2nd 12',
  [OUTSIDE.dozens[2]]: '3rd 12',
};

const SNAP_PX = 11;

export interface SettledView {
  winningNumber: number;
  /** spotId → { amount, payout } */
  bets: Record<string, { amount: number; payout: number }>;
}

export interface BoardProps {
  orientation: Orientation;
  bets: BetMap;
  settled: SettledView | null;
  disabled: boolean;
  onPlace: (spot: BetSpot) => void;
  onHover: (spot: BetSpot | null) => void;
  /** Element the payout chips glide to. */
  payoutTarget?: RefObject<HTMLElement | null>;
}

export const RouletteBoard = memo(function RouletteBoard({ orientation, bets, settled, disabled, onPlace, onHover, payoutTarget }: BoardProps) {
  const [hover, setHover] = useState<BetSpot | null>(null);
  const insideRef = useRef<HTMLDivElement>(null);
  const downRef = useRef<{ x: number; y: number; id: number } | null>(null);
  const covered = useMemo(() => new Set(hover?.numbers ?? []), [hover]);
  const horizontal = orientation === 'horizontal';

  const setHot = useCallback(
    (s: BetSpot | null) => {
      setHover((prev) => (prev?.id === s?.id ? prev : s));
      onHover(s);
    },
    [onHover],
  );

  const hit = useCallback(
    (clientX: number, clientY: number): BetSpot | null => {
      const el = insideRef.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const fx = (clientX - r.left) / r.width;
      const fy = (clientY - r.top) / r.height;
      const { s, k } = toLogical(orientation, fx, fy);
      const unitS = horizontal ? r.width / 13 : r.height / 13;
      const unitK = horizontal ? r.height / 3 : r.width / 3;
      return spotAt(s, k, Math.min(0.3, SNAP_PX / unitS), Math.min(0.3, SNAP_PX / unitK));
    },
    [orientation, horizontal],
  );

  // Chips displayed: draft bets, or the settled round's bets when showing a result.
  const display = useMemo(() => {
    if (settled) return Object.entries(settled.bets).map(([id, v]) => ({ id, amount: v.amount, payout: v.payout }));
    return Object.entries(bets).map(([id, amount]) => ({ id, amount, payout: -1 }));
  }, [bets, settled]);

  const insideChips = display.filter((c) => {
    const t = getSpot(c.id)?.type;
    return t === 'STRAIGHT' || t === 'SPLIT' || t === 'STREET' || t === 'CORNER' || t === 'SIX_LINE';
  });
  const outsideChip = (id: string) => display.find((c) => c.id === id);
  const win = settled?.winningNumber ?? null;

  const gridStyle: CSSProperties = horizontal
    ? { gridTemplateColumns: 'repeat(14, minmax(0, 1fr))', gridTemplateRows: 'repeat(3, var(--rb-row)) var(--rb-out) var(--rb-out)' }
    : { gridTemplateColumns: 'var(--rb-side) var(--rb-side) repeat(3, minmax(0, 1fr))', gridTemplateRows: 'repeat(14, var(--rb-row))' };

  const outsideCell = (id: string, style: CSSProperties, extra?: { className?: string; children?: React.ReactNode; vertical?: boolean }) => {
    const spot = getSpot(id)!;
    const chip = outsideChip(id);
    const isHover = hover?.id === id;
    const won = win !== null && spot.numbers.includes(win);
    return (
      <button
        key={id}
        type="button"
        disabled={disabled}
        style={style}
        aria-label={`${spot.label}, pays ${odds(spot)}${chip ? `, ${formatCredits(chip.amount)} placed` : ''}`}
        onPointerEnter={() => setHot(spot)}
        onPointerLeave={() => setHot(null)}
        onFocus={() => setHot(spot)}
        onBlur={() => setHot(null)}
        onClick={() => onPlace(spot)}
        className={cn(
          'relative flex items-center justify-center border-[0.5px] border-white/15 text-[13px] font-semibold tracking-wide text-fg/90 transition-[background-color,box-shadow] duration-150 disabled:cursor-default',
          isHover && !disabled ? 'bg-white/[0.09]' : 'bg-transparent',
          won && settled && 'bg-white/[0.07] shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.75)]',
          extra?.className,
        )}
      >
        <span className={cn('pointer-events-none select-none', extra?.vertical && '[writing-mode:vertical-rl] rotate-180')}>{extra?.children ?? OUTSIDE_TEXT[id]}</span>
        <AnimatePresence>
          {chip ? <BoardChip key={id} amount={chip.amount} payout={chip.payout} payoutTarget={payoutTarget} /> : null}
        </AnimatePresence>
      </button>
    );
  };

  // Vertical: dozen cells span 4 rows each starting at row 2; even-money span 2 rows.
  const dozenStyle = (i: number): CSSProperties =>
    horizontal ? { gridColumn: `${2 + i * 4} / span 4`, gridRow: 4 } : { gridColumn: 2, gridRow: `${2 + i * 4} / span 4` };
  const evenStyle = (i: number): CSSProperties =>
    horizontal ? { gridColumn: `${2 + i * 2} / span 2`, gridRow: 5 } : { gridColumn: 1, gridRow: `${2 + i * 2} / span 2` };
  // Column bets: horizontal on the right (top row = column 3); vertical along the bottom.
  const columnStyle = (c: number): CSSProperties =>
    horizontal ? { gridColumn: 14, gridRow: 3 - c } : { gridColumn: 3 + c, gridRow: 14 };

  return (
    <div
      className={cn(
        'roulette-board relative grid select-none overflow-visible rounded-lg [--rb-out:44px] [--rb-side:40px]',
        horizontal ? '[--rb-row:clamp(40px,4.6vw,58px)]' : '[--rb-row:36px]',
      )}
      style={gridStyle}
      onPointerLeave={() => setHot(null)}
    >
      {/* Inside area: zero + 36 numbers, with a single hit-test overlay */}
      <div ref={insideRef} className="relative" style={horizontal ? { gridColumn: '1 / span 13', gridRow: '1 / span 3' } : { gridColumn: '3 / span 3', gridRow: '1 / span 13' }}>
        <NumberCells orientation={orientation} covered={covered} win={win} disabled={disabled} onPlace={onPlace} />
        <div
          className={cn('absolute inset-0 z-[2] touch-manipulation', disabled ? 'cursor-default' : 'cursor-pointer')}
          onPointerMove={(e) => {
            if (disabled || e.pointerType === 'touch') return;
            setHot(hit(e.clientX, e.clientY));
          }}
          onPointerLeave={() => setHot(null)}
          onPointerDown={(e) => {
            if (disabled) return;
            downRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
            if (e.pointerType === 'touch') setHot(hit(e.clientX, e.clientY));
          }}
          onPointerCancel={() => {
            downRef.current = null;
          }}
          onPointerUp={(e) => {
            const d = downRef.current;
            downRef.current = null;
            if (disabled || !d || d.id !== e.pointerId) return;
            if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) return; // a scroll, not a tap
            const spot = hit(e.clientX, e.clientY);
            if (spot) onPlace(spot);
            if (e.pointerType === 'touch') setTimeout(() => setHover(null), 260);
          }}
        />
        <div className="pointer-events-none absolute inset-0 z-[3]">
          <AnimatePresence>
            {insideChips.map((c) => {
              const spot = getSpot(c.id)!;
              const a = anchorOf(spot);
              const pos = toPercent(orientation, a.s, a.k);
              return (
                <div key={c.id} className="absolute" style={{ left: pos.left, top: pos.top }}>
                  <BoardChip amount={c.amount} payout={c.payout} payoutTarget={payoutTarget} centered />
                </div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {OUTSIDE.columns.map((id, c) => outsideCell(id, columnStyle(c), { children: '2:1', className: horizontal ? 'rounded-r-md' : c === 0 ? 'rounded-bl-md' : c === 2 ? 'rounded-br-md' : '' }))}
      {OUTSIDE.dozens.map((id, i) => outsideCell(id, dozenStyle(i), { vertical: !horizontal }))}
      {OUTSIDE.even.map((id, i) =>
        outsideCell(id, evenStyle(i), {
          vertical: !horizontal && id !== 'RED' && id !== 'BLACK',
          className: cn(horizontal ? (i === 0 ? 'rounded-bl-md' : i === 5 ? 'rounded-br-md' : '') : i === 0 ? 'rounded-tl-md' : i === 5 ? 'rounded-bl-md' : ''),
          children:
            id === 'RED' || id === 'BLACK' ? (
              <span
                aria-hidden
                className={cn('block h-5 w-5 rotate-45 rounded-[3px] shadow-[0_1px_2px_rgba(0,0,0,0.5)]', id === 'RED' ? 'bg-roulette-red' : 'bg-roulette-black ring-1 ring-white/25')}
              />
            ) : undefined,
        }),
      )}
    </div>
  );
});

function odds(spot: BetSpot) {
  const map: Record<string, string> = { STRAIGHT: '35:1', SPLIT: '17:1', STREET: '11:1', CORNER: '8:1', SIX_LINE: '5:1', DOZEN: '2:1', COLUMN: '2:1' };
  return map[spot.type] ?? '1:1';
}

/** Zero + 1..36 cells (visual + keyboard-accessible straight-up buttons). */
const NumberCells = memo(function NumberCells({
  orientation,
  covered,
  win,
  disabled,
  onPlace,
}: {
  orientation: Orientation;
  covered: Set<number>;
  win: number | null;
  disabled: boolean;
  onPlace: (s: BetSpot) => void;
}) {
  const horizontal = orientation === 'horizontal';
  const cells = [];
  for (let n = 0; n <= 36; n++) {
    let rect: CSSProperties;
    if (n === 0) {
      rect = horizontal ? { left: 0, top: 0, width: `${100 / 13}%`, height: '100%' } : { left: 0, top: 0, width: '100%', height: `${100 / 13}%` };
    } else {
      const { s, k } = cellOf(n);
      rect = horizontal
        ? { left: `${((s + 1) / 13) * 100}%`, top: `${((2 - k) / 3) * 100}%`, width: `${100 / 13}%`, height: `${100 / 3}%` }
        : { left: `${(k / 3) * 100}%`, top: `${((s + 1) / 13) * 100}%`, width: `${100 / 3}%`, height: `${100 / 13}%` };
    }
    const c = colorOf(n);
    const hot = covered.has(n);
    const isWin = win === n;
    cells.push(
      <button
        key={n}
        type="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={`Straight ${n}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (!disabled) onPlace(getSpot(`STRAIGHT:${n}`)!);
          }
        }}
        style={rect}
        className={cn(
          'absolute flex items-center justify-center border-[0.5px] border-white/15 transition-[filter,box-shadow] duration-150 focus-visible:z-[4] focus-visible:rounded-none',
          n === 0 && (horizontal ? 'rounded-l-[22px]' : 'rounded-t-[22px]'),
          isWin && 'z-[1] shadow-[inset_0_0_0_2px_#fff,0_0_22px_2px_rgba(255,255,255,0.35)]',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute inset-[3px] rounded-[5px] transition-[filter,opacity] duration-150',
            n === 0 && (horizontal ? 'rounded-l-[19px]' : 'rounded-t-[19px]'),
            c === 'red' && 'bg-roulette-red',
            c === 'black' && 'bg-roulette-black',
            c === 'green' && 'bg-roulette-green',
            hot && 'brightness-[1.35]',
          )}
          style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -8px 14px -10px rgba(0,0,0,0.6)' }}
        />
        {hot ? <span aria-hidden className="absolute inset-[3px] rounded-[5px] ring-1 ring-white/70" /> : null}
        {isWin ? <span aria-hidden className="absolute inset-0 animate-[rb-win_1.4s_ease-in-out_infinite] bg-white/20" /> : null}
        <span className="tabular relative text-[13px] font-bold text-white sm:text-[15px]">{n}</span>
      </button>,
    );
  }
  return (
    <>
      {cells}
      <style>{`@keyframes rb-win { 0%,100% { opacity: .15 } 50% { opacity: .9 } }`}</style>
    </>
  );
});

/**
 * Chip on the layout. In the result view a winning chip shows its payout and a
 * payout chip glides to the win readout; losing chips fade out.
 */
function BoardChip({ amount, payout, centered, payoutTarget }: { amount: number; payout: number; centered?: boolean; payoutTarget?: RefObject<HTMLElement | null> }) {
  const reduce = useReducedMotion();
  const settledLoss = payout === 0;
  const settledWin = payout > 0;
  return (
    <motion.div
      className={cn('pointer-events-none absolute z-[3] [--chip:clamp(22px,2.3vw,30px)]', centered ? '-translate-x-1/2 -translate-y-1/2' : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2')}
      initial={{ opacity: 0, scale: 0.6, y: -10 }}
      animate={settledLoss ? { opacity: 0, scale: 0.85, y: 0, transition: { delay: 0.35, duration: 0.5 } } : { opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.7, transition: { duration: 0.18 } }}
      transition={SPRING.snappy}
    >
      <div className={cn('relative rounded-full', settledWin && 'shadow-[0_0_0_2px_var(--color-win),0_0_16px_2px_rgba(61,220,151,0.45)]')} style={{ width: 'var(--chip)', height: 'var(--chip)' }}>
        {amount >= 1_000 ? (
          <div className="absolute inset-0 translate-y-[3px] opacity-80">
            <CasinoChip value={amount} size={100} className="h-full w-full" />
          </div>
        ) : null}
        <CasinoChip value={amount} size={100} className="relative h-full w-full" />
      </div>
      {settledWin ? (
        <>
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.15, ...SPRING.snappy }}
            className="tabular absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-win px-1.5 py-[1px] text-[11px] font-bold text-[#04150d] shadow-[0_4px_12px_-4px_rgba(61,220,151,0.8)]"
          >
            +{formatCredits(payout)}
          </motion.div>
          {!reduce && payoutTarget ? <GlideChip amount={payout} target={payoutTarget} /> : null}
        </>
      ) : null}
    </motion.div>
  );
}

/** A payout chip that flies from the winning spot to the win readout. */
function GlideChip({ amount, target }: { amount: number; target: RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [delta, setDelta] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const t = target.current;
    if (!el || !t) return;
    const a = el.getBoundingClientRect();
    const b = t.getBoundingClientRect();
    if (!b.width) return;
    setDelta({ x: b.left + b.width / 2 - (a.left + a.width / 2), y: b.top + b.height / 2 - (a.top + a.height / 2) });
  }, [target]);
  return (
    <motion.div
      ref={ref}
      className="absolute inset-0 z-[5]"
      initial={{ opacity: 0, x: 0, y: 0, scale: 1 }}
      animate={delta ? { opacity: [0, 1, 1, 0], x: [0, 0, delta.x, delta.x], y: [0, -6, delta.y, delta.y], scale: [1, 1.05, 0.7, 0.6] } : { opacity: 0 }}
      transition={{ duration: 1.25, delay: 0.9, times: [0, 0.12, 0.88, 1], ease: [0.65, 0, 0.35, 1] }}
    >
      <CasinoChip value={amount} size={100} className="h-full w-full" />
    </motion.div>
  );
}
