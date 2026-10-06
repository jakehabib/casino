'use client';
import { memo, useEffect, useRef, useState } from 'react';
import type { Pos, SpinWin } from '../shared/types';

/**
 * Overcharge cascade effects, drawn over the reel window in a
 * `reels×100 by rows×100` SVG space (cells are square, so circles stay round):
 *
 *  • way wins     — circuit traces route through the reel gutters, linking the
 *                   winning cells reel to reel, with current flowing along them.
 *  • zap          — when winning cells are removed, an arc of lightning jumps
 *                   cell to cell, each cell implodes into a white-hot point,
 *                   throws sparks and a discharge ring.
 *  • charged fall — new symbols fall through a charge streak in their reel and
 *                   lock in with corner brackets.
 *
 * Purely cosmetic and deterministic (jitter is hashed from positions, never
 * random). Renders nothing under reduced motion.
 */

const CSS = `
@keyframes oc-ring { 0% { transform: scale(.25); opacity: .95; } 100% { transform: scale(1.18); opacity: 0; } }
@keyframes oc-flash { 0% { transform: scale(.5); opacity: 0; } 18% { opacity: 1; } 100% { transform: scale(1.25); opacity: 0; } }
@keyframes oc-spark { 0% { transform: translateY(0); opacity: 0; } 15% { opacity: 1; } 100% { transform: translateY(-24px); opacity: 0; } }
@keyframes oc-arc { 0% { stroke-dashoffset: 1; opacity: 1; } 25% { stroke-dashoffset: 0; opacity: 1; } 55% { opacity: .85; } 100% { stroke-dashoffset: 0; opacity: 0; } }
@keyframes oc-streak { 0% { transform: translateY(-100%); opacity: 0; } 20% { opacity: 1; } 75% { transform: translateY(0); opacity: 1; } 100% { transform: translateY(0); opacity: 0; } }
@keyframes oc-lock { 0%, 40% { opacity: 0; transform: scale(1.25); } 60% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1); } }
@keyframes oc-flow { to { stroke-dashoffset: -24; } }
@keyframes oc-trace-in { from { opacity: 0; } to { opacity: 1; } }
.oc-fx * { transform-box: fill-box; transform-origin: center; }
`;

const hash = (a: number, b: number, c = 0) => {
  let x = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967295;
};

/** Jagged lightning between two points (deterministic). */
function bolt(x1: number, y1: number, x2: number, y2: number, seed: number): string {
  const n = 5;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  let d = `M${x1.toFixed(1)} ${y1.toFixed(1)}`;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const j = (hash(seed, i) - 0.5) * Math.min(26, len * 0.32);
    d += ` L${(x1 + dx * t + nx * j).toFixed(1)} ${(y1 + dy * t + ny * j).toFixed(1)}`;
  }
  return `${d} L${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/** Link every removed cell to its nearest neighbour on the next reel → left-to-right chains. */
function chainArcs(cells: Pos[]): string[] {
  const byReel = new Map<number, Pos[]>();
  for (const p of cells) byReel.set(p[0], [...(byReel.get(p[0]) ?? []), p]);
  const out: string[] = [];
  for (const [r, list] of byReel) {
    const next = byReel.get(r + 1);
    if (!next) continue;
    for (const [, y] of list) {
      let best = next[0];
      for (const q of next) if (Math.abs(q[1] - y) < Math.abs(best[1] - y)) best = q;
      out.push(bolt(r * 100 + 50, y * 100 + 50, best[0] * 100 + 50, best[1] * 100 + 50, r * 31 + y * 7 + best[1]));
    }
  }
  return out;
}

/** Orthogonal gutter routes between winning cells on adjacent reels (deduped). */
function traces(wins: SpinWin[]): { paths: string[]; pins: [number, number][] } {
  const seen = new Set<string>();
  const paths: string[] = [];
  const pins = new Map<string, [number, number]>();
  for (const w of wins) {
    if (w.kind !== 'ways' && w.kind !== 'line') continue;
    const byReel = new Map<number, number[]>();
    for (const [r, y] of w.positions) byReel.set(r, [...(byReel.get(r) ?? []), y]);
    for (const [r, ys] of byReel) {
      const next = byReel.get(r + 1);
      if (!next) continue;
      for (const a of ys)
        for (const b of next) {
          const k = `${r}:${a}:${b}`;
          if (seen.has(k)) continue;
          seen.add(k);
          const gx = (r + 1) * 100;
          const ya = a * 100 + 50;
          const yb = b * 100 + 50;
          paths.push(`M${gx - 7} ${ya} H${gx} V${yb} H${gx + 7}`);
          pins.set(`${gx - 7}:${ya}`, [gx - 7, ya]);
          pins.set(`${gx + 7}:${yb}`, [gx + 7, yb]);
        }
    }
  }
  return { paths, pins: [...pins.values()] };
}

interface Burst {
  id: number;
  cells: Pos[];
  arcs: string[];
  /** new cells per reel (refill depth). */
  depth: number[];
}

let burstSeq = 1;

export const CascadeFx = memo(function CascadeFx({
  reels,
  rows,
  removing,
  wins,
  color,
  hot,
  reduced,
  turbo,
}: {
  reels: number;
  rows: number;
  /** posKey set of cells being removed right now (from the controller). */
  removing: Set<string> | null;
  /** Wins currently presented. */
  wins: SpinWin[];
  color: string;
  /** Chain at max — the effects run amber. */
  hot: boolean;
  reduced: boolean;
  turbo: boolean;
}) {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (!removing || removing.size === 0 || reduced) return;
    const cells = [...removing].map((k) => k.split(':').map(Number) as Pos).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const depth = new Array(reels).fill(0);
    for (const [r] of cells) depth[r]++;
    const b: Burst = { id: burstSeq++, cells, arcs: chainArcs(cells), depth };
    setBursts((list) => [...list.slice(-2), b]);
    const t = setTimeout(() => setBursts((list) => list.filter((x) => x.id !== b.id)), 1300);
    timers.current.push(t);
  }, [removing, reels, reduced]);

  if (reduced) return null;
  const W = reels * 100;
  const H = rows * 100;
  const tr = wins.length ? traces(wins) : null;
  const c = hot ? '#ffbf5a' : color;
  const k = turbo ? 0.6 : 1;
  const ms = (v: number) => `${Math.round(v * k)}ms`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="oc-fx pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
      <style>{CSS}</style>
      <defs>
        <linearGradient id="oc-streak-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c} stopOpacity="0" />
          <stop offset="0.75" stopColor={c} stopOpacity="0.1" />
          <stop offset="1" stopColor={c} stopOpacity="0.38" />
        </linearGradient>
      </defs>

      {tr ? (
        <g style={{ animation: 'oc-trace-in 220ms ease-out both' }}>
          {tr.paths.map((d) => (
            <g key={d}>
              <path d={d} fill="none" stroke={c} strokeOpacity="0.28" strokeWidth="7" strokeLinejoin="round" style={{ filter: 'blur(3px)' }} vectorEffect="non-scaling-stroke" />
              <path d={d} fill="none" stroke={c} strokeOpacity="0.85" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              <path
                d={d}
                fill="none"
                stroke="#ffffff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="3 21"
                vectorEffect="non-scaling-stroke"
                style={{ animation: 'oc-flow 700ms linear infinite' }}
              />
            </g>
          ))}
          {tr.pins.map(([x, y]) => (
            <circle key={`${x}:${y}`} cx={x} cy={y} r="3.4" fill="#ffffff" stroke={c} strokeWidth="2" />
          ))}
        </g>
      ) : null}

      {bursts.map((b) => (
        <g key={b.id}>
          {/* charge streaks down each reel that refills */}
          {b.depth.map((n, r) =>
            n > 0 ? (
              <g key={`s${r}`} clipPath={`url(#oc-clip-${b.id}-${r})`}>
                <clipPath id={`oc-clip-${b.id}-${r}`}>
                  <rect x={r * 100} y={0} width={100} height={n * 100} />
                </clipPath>
                <g style={{ animation: `oc-streak ${ms(480)} cubic-bezier(.3,0,.2,1) ${ms(200 + r * 35)} both` }}>
                  <rect x={r * 100 + 22} y={0} width={56} height={n * 100} fill="url(#oc-streak-g)" />
                  <rect x={r * 100 + 14} y={n * 100 - 3} width={72} height={3} rx="1.5" fill="#ffffff" opacity="0.85" />
                </g>
              </g>
            ) : null,
          )}
          {/* lightning chain between the removed cells */}
          {b.arcs.map((d, i) => (
            <g key={`a${i}`}>
              <path
                d={d}
                pathLength={1}
                fill="none"
                stroke={c}
                strokeOpacity="0.5"
                strokeWidth="7"
                strokeLinejoin="round"
                strokeDasharray="1"
                vectorEffect="non-scaling-stroke"
                style={{ filter: 'blur(3px)', animation: `oc-arc ${ms(520)} ease-out both` }}
              />
              <path
                d={d}
                pathLength={1}
                fill="none"
                stroke="#ffffff"
                strokeWidth="1.6"
                strokeLinejoin="round"
                strokeDasharray="1"
                vectorEffect="non-scaling-stroke"
                style={{ animation: `oc-arc ${ms(520)} ease-out both` }}
              />
            </g>
          ))}
          {b.cells.map(([r, y]) => {
            const cx = r * 100 + 50;
            const cy = y * 100 + 50;
            return (
              <g key={`c${r}:${y}`}>
                <circle cx={cx} cy={cy} r="42" fill="url(#oc-zap)" style={{ animation: `oc-flash ${ms(380)} ease-out both` }} />
                <circle cx={cx} cy={cy} r="46" fill="none" stroke={c} strokeWidth="2" vectorEffect="non-scaling-stroke" style={{ animation: `oc-ring ${ms(560)} cubic-bezier(.2,.7,.2,1) ${ms(60)} both` }} />
                {[0, 1, 2, 3, 4, 5].map((i) => {
                  const a = i * 60 + hash(r, y, i) * 40;
                  return (
                    <g key={i} transform={`rotate(${a.toFixed(1)} ${cx} ${cy})`}>
                      <line
                        x1={cx}
                        y1={cy - 16}
                        x2={cx}
                        y2={cy - 27}
                        stroke={i % 2 ? '#ffffff' : c}
                        strokeWidth="2"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                        style={{ animation: `oc-spark ${ms(420)} ease-out ${ms(80 + i * 12)} both` }}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}
          {/* new symbols lock in */}
          {b.depth.map((n, r) =>
            Array.from({ length: n }, (_, y) => {
              const x0 = r * 100 + 6;
              const y0 = y * 100 + 6;
              const s = 88;
              const L = 14;
              return (
                <path
                  key={`l${r}:${y}`}
                  d={`M${x0} ${y0 + L} V${y0} H${x0 + L} M${x0 + s - L} ${y0} H${x0 + s} V${y0 + L} M${x0 + s} ${y0 + s - L} V${y0 + s} H${x0 + s - L} M${x0 + L} ${y0 + s} H${x0} V${y0 + s - L}`}
                  fill="none"
                  stroke={c}
                  strokeWidth="1.6"
                  vectorEffect="non-scaling-stroke"
                  style={{ animation: `oc-lock ${ms(900)} ease-out ${ms(260 + r * 35)} both` }}
                />
              );
            }),
          )}
        </g>
      ))}
    </svg>
  );
});
