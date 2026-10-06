'use client';
import { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatCredits } from '@/lib/format';
import type { GridTransform, Pos, SpinModifier, SpinOutcome, SpinWin } from '@/engines/slots/types';
import { SF_SYMBOL_COLOR, SF_SYMBOL_NAMES, StarforgedGlyph, starPath } from './symbols';

/**
 * Starforged feature effects. Everything here is drawn inside the reel window
 * (ReelGrid's overlay layer) in a `reels*100 × rows*100` coordinate space, and
 * only animates what the server outcome already decided.
 */

const U = 100;

// ─── cluster shapes ─────────────────────────────────────────────────────────

/** Outer boundary of a set of cells as edge segments (shared edges dropped). */
function perimeter(positions: Pos[]): string {
  const set = new Set(positions.map(([r, y]) => `${r}:${y}`));
  const has = (r: number, y: number) => set.has(`${r}:${y}`);
  const segs: string[] = [];
  for (const [r, y] of positions) {
    const x0 = r * U;
    const y0 = y * U;
    if (!has(r, y - 1)) segs.push(`M${x0} ${y0}H${x0 + U}`);
    if (!has(r, y + 1)) segs.push(`M${x0} ${y0 + U}H${x0 + U}`);
    if (!has(r - 1, y)) segs.push(`M${x0} ${y0}V${y0 + U}`);
    if (!has(r + 1, y)) segs.push(`M${x0 + U} ${y0}V${y0 + U}`);
  }
  return segs.join('');
}

/** The cluster cell closest to the cluster's centroid (keeps the label inside the shape). */
function anchor(positions: Pos[]): Pos {
  const cx = positions.reduce((a, p) => a + p[0], 0) / positions.length;
  const cy = positions.reduce((a, p) => a + p[1], 0) / positions.length;
  let best = positions[0];
  let bd = Infinity;
  for (const p of positions) {
    const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2;
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

export function ClusterOverlay({ wins, reels, rows, reduced }: { wins: SpinWin[]; reels: number; rows: number; reduced: boolean }) {
  const W = reels * U;
  const H = rows * U;
  const shapes = useMemo(
    () =>
      wins.map((w) => ({
        w,
        d: w.kind === 'cluster' ? perimeter(w.positions) : '',
        color: SF_SYMBOL_COLOR[w.symbol] ?? '#ecd49a',
        at: anchor(w.positions),
      })),
    [wins],
  );
  return (
    <div className="absolute inset-0">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        {shapes.map(({ w, d, color }, i) =>
          w.kind === 'cluster' ? (
            <g key={i}>
              {w.positions.map(([r, y]) => (
                <motion.rect
                  key={`${r}:${y}`}
                  x={r * U}
                  y={y * U}
                  width={U}
                  height={U}
                  fill={color}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.09 }}
                  transition={{ duration: reduced ? 0 : 0.3 }}
                />
              ))}
              <motion.path
                d={d}
                fill="none"
                stroke={color}
                strokeOpacity={0.45}
                strokeWidth={9}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                style={{ filter: 'blur(5px)' }}
                initial={reduced ? false : { pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: Math.min(i, 4) * 0.08 }}
              />
              <motion.path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={3}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                initial={reduced ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: Math.min(i, 4) * 0.08 }}
              />
            </g>
          ) : (
            <g key={i}>
              {w.positions.map(([r, y], k) => (
                <motion.circle
                  key={k}
                  cx={r * U + U / 2}
                  cy={y * U + U / 2}
                  r={U * 0.48}
                  fill="none"
                  stroke={color}
                  strokeWidth={2.4}
                  vectorEffect="non-scaling-stroke"
                  initial={reduced ? false : { scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 20, delay: k * 0.05 }}
                />
              ))}
            </g>
          ),
        )}
      </svg>
      {shapes.map(({ w, at, color }, i) => (
        <motion.div
          key={i}
          className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${((at[0] + 0.5) / reels) * 100}%`, top: `${((at[1] + 0.5) / rows) * 100}%` }}
          initial={reduced ? false : { scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 26, delay: reduced ? 0 : 0.18 + Math.min(i, 4) * 0.08 }}
        >
          <span
            className="tabular flex items-center gap-1 whitespace-nowrap rounded-md border bg-[#041416]/85 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-2 backdrop-blur sm:px-2 sm:text-xs"
            style={{ borderColor: `${color}66` }}
          >
            {formatCredits(w.amount)}
            {w.kind === 'cluster' ? <span className="font-semibold text-white/50">· {w.count}</span> : null}
            {w.multiplier > 1 ? <span style={{ color }}>×{w.multiplier}</span> : null}
          </span>
        </motion.div>
      ))}
    </div>
  );
}

// ─── modifier reveal ─────────────────────────────────────────────────────────

export const MODIFIER_COPY: Record<SpinModifier['kind'], string> = {
  STAR_SURGE: 'Star Surge',
  RELIC_WILDS: 'Relic Wilds',
  ORRERY: 'Orrery',
};

export function modifierSub(m: SpinModifier): string {
  if (m.kind === 'STAR_SURGE') return `${m.positions.length} × ${SF_SYMBOL_NAMES[m.symbol] ?? m.symbol}`;
  if (m.kind === 'RELIC_WILDS') return `${m.positions.length} wilds forged`;
  return 'Spin multiplier';
}

/** Orrery mini-mechanism (used by the reveal seal and the feature strip). */
export function OrreryGlyph({ spin = false, reduced = false }: { spin?: boolean; reduced?: boolean }) {
  const turn = (dur: number, dir = 1) =>
    spin && !reduced ? { animate: { rotate: 360 * dir }, transition: { duration: dur, ease: [0.3, 0, 0.2, 1] as const } } : {};
  return (
    <>
      <circle cx="50" cy="50" r="9" fill="url(#sf-brass)" stroke="#4d3411" strokeWidth="1" />
      <motion.g {...turn(1.1)}>
        <circle cx="50" cy="50" r="22" fill="none" stroke="#d9b46a" strokeWidth="1.6" />
        <circle cx="72" cy="50" r="4" fill="#9fe8ff" />
      </motion.g>
      <motion.g {...turn(1.4, -1)}>
        <circle cx="50" cy="50" r="34" fill="none" stroke="#d9b46a" strokeOpacity="0.7" strokeWidth="1.2" strokeDasharray="2 3" />
        <circle cx="50" cy="16" r="5" fill="url(#sf-brass)" stroke="#4d3411" strokeWidth="0.8" />
      </motion.g>
      <motion.g {...turn(1.7)}>
        <circle cx="50" cy="50" r="44" fill="none" stroke="#d9b46a" strokeOpacity="0.5" strokeWidth="0.8" />
        <circle cx="19" cy="81" r="3" fill="#f59ab5" />
      </motion.g>
    </>
  );
}

/** Seal that unfolds over the reels announcing the modifier, before it changes the grid. */
export function ModifierReveal({ modifier, reduced }: { modifier: SpinModifier | null; reduced: boolean }) {
  return (
    <AnimatePresence>
      {modifier ? (
        <motion.div
          key={modifier.kind}
          className="absolute inset-0 z-20 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: reduced ? 0 : 0.3 } }}
        >
          <div className="absolute inset-0 bg-[#020a0b]/55" />
          <motion.div
            className="relative flex flex-col items-center"
            initial={reduced ? false : { scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={reduced ? undefined : { scale: 1.25, opacity: 0, transition: { duration: 0.3 } }}
            transition={{ type: 'spring', stiffness: 320, damping: 20 }}
          >
            <div className="relative h-[clamp(72px,24vw,132px)] w-[clamp(72px,24vw,132px)]">
              <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible">
                <circle cx="50" cy="50" r="60" fill="url(#sf-nova)" opacity="0.55" />
                <motion.g
                 
                  initial={{ rotate: -90 }}
                  animate={{ rotate: 0 }}
                  transition={{ duration: reduced ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
                >
                  <circle cx="50" cy="50" r="48" fill="#06191c" stroke="url(#sf-brass)" strokeWidth="3.4" />
                  {Array.from({ length: 48 }).map((_, i) => {
                    const a = (i * Math.PI) / 24;
                    const r2 = i % 4 === 0 ? 40.5 : 43;
                    return <line key={i} x1={50 + Math.cos(a) * 45.5} y1={50 + Math.sin(a) * 45.5} x2={50 + Math.cos(a) * r2} y2={50 + Math.sin(a) * r2} stroke="#d9b46a" strokeWidth="0.9" />;
                  })}
                </motion.g>
                <circle cx="50" cy="50" r="38" fill="none" stroke="#9fe8ff" strokeOpacity="0.35" strokeWidth="0.8" />
              </svg>
              <div className="absolute inset-[20%]">
                {modifier.kind === 'ORRERY' ? (
                  <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible">
                    <OrreryGlyph spin reduced={reduced} />
                  </svg>
                ) : (
                  <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible">
                    <StarforgedGlyph symbol={modifier.symbol} />
                  </svg>
                )}
              </div>
              {modifier.kind === 'ORRERY' ? (
                <motion.div
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-[#f5d58999] bg-[#06191c] px-2.5 py-0.5 text-sm font-black text-gold-bright shadow-3 sm:text-base"
                  initial={reduced ? false : { scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: reduced ? 0 : 0.55, type: 'spring', stiffness: 500, damping: 18 }}
                >
                  ×{modifier.multiplier}
                </motion.div>
              ) : null}
            </div>
            <div className="mt-2.5 text-center sm:mt-3">
              <div className="text-[15px] font-semibold uppercase tracking-[0.3em] text-[#f1dca4] drop-shadow-[0_2px_8px_#000] sm:text-xl">{MODIFIER_COPY[modifier.kind]}</div>
              <div className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[#9fe8ff]/80 sm:text-xs">{modifierSub(modifier)}</div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

// ─── transform effects ───────────────────────────────────────────────────────

const ctr = ([r, y]: Pos) => [r * U + U / 2, y * U + U / 2] as const;

export function TransformFx({ transform, reels, rows, reduced, turbo }: { transform: GridTransform | null; reels: number; rows: number; reduced: boolean; turbo: boolean }) {
  const W = reels * U;
  const H = rows * U;
  const k = turbo ? 0.55 : 1;
  const key = transform ? `${transform.kind}:${transform.positions.map((p) => p.join('.')).join('|')}` : 'none';
  if (reduced) return null;
  return (
    <AnimatePresence>
      {transform ? (
        <motion.svg
          key={key}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 z-[15] h-full w-full overflow-visible"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35 } }}
        >
          {transform.kind === 'STAR_SURGE'
            ? transform.positions.map((p, i) => {
                const [x, y] = ctr(p);
                const sx = W / 2;
                const sy = H / 2;
                const color = SF_SYMBOL_COLOR[transform.symbol] ?? '#ecd49a';
                const d = `M${sx} ${sy} Q${(sx + x) / 2 + (y - sy) * 0.35} ${(sy + y) / 2 - (x - sx) * 0.35} ${x} ${y}`;
                return (
                  <g key={i}>
                    <motion.path
                      d={d}
                      fill="none"
                      stroke={color}
                      strokeWidth={3}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      initial={{ pathLength: 0, opacity: 1 }}
                      animate={{ pathLength: [0, 1, 1], opacity: [1, 1, 0] }}
                      transition={{ duration: 0.55 * k, delay: i * 0.035 * k, times: [0, 0.6, 1] }}
                    />
                    <motion.path
                      d={starPath(x, y, 4, 34, 7)}
                      fill="#ffffff"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: [0, 1.1, 0], opacity: [0, 1, 0] }}
                      transition={{ duration: 0.45 * k, delay: (0.3 + i * 0.035) * k }}
                    />
                  </g>
                );
              })
            : null}
          {transform.kind === 'RELIC_WILDS'
            ? transform.positions.map((p, i) => {
                const [x, y] = ctr(p);
                return (
                  <g key={i}>
                    <motion.circle
                      cx={x}
                      cy={y}
                      r={46}
                      fill="none"
                      stroke="#f1dca4"
                      strokeWidth={3}
                      vectorEffect="non-scaling-stroke"
                      initial={{ scale: 2.4, opacity: 0 }}
                      animate={{ scale: [2.4, 1, 1.15], opacity: [0, 1, 0] }}
                      transition={{ duration: 0.6 * k, delay: i * 0.09 * k, times: [0, 0.55, 1] }}
                    />
                    <motion.rect
                      x={x - 2}
                      y={y - 120}
                      width={4}
                      height={120}
                      fill="url(#sf-brass-h)"
                      initial={{ scaleY: 0, opacity: 0 }}
                      animate={{ scaleY: [0, 1, 1], opacity: [0, 0.9, 0] }}
                      style={{ originY: 1 }}
                      transition={{ duration: 0.5 * k, delay: i * 0.09 * k }}
                    />
                  </g>
                );
              })
            : null}
          {transform.kind === 'SUPERNOVA' && transform.origin
            ? (() => {
                const [x, y] = ctr(transform.origin);
                const [or, oy] = transform.origin;
                const r0 = Math.max(0, or - 1);
                const y0 = Math.max(0, oy - 1);
                const r1 = Math.min(reels - 1, or + 1);
                const y1 = Math.min(rows - 1, oy + 1);
                return (
                  <g>
                    <motion.rect
                      x={r0 * U}
                      y={y0 * U}
                      width={(r1 - r0 + 1) * U}
                      height={(y1 - y0 + 1) * U}
                      fill="#e9fbf8"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 0.6, 0] }}
                      transition={{ duration: 0.55 * k, times: [0, 0.25, 1] }}
                    />
                    <motion.circle cx={x} cy={y} r={95} fill="url(#sf-nova)" initial={{ scale: 0.25, opacity: 1 }} animate={{ scale: 2.4, opacity: 0 }} transition={{ duration: 0.75 * k, ease: 'easeOut' }} />
                    {[0, 0.12].map((d) => (
                      <motion.circle
                        key={d}
                        cx={x}
                        cy={y}
                        r={40}
                        fill="none"
                        stroke="#e9fbf8"
                        strokeWidth={5}
                        vectorEffect="non-scaling-stroke"
                        initial={{ scale: 0.3, opacity: 1 }}
                        animate={{ scale: 4.2, opacity: 0 }}
                        transition={{ duration: 0.75 * k, delay: d * k, ease: [0.2, 0.7, 0.3, 1] }}
                      />
                    ))}
                    <motion.rect
                      x={r0 * U + 3}
                      y={y0 * U + 3}
                      width={(r1 - r0 + 1) * U - 6}
                      height={(y1 - y0 + 1) * U - 6}
                      rx={14}
                      fill="none"
                      stroke="#9fe8ff"
                      strokeWidth={2.4}
                      vectorEffect="non-scaling-stroke"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 1, 0.6] }}
                      transition={{ duration: 0.6 * k, delay: 0.15 * k }}
                    />
                  </g>
                );
              })()
            : null}
        </motion.svg>
      ) : null}
    </AnimatePresence>
  );
}

// ─── relic collection ────────────────────────────────────────────────────────

export function relicPositions(o: SpinOutcome | null, symbol: string): Pos[] {
  if (!o) return [];
  const g = o.steps[o.steps.length - 1].grid;
  const out: Pos[] = [];
  g.forEach((col, r) => col.forEach((s, y) => s === symbol && out.push([r, y])));
  return out;
}

/** Each relic on the final grid pulses and releases a "+1" that rises toward the meter (cleared on the next spin). */
export function RelicCollectFx({ positions, reels, rows, reduced, active }: { positions: Pos[]; reels: number; rows: number; reduced: boolean; active: boolean }) {
  if (!active) return null;
  return (
    <>
      {positions.map(([r, y], i) => (
        <div
          key={`${r}:${y}`}
          className="absolute z-[16] flex items-center justify-center"
          style={{ left: `${(r / reels) * 100}%`, top: `${(y / rows) * 100}%`, width: `${100 / reels}%`, height: `${100 / rows}%` }}
        >
          <motion.span
            className="absolute inset-[8%] rounded-full"
            style={{ boxShadow: '0 0 0 2px #ffb88a, 0 0 26px #ff8f5a' }}
            initial={{ scale: 1.3, opacity: 0 }}
            animate={{ scale: [1.3, 0.9, 1], opacity: [0, 1, 0.75] }}
            transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : i * 0.06 }}
          />
          <motion.span
            className="relative text-sm font-black text-[#ffd2b0] drop-shadow-[0_2px_6px_#000] sm:text-lg"
            initial={{ y: 0, opacity: 0 }}
            animate={reduced ? { opacity: [1, 0] } : { y: [0, -18, -54], opacity: [0, 1, 0] }}
            transition={{ duration: reduced ? 1.2 : 0.75, delay: reduced ? 0 : i * 0.06, times: reduced ? undefined : [0, 0.3, 1] }}
          >
            +1
          </motion.span>
        </div>
      ))}
    </>
  );
}
