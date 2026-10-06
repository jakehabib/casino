'use client';
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import type { CellModel, CellState, PublicSlotDefinition, ReelColumn, SlotTheme } from './types';
import { posKey } from './types';

/**
 * ReelGrid — the reel window.
 *
 *  • Spinning reels show a looping, motion-blurred filler strip (pure CSS
 *    transform animation on a pre-blurred layer → stays on the compositor).
 *  • When a reel stops its final symbols drop in from above with an
 *    overshoot-and-settle spring; reels are stopped one by one by the
 *    controller (staggered), so the stagger lives in the timeline.
 *  • Anticipation: a reel flagged `anticipation` keeps spinning slower and
 *    glows until it stops.
 *  • Cascades: cells keep a stable `key`; removed cells pop out (exit),
 *    survivors fall to their new row and new cells fall in from above
 *    (`dropFrom` rows), staggered per reel.
 *
 * Geometry: square cells; the window keeps `reels / rows` aspect ratio.
 */

const STRIP_CSS = `
@keyframes nova-slot-strip { from { transform: translate3d(0,-50%,0); } to { transform: translate3d(0,0,0); } }
@keyframes nova-slot-glow { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
`;

/** Cosmetic filler order for spinning strips (deterministic; not game RNG). */
function fillerFor(def: PublicSlotDefinition, reel: number, count: number): string[] {
  const pool = def.symbols.filter((s) => s.kind === 'regular' || s.kind === 'wild').map((s) => s.id);
  const out: string[] = [];
  let x = (reel + 1) * 7919;
  for (let i = 0; i < count; i++) {
    // Math.imul keeps the LCG in 32-bit integer space (a float multiply loses the low bits).
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    out.push(pool[(x >>> 8) % pool.length]);
  }
  return out;
}

export interface ReelGridProps {
  def: PublicSlotDefinition;
  theme: SlotTheme;
  columns: ReelColumn[];
  spinning: boolean[];
  anticipation: boolean[];
  /** Highlighted cells (posKey) while presenting wins; others are dimmed. */
  highlight: Set<string> | null;
  /** Cells flagged as just transformed (posKey). */
  transformed: Set<string> | null;
  /** Cells being removed by a cascade (pop out). */
  removing?: Set<string> | null;
  reduced: boolean;
  turbo: boolean;
  /** Rendered above the cells (win lines, labels). */
  overlay?: ReactNode;
  className?: string;
}

export function ReelGrid({ def, theme, columns, spinning, anticipation, highlight, transformed, removing = null, reduced, turbo, overlay, className }: ReelGridProps) {
  const { reels, rows } = def;
  return (
    <div
      className={cn('relative w-full select-none overflow-hidden', className)}
      style={{ aspectRatio: `${reels} / ${rows}`, background: theme.reelBackground }}
      role="img"
      aria-label={`${reels} by ${rows} reels`}
    >
      <style>{STRIP_CSS}</style>
      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${reels}, minmax(0, 1fr))` }}>
        {columns.map((col, r) => (
          <Reel
            key={r}
            def={def}
            theme={theme}
            reel={r}
            column={col}
            spinning={spinning[r] ?? false}
            anticipation={anticipation[r] ?? false}
            highlight={highlight}
            transformed={transformed}
            removing={removing}
            reduced={reduced}
            turbo={turbo}
            divider={r > 0 ? theme.reelDivider : undefined}
          />
        ))}
      </div>
      {overlay ? <div className="pointer-events-none absolute inset-0">{overlay}</div> : null}
    </div>
  );
}

const Reel = memo(function Reel({
  def,
  theme,
  reel,
  column,
  spinning,
  anticipation,
  highlight,
  transformed,
  removing,
  reduced,
  turbo,
  divider,
}: {
  def: PublicSlotDefinition;
  theme: SlotTheme;
  reel: number;
  column: ReelColumn;
  spinning: boolean;
  anticipation: boolean;
  highlight: Set<string> | null;
  transformed: Set<string> | null;
  removing: Set<string> | null;
  reduced: boolean;
  turbo: boolean;
  divider?: string;
}) {
  const rows = def.rows;
  const filler = useMemo(() => fillerFor(def, reel, rows * 2), [def, reel, rows]);
  const pad = theme.cellPadding ?? 0.08;
  const stripDur = (anticipation ? 520 : turbo ? 180 : 240) * (rows / 3);
  // Keep the blurred strip briefly under the landing symbols so a stop never shows an empty reel.
  const [fading, setFading] = useState(false);
  const was = useRef(spinning);
  useEffect(() => {
    if (was.current && !spinning) {
      setFading(true);
      const t = setTimeout(() => setFading(false), 240);
      was.current = spinning;
      return () => clearTimeout(t);
    }
    was.current = spinning;
  }, [spinning]);
  const showStrip = spinning || fading;
  // A reel filled by one wild (expanded) gets a single column treatment.
  const fullWild = !spinning && column.length > 0 && def.expandingWilds !== 'never' && def.wilds.includes(column[0].symbol) && column.every((c) => c.symbol === column[0].symbol);

  return (
    <div className="relative h-full overflow-hidden" style={divider ? { boxShadow: `inset 1px 0 0 ${divider}` } : undefined}>
      {/* anticipation glow */}
      {anticipation && spinning ? (
        <div
          className="pointer-events-none absolute inset-0 z-[2]"
          style={{
            boxShadow: `inset 0 0 0 2px ${theme.highlight}, inset 0 0 28px ${theme.highlight}`,
            animation: reduced ? undefined : 'nova-slot-glow 0.6s ease-in-out infinite',
          }}
        />
      ) : null}

      {fullWild ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-[3%] z-0 rounded-[10px]"
          initial={{ opacity: 0, scaleY: 0.3 }}
          animate={{ opacity: 1, scaleY: 1 }}
          transition={{ duration: reduced ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
          style={{ boxShadow: `0 0 0 2px ${theme.highlight}, 0 0 34px -4px ${theme.highlight}`, background: `linear-gradient(180deg, ${theme.highlight}22, transparent 30%, transparent 70%, ${theme.highlight}22)` }}
        />
      ) : null}
      {showStrip ? (
        <div className="absolute inset-0 transition-opacity duration-200" style={{ opacity: spinning ? 1 : 0 }}>
          {reduced ? (
            <div className="absolute inset-0 animate-pulse bg-white/[0.03]" />
          ) : (
            <div
              className="absolute inset-x-0 top-0"
              style={{ height: `${(filler.length * 2 * 100) / rows}%`, animation: `nova-slot-strip ${stripDur}ms linear infinite`, willChange: 'transform' }}
            >
              <div className="h-full" style={{ filter: 'blur(1.4px)', opacity: 0.85 }}>
                {[...filler, ...filler].map((s, i) => (
                  <div key={i} style={{ height: `${100 / (filler.length * 2)}%`, padding: `${pad * 100}%` }} className="flex items-center justify-center">
                    <div className="aspect-square h-full max-w-full">{theme.renderSymbol(s, { state: 'idle', blurred: true })}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}
      {spinning ? null : (
        <AnimatePresence>
          {column.map((cell, y) => (
            <Cell
              key={cell.key}
              cell={cell}
              reel={reel}
              row={y}
              rows={rows}
              theme={theme}
              pad={pad}
              reduced={reduced}
              turbo={turbo}
              state={
                removing?.has(posKey(reel, y))
                  ? 'pop'
                  : transformed?.has(posKey(reel, y))
                  ? 'transform'
                  : highlight
                    ? highlight.has(posKey(reel, y))
                      ? 'win'
                      : 'dim'
                    : (cell.state ?? 'idle')
              }
            />
          ))}
        </AnimatePresence>
      )}
    </div>
  );
});

const Cell = memo(function Cell({
  cell,
  reel,
  row,
  rows,
  theme,
  pad,
  reduced,
  turbo,
  state,
}: {
  cell: CellModel;
  reel: number;
  row: number;
  rows: number;
  theme: SlotTheme;
  pad: number;
  reduced: boolean;
  turbo: boolean;
  state: CellState;
}) {
  const drop = cell.dropFrom ?? 0;
  const landing = drop >= rows; // a reel stop (whole column falls in)
  const transition = reduced
    ? { duration: 0 }
    : landing
      ? { type: 'spring' as const, stiffness: turbo ? 900 : 620, damping: turbo ? 40 : 24, mass: 0.8 }
      : { type: 'spring' as const, stiffness: 520, damping: 32, mass: 0.9, delay: turbo ? 0 : reel * 0.035 + (rows - row) * 0.015 };
  return (
    <motion.div
      className="absolute inset-x-0 top-0"
      data-cell={posKey(reel, row)}
      data-symbol={cell.symbol}
      style={{ height: `${100 / rows}%`, padding: `${pad * 100}%`, zIndex: state === 'win' ? 1 : 0 }}
      initial={reduced ? { y: `${row * 100}%`, opacity: 0 } : { y: `${(row - drop) * 100}%`, opacity: 1 }}
      animate={{ y: `${row * 100}%`, opacity: 1 }}
      exit={reduced ? { opacity: 0, transition: { duration: 0.1 } } : { scale: 0.2, opacity: 0, filter: 'brightness(2.2)', transition: { duration: turbo ? 0.14 : 0.28, ease: [0.4, 0, 1, 1] } }}
      transition={transition}
    >
      <motion.div
        className="relative mx-auto aspect-square h-full max-w-full"
        animate={
          reduced
            ? { opacity: state === 'dim' ? 0.35 : 1 }
            : state === 'pop'
              ? { scale: 0.15, opacity: 0, filter: 'brightness(2.4)' }
              : state === 'win'
              ? { scale: [1, 1.09, 1], opacity: 1, filter: 'saturate(1.15) brightness(1.08)' }
              : state === 'dim'
                ? { scale: 1, opacity: 0.32, filter: 'saturate(0.5) brightness(0.8)' }
                : state === 'transform'
                  ? { scale: [0.6, 1.12, 1], opacity: 1, filter: 'saturate(1) brightness(1)' }
                  : { scale: 1, opacity: 1, filter: 'saturate(1) brightness(1)' }
        }
        transition={
          state === 'win'
            ? { scale: { duration: 0.9, repeat: Infinity, ease: 'easeInOut' }, default: { duration: 0.2 } }
            : state === 'transform'
              ? { duration: 0.45, ease: [0.34, 1.4, 0.64, 1] }
              : state === 'pop'
              ? { duration: turbo ? 0.12 : 0.24, ease: [0.4, 0, 1, 1] }
              : { duration: 0.22 }
        }
      >
        {state === 'win' ? (
          <span
            aria-hidden
            className="absolute -inset-[4%] rounded-[18%]"
            style={{ boxShadow: `0 0 0 2px ${theme.highlight}, 0 0 22px -2px ${theme.highlight}`, background: `radial-gradient(closest-side, ${theme.highlight}33, transparent)` }}
          />
        ) : null}
        <div className="relative h-full w-full">{theme.renderSymbol(cell.symbol, { state })}</div>
      </motion.div>
    </motion.div>
  );
});
