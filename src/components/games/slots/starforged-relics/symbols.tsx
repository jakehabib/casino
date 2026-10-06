'use client';
import type { ReactNode } from 'react';
import type { SymbolRenderOpts } from '../shared/types';

/**
 * Starforged Relics symbol art.
 *
 * Material language: aged brass instruments (chalice, astrolabe, diadem,
 * wild medallion, star gate) set against a deep teal night; the four low
 * symbols are faceted star-forged shards, each with its own cut so they read
 * by silhouette as well as colour at 390px. Facet tones are derived once at
 * module load from a single top-left light direction, so every gem is lit
 * consistently. Shared gradients live in <StarforgedDefs/> (mounted once).
 */

type Pt = [number, number];

// ─── facet geometry (static, computed once) ──────────────────────────────
interface Cut {
  outline: string;
  table: string;
  facets: { d: string; tone: number }[];
}

const LIGHT: Pt = [-0.55, -0.83];

function cut(outer: Pt[], scale: number, center?: Pt): Cut {
  const c: Pt = center ?? [outer.reduce((a, p) => a + p[0], 0) / outer.length, outer.reduce((a, p) => a + p[1], 0) / outer.length];
  const inner = outer.map(([x, y]) => [c[0] + (x - c[0]) * scale, c[1] + (y - c[1]) * scale - 2] as Pt);
  const f = (p: Pt) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  const facets = outer.map((p, i) => {
    const q = outer[(i + 1) % outer.length];
    const mx = (p[0] + q[0]) / 2 - c[0];
    const my = (p[1] + q[1]) / 2 - c[1];
    const len = Math.hypot(mx, my) || 1;
    const dot = (mx / len) * LIGHT[0] + (my / len) * LIGHT[1]; // -1..1
    const tone = Math.max(0, Math.min(3, Math.round((1 - dot) * 1.5)));
    return { d: `M${f(p)} L${f(q)} L${f(inner[(i + 1) % inner.length])} L${f(inner[i])} Z`, tone };
  });
  return { outline: `M${outer.map(f).join(' L')} Z`, table: `M${inner.map(f).join(' L')} Z`, facets };
}

const poly = (n: number, r: number, rot: number, cx = 50, cy = 50, sy = 1): Pt[] =>
  Array.from({ length: n }, (_, i) => {
    const a = rot + (i * Math.PI * 2) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * sy] as Pt;
  });

const CUTS: Record<string, Cut> = {
  // pointy-top hexagon
  GEM_TEAL: cut(poly(6, 38, -Math.PI / 2), 0.5),
  // trillion: soft triangle with bowed sides
  GEM_ROSE: cut(
    [
      [50, 11],
      [73, 43],
      [89, 79],
      [50, 87],
      [11, 79],
      [27, 43],
    ],
    0.46,
    [50, 60],
  ),
  // tall step-cut octagon
  GEM_AZURE: cut(
    [
      [37, 11],
      [63, 11],
      [77, 25],
      [77, 75],
      [63, 89],
      [37, 89],
      [23, 75],
      [23, 25],
    ],
    0.58,
  ),
  // pear / teardrop
  GEM_AMBER: cut(
    [[50, 10] as Pt, ...Array.from({ length: 11 }, (_, i) => {
      const a = (-35 + i * 25) * (Math.PI / 180);
      return [50 + Math.cos(a) * 30, 60 + Math.sin(a) * 28] as Pt;
    })],
    0.5,
    [50, 58],
  ),
};

/** Facet palettes, light → deep. */
const GEM_TONES: Record<string, { tones: string[]; edge: string; table: string; glow: string }> = {
  GEM_TEAL: { tones: ['#c9fff6', '#5fe3d2', '#1f9e95', '#0b5551'], edge: '#063431', table: 'sf-g-teal', glow: '#5fe3d2' },
  GEM_ROSE: { tones: ['#ffe0ea', '#f590b0', '#c4466f', '#6e1736'], edge: '#3d0a1d', table: 'sf-g-rose', glow: '#f59ab5' },
  GEM_AZURE: { tones: ['#e1efff', '#86bcff', '#3d76d6', '#183a7a'], edge: '#0c1f45', table: 'sf-g-azure', glow: '#7fb8ff' },
  GEM_AMBER: { tones: ['#fff1cf', '#f7c15f', '#c97a1e', '#6d3a08'], edge: '#3b1f04', table: 'sf-g-amber', glow: '#f5b65a' },
};

/** Win-outline colour per symbol (cluster shapes, glows). */
export const SF_SYMBOL_COLOR: Record<string, string> = {
  GEM_TEAL: '#5fe3d2',
  GEM_ROSE: '#f59ab5',
  GEM_AZURE: '#86bcff',
  GEM_AMBER: '#f7c15f',
  CHALICE: '#ecd49a',
  ASTROLABE: '#ecd49a',
  STARCROWN: '#f5d589',
  WILD: '#e9fbf8',
  SCATTER: '#9fe8ff',
  SUPERNOVA: '#e9fbf8',
  RELIC: '#ffb88a',
};

export function StarforgedDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }} aria-hidden focusable="false">
      <defs>
        <linearGradient id="sf-brass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbefcc" />
          <stop offset="0.28" stopColor="#dcb873" />
          <stop offset="0.55" stopColor="#98702f" />
          <stop offset="0.78" stopColor="#c9a05a" />
          <stop offset="1" stopColor="#6b4a1c" />
        </linearGradient>
        <linearGradient id="sf-brass-h" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7a5622" />
          <stop offset="0.32" stopColor="#f3dfa6" />
          <stop offset="0.55" stopColor="#b88c45" />
          <stop offset="1" stopColor="#5c3f15" />
        </linearGradient>
        <linearGradient id="sf-brass-d" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b08a49" />
          <stop offset="1" stopColor="#4d3411" />
        </linearGradient>
        <radialGradient id="sf-night" cx="50%" cy="38%" r="70%">
          <stop offset="0" stopColor="#14555a" />
          <stop offset="0.6" stopColor="#0a2f34" />
          <stop offset="1" stopColor="#041417" />
        </radialGradient>
        <radialGradient id="sf-nebula" cx="50%" cy="62%" r="70%">
          <stop offset="0" stopColor="#e9fff9" />
          <stop offset="0.18" stopColor="#7ff0dd" />
          <stop offset="0.45" stopColor="#1c8a8c" />
          <stop offset="0.75" stopColor="#123a5c" />
          <stop offset="1" stopColor="#081626" />
        </radialGradient>
        <radialGradient id="sf-nova" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.16" stopColor="#f2fffc" />
          <stop offset="0.34" stopColor="#8ff3e3" stopOpacity="0.85" />
          <stop offset="0.62" stopColor="#2bb3b0" stopOpacity="0.35" />
          <stop offset="1" stopColor="#0d4a4f" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="sf-relic-core" cx="40%" cy="34%" r="70%">
          <stop offset="0" stopColor="#fff4e6" />
          <stop offset="0.25" stopColor="#ffc18f" />
          <stop offset="0.6" stopColor="#e0663f" />
          <stop offset="1" stopColor="#6b1a12" />
        </radialGradient>
        <radialGradient id="sf-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="sf-relic-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffb88a" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="#ff8f5a" stopOpacity="0.14" />
          <stop offset="1" stopColor="#ff8f5a" stopOpacity="0" />
        </radialGradient>
        {Object.entries(GEM_TONES).map(([k, g]) => (
          <linearGradient key={k} id={g.table} x1="0.15" y1="0" x2="0.85" y2="1">
            <stop offset="0" stopColor={g.tones[0]} />
            <stop offset="0.45" stopColor={g.tones[1]} />
            <stop offset="1" stopColor={g.tones[2]} />
          </linearGradient>
        ))}
        <filter id="sf-drop" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="2.2" stdDeviation="1.8" floodColor="#000" floodOpacity="0.6" />
        </filter>
      </defs>
    </svg>
  );
}

/** Four-point star glint. */
function Glint({ x, y, r, opacity = 0.95 }: { x: number; y: number; r: number; opacity?: number }) {
  const k = r * 0.22;
  return (
    <path
      d={`M${x} ${y - r} L${x + k} ${y - k} L${x + r} ${y} L${x + k} ${y + k} L${x} ${y + r} L${x - k} ${y + k} L${x - r} ${y} L${x - k} ${y - k} Z`}
      fill="#fff"
      opacity={opacity}
    />
  );
}

/** Star polygon path (n points, outer/inner radius). */
export function starPath(cx: number, cy: number, n: number, ro: number, ri: number, rot = -Math.PI / 2): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const r = i % 2 === 0 ? ro : ri;
    pts.push(`${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`);
  }
  return `M${pts.join(' L')} Z`;
}

function Gem({ id, plain }: { id: string; plain?: boolean }) {
  const c = CUTS[id];
  const t = GEM_TONES[id];
  return (
    <>
      <path d={c.outline} fill={t.tones[2]} stroke={t.edge} strokeWidth="2.2" strokeLinejoin="round" />
      {c.facets.map((f, i) => (
        <path key={i} d={f.d} fill={t.tones[f.tone]} stroke={t.edge} strokeOpacity="0.35" strokeWidth="0.7" strokeLinejoin="round" />
      ))}
      <path d={c.table} fill={`url(#${t.table})`} stroke="#ffffff" strokeOpacity="0.35" strokeWidth="0.8" strokeLinejoin="round" />
      {plain ? null : (
        <>
          <path d={c.table} fill="none" stroke={t.tones[0]} strokeOpacity="0.5" strokeWidth="0.6" transform="translate(50 50) scale(0.62) translate(-50 -50)" />
          <Glint x={id === 'GEM_ROSE' ? 44 : 40} y={id === 'GEM_AMBER' ? 44 : id === 'GEM_ROSE' ? 52 : 38} r={7} />
        </>
      )}
    </>
  );
}

function Chalice({ plain }: { plain?: boolean }) {
  return (
    <>
      {plain ? null : <circle cx="50" cy="20" r="15" fill="url(#sf-halo)" />}
      {/* rising star */}
      <path d={starPath(50, 19, 4, 12, 3.2)} fill="#effffb" />
      <path d={starPath(50, 19, 4, 6, 1.6, -Math.PI / 4)} fill="#8ff3e3" opacity="0.9" />
      {/* bowl */}
      <path d="M22 33 H78 C78 55 67 64 50 64 C33 64 22 55 22 33 Z" fill="url(#sf-brass)" stroke="#4d3411" strokeWidth="1.6" strokeLinejoin="round" />
      <ellipse cx="50" cy="33" rx="28" ry="6.5" fill="#0b3a3d" stroke="url(#sf-brass-h)" strokeWidth="2" />
      <ellipse cx="50" cy="33.6" rx="20" ry="3.4" fill="#5fe3d2" opacity="0.5" />
      {/* bowl band + gem */}
      <path d="M25.5 44 C34 47 66 47 74.5 44" fill="none" stroke="#4d3411" strokeOpacity="0.6" strokeWidth="1.2" />
      <path d="M50 44.5 L55 50.5 L50 56.5 L45 50.5 Z" fill="url(#sf-g-teal)" stroke="#063431" strokeWidth="1" />
      {/* stem + knot + foot */}
      <path d="M45.5 63 H54.5 L55.5 74 H44.5 Z" fill="url(#sf-brass-h)" stroke="#4d3411" strokeWidth="1.2" />
      <ellipse cx="50" cy="68.5" rx="7.5" ry="3.4" fill="url(#sf-brass)" stroke="#4d3411" strokeWidth="1.1" />
      <path d="M31 87 C33 78 43 74 50 74 C57 74 67 78 69 87 Z" fill="url(#sf-brass)" stroke="#4d3411" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="28" y="86" width="44" height="5" rx="2.2" fill="url(#sf-brass-d)" stroke="#4d3411" strokeWidth="1.1" />
      {plain ? null : <path d="M28 38 C29 48 34 56 41 60" fill="none" stroke="#fff6dc" strokeOpacity="0.55" strokeWidth="2.2" strokeLinecap="round" />}
    </>
  );
}

function Astrolabe({ plain }: { plain?: boolean }) {
  return (
    <>
      {/* throne + ring */}
      <circle cx="50" cy="10.5" r="5.2" fill="none" stroke="url(#sf-brass)" strokeWidth="2.6" />
      <path d="M43 19 Q50 12 57 19 Z" fill="url(#sf-brass)" stroke="#4d3411" strokeWidth="1" />
      {/* mater */}
      <circle cx="50" cy="53" r="37" fill="url(#sf-brass)" stroke="#4d3411" strokeWidth="1.6" />
      <circle cx="50" cy="53" r="30" fill="url(#sf-night)" stroke="#4d3411" strokeWidth="1.2" />
      {/* limb ticks */}
      {plain
        ? null
        : Array.from({ length: 36 }).map((_, i) => {
            const a = (i * Math.PI) / 18;
            const r1 = 31.5;
            const r2 = i % 3 === 0 ? 35.5 : 33.8;
            return (
              <line
                key={i}
                x1={(50 + Math.cos(a) * r1).toFixed(2)}
                y1={(53 + Math.sin(a) * r1).toFixed(2)}
                x2={(50 + Math.cos(a) * r2).toFixed(2)}
                y2={(53 + Math.sin(a) * r2).toFixed(2)}
                stroke="#4d3411"
                strokeWidth={i % 3 === 0 ? 1.1 : 0.6}
              />
            );
          })}
      {/* rete: ecliptic ring + star pointers */}
      <circle cx="50" cy="47" r="15" fill="none" stroke="url(#sf-brass-h)" strokeWidth="2.4" />
      <circle cx="50" cy="53" r="22" fill="none" stroke="#c9a05a" strokeOpacity="0.55" strokeWidth="0.9" />
      <path d="M50 31 L52.5 47 L50 53 L47.5 47 Z" fill="url(#sf-brass)" />
      <path d={starPath(36, 64, 4, 4.4, 1.2)} fill="#c9fff6" />
      <path d={starPath(66, 62, 4, 3.4, 0.9)} fill="#c9fff6" />
      <path d={starPath(60, 36, 4, 2.8, 0.8)} fill="#c9fff6" opacity="0.8" />
      {/* alidade */}
      <path d="M22 66 L78 40 L79 43 L23 69 Z" fill="url(#sf-brass-h)" stroke="#4d3411" strokeWidth="0.8" />
      <circle cx="50" cy="53" r="4.6" fill="url(#sf-brass)" stroke="#4d3411" strokeWidth="1" />
      <circle cx="50" cy="53" r="1.6" fill="#2b1c08" />
      {plain ? null : <path d="M20 42 A32 32 0 0 1 38 22" fill="none" stroke="#fff6dc" strokeOpacity="0.55" strokeWidth="2.4" strokeLinecap="round" />}
    </>
  );
}

function StarCrown({ plain }: { plain?: boolean }) {
  return (
    <>
      {plain ? null : <circle cx="50" cy="20" r="18" fill="url(#sf-halo)" />}
      {/* rays */}
      <path d="M43 68 L50 13 L57 68 Z" fill="url(#sf-brass)" stroke="#4d3411" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M30 70 L27 28 L42 66 Z" fill="url(#sf-brass)" stroke="#4d3411" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M70 70 L73 28 L58 66 Z" fill="url(#sf-brass)" stroke="#4d3411" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M22 72 L10 44 L30 68 Z" fill="url(#sf-brass-d)" stroke="#4d3411" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M78 72 L90 44 L70 68 Z" fill="url(#sf-brass-d)" stroke="#4d3411" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M50 16 L50 64" stroke="#fff6dc" strokeOpacity="0.55" strokeWidth="1.2" />
      {/* band */}
      <path d="M17 68 Q50 80 83 68 L81 82 Q50 93 19 82 Z" fill="url(#sf-brass)" stroke="#4d3411" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M19 74 Q50 85 81 74" fill="none" stroke="#4d3411" strokeOpacity="0.5" strokeWidth="1" />
      <path d="M50 70 L56 77 L50 84 L44 77 Z" fill="url(#sf-g-teal)" stroke="#063431" strokeWidth="1" />
      <circle cx="33" cy="76" r="3.2" fill="url(#sf-g-rose)" stroke="#3d0a1d" strokeWidth="0.8" />
      <circle cx="67" cy="76" r="3.2" fill="url(#sf-g-azure)" stroke="#0c1f45" strokeWidth="0.8" />
      {/* star tips */}
      <path d={starPath(50, 13, 4, 8, 2)} fill="#f2fffc" />
      <path d={starPath(27, 28, 4, 5, 1.3)} fill="#c9fff6" />
      <path d={starPath(73, 28, 4, 5, 1.3)} fill="#c9fff6" />
      <circle cx="10" cy="44" r="2.2" fill="#c9fff6" />
      <circle cx="90" cy="44" r="2.2" fill="#c9fff6" />
    </>
  );
}

function Wild() {
  return (
    <>
      <circle cx="50" cy="44" r="38" fill="url(#sf-brass)" stroke="#4d3411" strokeWidth="1.6" />
      <circle cx="50" cy="44" r="32" fill="url(#sf-night)" stroke="#4d3411" strokeWidth="1.2" />
      <circle cx="50" cy="44" r="26" fill="none" stroke="#c9a05a" strokeOpacity="0.4" strokeWidth="0.8" strokeDasharray="1.5 3" />
      {/* compass star: long cardinal + short diagonal points */}
      <path d={starPath(50, 44, 4, 11, 4, -Math.PI / 4 - Math.PI / 4)} transform="rotate(45 50 44)" fill="#7fe6d6" opacity="0.85" />
      <path d={starPath(50, 44, 4, 29, 6)} fill="url(#sf-brass)" stroke="#4d3411" strokeWidth="1" strokeLinejoin="round" />
      <path d="M50 15 L50 73 M21 44 L79 44" stroke="#fff6dc" strokeOpacity="0.5" strokeWidth="0.9" />
      <circle cx="50" cy="44" r="5" fill="#f2fffc" />
      {/* ribbon */}
      <path d="M8 66 L18 62 H82 L92 66 L86 72 L92 78 L82 82 H18 L8 78 L14 72 Z" fill="#0a2f34" stroke="url(#sf-brass)" strokeWidth="2.4" strokeLinejoin="round" />
      <text x="50" y="78.5" textAnchor="middle" fontSize="18" fontWeight="800" letterSpacing="3.5" fill="url(#sf-brass)" fontFamily="var(--font-geist-sans), system-ui, sans-serif">
        WILD
      </text>
    </>
  );
}

function StarGate({ plain }: { plain?: boolean }) {
  return (
    <>
      {/* arch */}
      <path d="M14 90 V46 A36 36 0 0 1 86 46 V90 Z" fill="url(#sf-brass)" stroke="#4d3411" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M24 90 V47 A26 26 0 0 1 76 47 V90 Z" fill="url(#sf-nebula)" stroke="#4d3411" strokeWidth="1.4" />
      {/* swirl + stars inside */}
      {plain ? null : (
        <>
          <path d="M50 70 C40 70 36 60 42 54 C48 48 60 52 58 60 C57 65 50 65 49 61" fill="none" stroke="#e9fff9" strokeOpacity="0.7" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="34" cy="58" r="1" fill="#fff" />
          <circle cx="64" cy="48" r="1.2" fill="#fff" />
          <circle cx="68" cy="76" r="0.9" fill="#fff" />
          <circle cx="32" cy="80" r="0.9" fill="#fff" />
        </>
      )}
      <path d={starPath(50, 62, 4, 9, 2.2)} fill="#ffffff" />
      {/* zodiac studs on the arch */}
      {Array.from({ length: 9 }).map((_, i) => {
        const a = Math.PI + (i * Math.PI) / 8;
        return <circle key={i} cx={(50 + Math.cos(a) * 31).toFixed(2)} cy={(46 + Math.sin(a) * 31).toFixed(2)} r="1.6" fill="#fbefcc" stroke="#4d3411" strokeWidth="0.5" />;
      })}
      {/* keystone */}
      <path d="M43 6 H57 L55 16 H45 Z" fill="url(#sf-brass)" stroke="#4d3411" strokeWidth="1.2" strokeLinejoin="round" />
      <path d={starPath(50, 11, 4, 3.4, 1)} fill="#0a2f34" />
      {/* plinth */}
      <rect x="9" y="86" width="82" height="7" rx="2" fill="url(#sf-brass-d)" stroke="#4d3411" strokeWidth="1.2" />
    </>
  );
}

function Supernova({ plain }: { plain?: boolean }) {
  return (
    <>
      <circle cx="50" cy="50" r="48" fill="url(#sf-nova)" />
      {/* brass bezel so the star reads as a symbol, not a sparkle */}
      <circle cx="50" cy="50" r="40" fill="#06272a" fillOpacity="0.55" stroke="url(#sf-brass)" strokeWidth="2.6" />
      {[0, 90, 180, 270].map((r) => (
        <path key={r} d="M50 6 L54 12 L50 15 L46 12 Z" fill="url(#sf-brass)" stroke="#4d3411" strokeWidth="0.6" transform={`rotate(${r} 50 50)`} />
      ))}
      {Array.from({ length: 16 }).map((_, i) => {
        const a = (i * Math.PI) / 8;
        const long = i % 2 === 0;
        const r1 = 12;
        const r2 = long ? 46 : 32;
        return (
          <line
            key={i}
            x1={(50 + Math.cos(a) * r1).toFixed(2)}
            y1={(50 + Math.sin(a) * r1).toFixed(2)}
            x2={(50 + Math.cos(a) * r2).toFixed(2)}
            y2={(50 + Math.sin(a) * r2).toFixed(2)}
            stroke={long ? '#f2fffc' : '#8ff3e3'}
            strokeOpacity={long ? 0.9 : 0.7}
            strokeWidth={long ? 2 : 1.3}
            strokeLinecap="round"
          />
        );
      })}
      <circle cx="50" cy="50" r="24" fill="none" stroke="#8ff3e3" strokeOpacity="0.8" strokeWidth="1.6" />
      {plain ? null : <circle cx="50" cy="50" r="30" fill="none" stroke="#e9fbf8" strokeOpacity="0.35" strokeWidth="0.8" strokeDasharray="2 4" />}
      <path d={starPath(50, 50, 8, 17, 6)} fill="#ffffff" />
      <circle cx="50" cy="50" r="7" fill="#ffffff" />
    </>
  );
}

function Relic({ plain }: { plain?: boolean }) {
  const hex = poly(6, 30, 0, 50, 54);
  const hexIn = poly(6, 23, 0, 50, 54);
  const d = (p: Pt[]) => `M${p.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L')} Z`;
  return (
    <>
      {plain ? null : <circle cx="50" cy="54" r="46" fill="url(#sf-relic-halo)" />}
      {/* bail */}
      <circle cx="50" cy="15" r="6" fill="none" stroke="url(#sf-brass)" strokeWidth="3" />
      <rect x="46" y="19" width="8" height="8" rx="2" fill="url(#sf-brass)" stroke="#4d3411" strokeWidth="1" />
      <path d={d(hex)} fill="url(#sf-brass)" stroke="#4d3411" strokeWidth="1.6" strokeLinejoin="round" />
      <path d={d(hexIn)} fill="#2a0e0a" stroke="#4d3411" strokeWidth="1" strokeLinejoin="round" />
      {/* engraved dots */}
      {hex.map(([x, y], i) => (
        <circle key={i} cx={(50 + (x - 50) * 0.88).toFixed(2)} cy={(54 + (y - 54) * 0.88).toFixed(2)} r="1.5" fill="#fbefcc" stroke="#4d3411" strokeWidth="0.4" />
      ))}
      {/* core orb */}
      <circle cx="50" cy="54" r="17" fill="url(#sf-relic-core)" />
      <path d={starPath(50, 54, 4, 10, 2.6)} fill="#fff4e6" opacity="0.9" />
      {plain ? null : <ellipse cx="44" cy="47" rx="5" ry="3" fill="#fff" opacity="0.5" transform="rotate(-30 44 47)" />}
    </>
  );
}

const ART: Record<string, (p: { plain?: boolean }) => ReactNode> = {
  GEM_TEAL: (p) => <Gem id="GEM_TEAL" {...p} />,
  GEM_ROSE: (p) => <Gem id="GEM_ROSE" {...p} />,
  GEM_AZURE: (p) => <Gem id="GEM_AZURE" {...p} />,
  GEM_AMBER: (p) => <Gem id="GEM_AMBER" {...p} />,
  CHALICE: Chalice,
  ASTROLABE: Astrolabe,
  STARCROWN: StarCrown,
  WILD: () => <Wild />,
  SCATTER: StarGate,
  SUPERNOVA: Supernova,
  RELIC: Relic,
};

export const SF_SYMBOL_NAMES: Record<string, string> = {
  GEM_TEAL: 'Teal Shard',
  GEM_ROSE: 'Rose Shard',
  GEM_AZURE: 'Azure Shard',
  GEM_AMBER: 'Amber Shard',
  CHALICE: 'Star Chalice',
  ASTROLABE: 'Astrolabe',
  STARCROWN: 'Star Crown',
  WILD: 'Wild',
  SCATTER: 'Star Gate',
  SUPERNOVA: 'Supernova',
  RELIC: 'Relic',
};

const HALO_SYMBOLS = new Set(['STARCROWN', 'WILD', 'SCATTER', 'SUPERNOVA', 'RELIC', 'CHALICE', 'ASTROLABE']);

export function StarforgedGlyph({ symbol, plain }: { symbol: string; plain?: boolean }) {
  const Art = ART[symbol];
  return Art ? <Art plain={plain} /> : null;
}

export function renderStarforgedSymbol(symbol: string, opts: SymbolRenderOpts): ReactNode {
  const Art = ART[symbol];
  if (!Art) return null;
  const plain = !!(opts.blurred || opts.small);
  const glow = SF_SYMBOL_COLOR[symbol] ?? '#ffffff';
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible" role="img" aria-label={SF_SYMBOL_NAMES[symbol]}>
      {opts.state === 'win' && !plain ? (
        <circle cx="50" cy="50" r="50" fill={glow} opacity={HALO_SYMBOLS.has(symbol) ? 0.2 : 0.16} style={{ filter: 'blur(6px)' }} />
      ) : null}
      {opts.state === 'transform' && !plain ? <circle cx="50" cy="50" r="46" fill="none" stroke={glow} strokeWidth="3" opacity="0.8" /> : null}
      <g filter={plain ? undefined : 'url(#sf-drop)'}>
        <Art plain={plain} />
      </g>
    </svg>
  );
}
