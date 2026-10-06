'use client';
import { motion } from 'framer-motion';
import { formatCredits } from '@/lib/format';
import type { PublicSlotDefinition, SlotTheme, SpinWin } from './types';

/**
 * WinOverlay — drawn above the reels while wins are presented.
 *  lines:   each payline is drawn across the reels (animated stroke with glow)
 *  ways / cluster / scatter: a compact amount badge at the win's centroid
 *  (the cells themselves glow via ReelGrid's highlight).
 * Coordinates use a reels×100 by rows×100 viewBox stretched over the window.
 */
export function WinOverlay({
  def,
  theme,
  wins,
  reduced,
  labels = true,
}: {
  def: PublicSlotDefinition;
  theme: SlotTheme;
  wins: SpinWin[];
  reduced: boolean;
  labels?: boolean;
}) {
  const W = def.reels * 100;
  const H = def.rows * 100;
  const lineWins = wins.filter((w) => w.kind === 'line' && w.lineIndex !== undefined && def.paylines);
  const single = wins.length === 1;
  return (
    <div className="absolute inset-0">
      {lineWins.length ? (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
          {lineWins.map((w, i) => {
            const line = def.paylines![w.lineIndex!];
            const pts = line.map((row, r) => `${r * 100 + 50},${row * 100 + 50}`);
            const d = `M ${-10},${line[0] * 100 + 50} L ${pts.join(' L ')} L ${W + 10},${line[line.length - 1] * 100 + 50}`;
            const color = theme.lineColors[w.lineIndex! % theme.lineColors.length];
            return (
              <g key={`${w.lineIndex}-${i}`}>
                <motion.path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeOpacity={0.35}
                  strokeWidth={10}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  style={{ filter: 'blur(4px)' }}
                  initial={reduced ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: single ? 0 : Math.min(i, 8) * 0.04 }}
                />
                <motion.path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={3}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  initial={reduced ? false : { pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: single ? 0 : Math.min(i, 8) * 0.04 }}
                />
              </g>
            );
          })}
        </svg>
      ) : null}
      {labels && single
        ? wins.map((w, i) => {
            let cx: number;
            let cy: number;
            if (w.kind === 'line' && def.paylines && w.lineIndex !== undefined) {
              const last = w.positions[w.positions.length - 1];
              cx = last[0] * 100 + 50;
              cy = last[1] * 100 + 50;
            } else {
              cx = w.positions.reduce((a, p) => a + p[0], 0) / w.positions.length;
              cy = w.positions.reduce((a, p) => a + p[1], 0) / w.positions.length;
              cx = cx * 100 + 50;
              cy = cy * 100 + 50;
            }
            return (
              <motion.div
                key={i}
                className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${(cx / W) * 100}%`, top: `${(cy / H) * 100}%` }}
                initial={reduced ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 26 }}
              >
                <span className="tabular whitespace-nowrap rounded-md border border-white/15 bg-black/75 px-2 py-0.5 text-[11px] font-bold text-white shadow-2 backdrop-blur sm:text-xs">
                  {formatCredits(w.amount)}
                  {w.multiplier > 1 ? <span className="ml-1 text-white/60">×{w.multiplier}</span> : null}
                </span>
              </motion.div>
            );
          })
        : null}
    </div>
  );
}
