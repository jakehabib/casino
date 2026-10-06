'use client';
import type { ReactNode } from 'react';
import type { SymbolRenderOpts } from '../shared/types';

/**
 * Overcharge symbol art — machined graphite components lit from inside.
 *
 * Lows are six electronic parts (battery cell, PCB node, glass fuse, LED
 * diode, IC chip, toroid coil), each with its own signal colour and a
 * distinct silhouette so they read at 390px. Highs sit in heavier housings
 * (hex energy core, plasma globe, reactor ring). Wilds are hex badges with a
 * bolt; the ×2 Overcharged Wild runs hot (amber). The Surge scatter is a
 * round charge ring. Every gradient lives once in <OverchargeDefs/>.
 */

export const OC_HUES: Record<string, string> = {
  CELL: '#b8f04a',
  NODE: '#4b9dff',
  FUSE: '#ff6ec7',
  DIODE: '#ff4f64',
  CHIP: '#3fe3b0',
  COIL: '#f0955a',
  CORE: '#33d7ff',
  PLASMA: '#a77bff',
  REACTOR: '#ffb547',
  WILD: '#7fe8ff',
  WILD2: '#ffbf5a',
  SCATTER: '#9f8bff',
};

/** Mix a hex colour toward white (t>0) or black (t<0). */
function shade(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(t >= 0 ? c + (255 - c) * t : c * (1 + t)));
  return `#${ch.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Mounted once by the machine: shared gradients + filters for every symbol instance. */
export function OverchargeDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute', pointerEvents: 'none' }} aria-hidden focusable="false">
      <defs>
        {/* machined metal — user-space so thin/straight strokes still get the gradient */}
        <linearGradient id="oc-metal" x1="0" y1="10" x2="0" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#eef3f8" />
          <stop offset="0.3" stopColor="#a7b1be" />
          <stop offset="0.52" stopColor="#4c5563" />
          <stop offset="0.68" stopColor="#b7c1cd" />
          <stop offset="1" stopColor="#56606d" />
        </linearGradient>
        <linearGradient id="oc-metal-h" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5a6471" />
          <stop offset="0.28" stopColor="#dfe6ee" />
          <stop offset="0.5" stopColor="#8f99a6" />
          <stop offset="1" stopColor="#3b434e" />
        </linearGradient>
        <linearGradient id="oc-dark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#252d38" />
          <stop offset="1" stopColor="#0b0f15" />
        </linearGradient>
        <linearGradient id="oc-copper" x1="0" y1="16" x2="0" y2="84" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffd9b8" />
          <stop offset="0.4" stopColor="#e3874d" />
          <stop offset="0.75" stopColor="#8d4419" />
          <stop offset="1" stopColor="#c26b35" />
        </linearGradient>
        <linearGradient id="oc-wild-plate" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#10243a" />
          <stop offset="1" stopColor="#050a12" />
        </linearGradient>
        <linearGradient id="oc-wild-edge" x1="0" y1="6" x2="0" y2="94" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#e9fdff" />
          <stop offset="0.45" stopColor="#3fcaf2" />
          <stop offset="1" stopColor="#1a6f9a" />
        </linearGradient>
        <linearGradient id="oc-wild2-edge" x1="0" y1="6" x2="0" y2="94" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff4dc" />
          <stop offset="0.45" stopColor="#ffb547" />
          <stop offset="1" stopColor="#a35a12" />
        </linearGradient>
        <linearGradient id="oc-bolt" x1="0" y1="12" x2="0" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#bff4ff" />
          <stop offset="1" stopColor="#35c8f0" />
        </linearGradient>
        <linearGradient id="oc-bolt2" x1="0" y1="12" x2="0" y2="62" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.5" stopColor="#ffe2a8" />
          <stop offset="1" stopColor="#ff9d2e" />
        </linearGradient>
        <linearGradient id="oc-surge" x1="10" y1="10" x2="90" y2="90" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7fe8ff" />
          <stop offset="0.55" stopColor="#8f8bff" />
          <stop offset="1" stopColor="#c26bff" />
        </linearGradient>
        <radialGradient id="oc-glass" cx="50%" cy="45%" r="55%">
          <stop offset="0" stopColor="#2a1f48" stopOpacity="0.55" />
          <stop offset="0.8" stopColor="#120c24" stopOpacity="0.9" />
          <stop offset="1" stopColor="#d9ccff" stopOpacity="0.35" />
        </radialGradient>
        <radialGradient id="oc-zap" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="0.35" stopColor="#c9f6ff" stopOpacity="0.85" />
          <stop offset="1" stopColor="#33d7ff" stopOpacity="0" />
        </radialGradient>
        {Object.entries(OC_HUES).map(([id, c]) => (
          <g key={id}>
            <radialGradient id={`oc-glow-${id}`} cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor={c} stopOpacity="0.5" />
              <stop offset="0.55" stopColor={c} stopOpacity="0.14" />
              <stop offset="1" stopColor={c} stopOpacity="0" />
            </radialGradient>
            <linearGradient id={`oc-lit-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={shade(c, 0.6)} />
              <stop offset="0.45" stopColor={c} />
              <stop offset="1" stopColor={shade(c, -0.45)} />
            </linearGradient>
            <radialGradient id={`oc-orb-${id}`} cx="40%" cy="36%" r="70%">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.28" stopColor={shade(c, 0.45)} />
              <stop offset="0.7" stopColor={c} />
              <stop offset="1" stopColor={shade(c, -0.55)} />
            </radialGradient>
          </g>
        ))}
        <filter id="oc-drop" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2" floodColor="#000" floodOpacity="0.7" />
        </filter>
      </defs>
    </svg>
  );
}

const INK = '#090c11';

function Cell() {
  return (
    <>
      <rect x="42" y="11" width="16" height="10" rx="2.5" fill="url(#oc-metal)" stroke={INK} strokeWidth="1.3" />
      <rect x="29" y="18" width="42" height="71" rx="9" fill="url(#oc-metal-h)" stroke={INK} strokeWidth="1.6" />
      <rect x="35" y="25" width="30" height="57" rx="5" fill="#0a0f15" />
      {[70.5, 58.5, 46.5, 34.5].map((y, i) => (
        <rect key={y} x="38.5" y={y} width="23" height="9" rx="2" fill={i < 3 ? 'url(#oc-lit-CELL)' : OC_HUES.CELL} fillOpacity={i < 3 ? 1 : 0.16} />
      ))}
      <path d="M41 37.2 h18" stroke="#fff" strokeOpacity="0.12" />
      <rect x="31.5" y="21" width="3.5" height="64" rx="1.75" fill="#fff" opacity="0.35" />
      <path d="M50 26.6 v4.6 M47.7 28.9 h4.6" stroke={OC_HUES.CELL} strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
    </>
  );
}

const NODE_TRACES = ['M50 50 V30 L38 18 H22', 'M50 50 H70 L82 38 V22', 'M50 50 V70 L62 82 H78', 'M50 50 H30 L18 62 V78'];
const NODE_PADS: [number, number][] = [
  [20, 18],
  [82, 20],
  [80, 82],
  [18, 80],
];
function Node() {
  return (
    <>
      {NODE_TRACES.map((d) => (
        <g key={d}>
          <path d={d} fill="none" stroke={INK} strokeWidth="8.5" strokeLinejoin="round" strokeLinecap="round" />
          <path d={d} fill="none" stroke="url(#oc-metal)" strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" />
          <path d={d} fill="none" stroke={OC_HUES.NODE} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        </g>
      ))}
      {NODE_PADS.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="7.5" fill="url(#oc-metal)" stroke={INK} strokeWidth="1.3" />
          <circle cx={x} cy={y} r="3.2" fill={OC_HUES.NODE} />
        </g>
      ))}
      <circle cx="50" cy="50" r="19" fill="url(#oc-dark)" stroke="url(#oc-metal)" strokeWidth="3.4" />
      <circle cx="50" cy="50" r="11.5" fill="url(#oc-orb-NODE)" />
      <circle cx="46" cy="45.5" r="3" fill="#fff" opacity="0.75" />
    </>
  );
}

function Fuse() {
  const c = OC_HUES.FUSE;
  return (
    <g transform="rotate(-40 50 50)">
      <rect x="26" y="37" width="48" height="26" rx="4" fill="#ffffff0d" stroke="#ffffff59" strokeWidth="1.3" />
      <path d="M27 50 L32 43 L37.5 57 L43 43 L48.5 57 L54 43 L59.5 57 L65 43 L70.5 57 L73 50" fill="none" stroke={c} strokeOpacity="0.35" strokeWidth="6" strokeLinejoin="round" />
      <path d="M27 50 L32 43 L37.5 57 L43 43 L48.5 57 L54 43 L59.5 57 L65 43 L70.5 57 L73 50" fill="none" stroke={shade(c, 0.45)} strokeWidth="2.2" strokeLinejoin="round" />
      <rect x="29" y="40" width="42" height="3" rx="1.5" fill="#fff" opacity="0.5" />
      {[8, 74].map((x) => (
        <g key={x}>
          <rect x={x} y="34" width="18" height="32" rx="5" fill="url(#oc-metal-h)" stroke={INK} strokeWidth="1.5" />
          <path d={`M${x + 6} 35.5 V64.5 M${x + 12} 35.5 V64.5`} stroke={INK} strokeOpacity="0.45" strokeWidth="1.2" />
        </g>
      ))}
    </g>
  );
}

function Diode() {
  return (
    <>
      <path d="M42.5 72 V91" stroke="url(#oc-metal)" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M57.5 72 V80 L63 86 V92" fill="none" stroke="url(#oc-metal)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="27" y="62" width="46" height="11" rx="3" fill={shade(OC_HUES.DIODE, -0.35)} stroke={INK} strokeWidth="1.4" />
      <path d="M31 63 V40 A19 19 0 0 1 69 40 V63 Z" fill="url(#oc-lit-DIODE)" fillOpacity="0.95" stroke={INK} strokeWidth="1.4" />
      <circle cx="50" cy="42" r="15" fill="url(#oc-orb-DIODE)" opacity="0.85" />
      <path d="M44 49 L56 42.5 L44 36 Z M56.5 36 V49" fill="none" stroke="#5a0d18" strokeWidth="2" strokeLinejoin="round" opacity="0.65" />
      <path d="M36.5 59 V41 A13.5 13.5 0 0 1 45 28.5" fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="3" strokeLinecap="round" />
    </>
  );
}

function Chip() {
  const pins = [29.5, 40.5, 51.5, 62.5];
  return (
    <>
      {pins.map((p) => (
        <g key={p}>
          <rect x={p} y="12" width="8" height="13" rx="1.6" fill="url(#oc-metal)" stroke={INK} strokeWidth="1" />
          <rect x={p} y="75" width="8" height="13" rx="1.6" fill="url(#oc-metal)" stroke={INK} strokeWidth="1" />
          <rect x="12" y={p} width="13" height="8" rx="1.6" fill="url(#oc-metal)" stroke={INK} strokeWidth="1" />
          <rect x="75" y={p} width="13" height="8" rx="1.6" fill="url(#oc-metal)" stroke={INK} strokeWidth="1" />
        </g>
      ))}
      <rect x="22" y="22" width="56" height="56" rx="7" fill="url(#oc-dark)" stroke="#4a5668" strokeWidth="1.6" />
      <rect x="35" y="35" width="30" height="30" rx="3.5" fill="url(#oc-lit-CHIP)" />
      <path d="M40 43 H50 V50 H60 M40 57 H46 V50 M54 57 H60 M50 40 V43 M54 50 V60" fill="none" stroke="#06352a" strokeWidth="1.8" strokeLinecap="round" opacity="0.7" />
      <circle cx="29" cy="29" r="2.4" fill="#fff" opacity="0.45" />
      <path d="M24.5 24.5 h51" stroke="#fff" strokeOpacity="0.16" strokeWidth="1.5" />
    </>
  );
}

const COIL_TURNS = Array.from({ length: 20 }, (_, i) => (i * 360) / 20);
function Coil() {
  return (
    <>
      <path d="M43 80 V93 M57 80 V93" stroke="url(#oc-metal)" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="50" cy="48" r="35" fill="url(#oc-dark)" stroke={INK} strokeWidth="1.5" />
      {COIL_TURNS.map((a) => (
        <line key={a} x1="50" y1="14.5" x2="50" y2="34" stroke="url(#oc-copper)" strokeWidth="4.4" strokeLinecap="round" transform={`rotate(${a} 50 48)`} />
      ))}
      <circle cx="50" cy="48" r="13" fill="#06080c" stroke="#00000099" strokeWidth="2" />
      <circle cx="50" cy="48" r="8.5" fill="url(#oc-orb-COIL)" opacity="0.9" />
      <path d="M24 34 A30 30 0 0 1 40 18.5" fill="none" stroke="#fff" strokeOpacity="0.4" strokeWidth="2.4" strokeLinecap="round" />
    </>
  );
}

const HEX = (r: number, cx = 50, cy = 50) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
const HEX_40 = HEX(41);
const HEX_33 = HEX(33);
const HEX_44 = HEX(45);
const HEX_38 = HEX(38.5);

function Core() {
  const c = OC_HUES.CORE;
  return (
    <>
      <polygon points={HEX_40} fill="url(#oc-dark)" stroke="url(#oc-metal)" strokeWidth="4.5" strokeLinejoin="round" />
      <polygon points={HEX_33} fill="none" stroke={c} strokeOpacity="0.25" strokeWidth="1.2" />
      {HEX_33.split(' ').map((p) => {
        const [x, y] = p.split(',');
        return <circle key={p} cx={x} cy={y} r="2" fill={c} />;
      })}
      <circle cx="50" cy="50" r="24" fill={c} opacity="0.18" />
      <circle cx="50" cy="50" r="19.5" fill="url(#oc-orb-CORE)" />
      <ellipse cx="50" cy="50" rx="29" ry="8.5" fill="none" stroke={shade(c, 0.5)} strokeWidth="1.6" transform="rotate(-28 50 50)" />
      <ellipse cx="50" cy="50" rx="29" ry="8.5" fill="none" stroke={c} strokeOpacity="0.55" strokeWidth="1.2" transform="rotate(36 50 50)" />
      <ellipse cx="44" cy="43" rx="5" ry="3.2" fill="#fff" opacity="0.8" transform="rotate(-30 44 43)" />
    </>
  );
}

const PLASMA_ARCS = [
  'M50 46 Q56 36 54 28 T62 17',
  'M50 46 Q62 46 68 38 T78 36',
  'M50 46 Q60 54 64 62 T74 64',
  'M50 46 Q40 54 38 64 T30 68',
  'M50 46 Q38 40 32 34 T23 30',
];
function Plasma() {
  const c = OC_HUES.PLASMA;
  return (
    <>
      <path d="M31 91 H69 L63 77 H37 Z" fill="url(#oc-metal)" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
      <rect x="38" y="72" width="24" height="7" rx="2" fill="url(#oc-dark)" stroke={INK} strokeWidth="1.2" />
      <circle cx="50" cy="45" r="31" fill="url(#oc-glass)" stroke="#e6dcff" strokeOpacity="0.5" strokeWidth="1.4" />
      {PLASMA_ARCS.map((d) => (
        <g key={d}>
          <path d={d} fill="none" stroke={c} strokeOpacity="0.4" strokeWidth="5" strokeLinecap="round" />
          <path d={d} fill="none" stroke={shade(c, 0.55)} strokeWidth="1.6" strokeLinecap="round" />
        </g>
      ))}
      <circle cx="50" cy="46" r="9" fill="url(#oc-orb-PLASMA)" />
      <path d="M29 36 A23 23 0 0 1 45 20" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="2.6" strokeLinecap="round" />
    </>
  );
}

const REACTOR_SEGS = Array.from({ length: 10 }, (_, i) => i * 36);
const REACTOR_SPOKES = Array.from({ length: 6 }, (_, i) => i * 60 + 30);
function Reactor() {
  const c = OC_HUES.REACTOR;
  return (
    <>
      <circle cx="50" cy="50" r="42" fill="url(#oc-dark)" stroke="url(#oc-metal)" strokeWidth="3.5" />
      <circle cx="50" cy="50" r="37" fill="none" stroke="#000" strokeOpacity="0.6" strokeWidth="1.5" />
      {REACTOR_SEGS.map((a) => (
        <rect key={a} x="45" y="13" width="10" height="13" rx="2" fill="url(#oc-lit-REACTOR)" stroke={INK} strokeWidth="1" transform={`rotate(${a} 50 50)`} />
      ))}
      <circle cx="50" cy="50" r="21" fill="#0a0d12" stroke="url(#oc-metal)" strokeWidth="2.6" />
      {REACTOR_SPOKES.map((a) => (
        <line key={a} x1="50" y1="30.5" x2="50" y2="36" stroke={c} strokeOpacity="0.8" strokeWidth="1.6" transform={`rotate(${a} 50 50)`} />
      ))}
      <circle cx="50" cy="50" r="17" fill={c} opacity="0.25" />
      <circle cx="50" cy="50" r="13" fill="url(#oc-orb-REACTOR)" />
      <path d="M17.5 38 A34 34 0 0 1 38 16.5" fill="none" stroke="#fff" strokeOpacity="0.4" strokeWidth="2.4" strokeLinecap="round" />
    </>
  );
}

/** Lightning bolt glyph (sized for a 100 box; occupies ~y 12–62). */
const BOLT = 'M57 11 L33 42 H47.5 L41 64 L67 30 H52.5 L60 11 Z';

function WildBadge({ hot }: { hot?: boolean }) {
  const edge = hot ? 'url(#oc-wild2-edge)' : 'url(#oc-wild-edge)';
  const c = hot ? OC_HUES.WILD2 : OC_HUES.WILD;
  return (
    <>
      <polygon points={HEX_44} fill="url(#oc-wild-plate)" stroke={edge} strokeWidth="3.4" strokeLinejoin="round" />
      <polygon points={HEX_38} fill="none" stroke={c} strokeOpacity="0.3" strokeWidth="1" />
      <path d={BOLT} fill={c} opacity="0.3" transform="translate(50 37) scale(1.18) translate(-50 -37)" />
      <path d={BOLT} fill={hot ? 'url(#oc-bolt2)' : 'url(#oc-bolt)'} stroke="#ffffff" strokeOpacity="0.7" strokeWidth="0.8" strokeLinejoin="round" />
      <rect x="15" y="64" width="70" height="21" rx="4.5" fill="#04080e" stroke={edge} strokeWidth="1.8" />
      <text
        x="50"
        y={hot ? 80.5 : 80}
        textAnchor="middle"
        fontSize={hot ? 18 : 16}
        fontWeight="900"
        letterSpacing={hot ? 1 : 3}
        fill={hot ? '#ffe7bd' : '#e6fbff'}
        fontFamily="var(--font-geist-sans), system-ui, sans-serif"
      >
        {hot ? 'WILD×2' : 'WILD'}
      </text>
    </>
  );
}

/** The Surge ring — scatter symbol, logo mark and bonus art. `lit` (0–16) segments glow. */
export function SurgeRing({ lit = 16, label = true }: { lit?: number; label?: boolean }) {
  const segs = 16;
  return (
    <>
      <circle cx="50" cy="50" r="45" fill="url(#oc-dark)" stroke="url(#oc-metal)" strokeWidth="2.6" />
      {Array.from({ length: segs }, (_, i) => (
        <path
          key={i}
          d="M50 11.5 A38.5 38.5 0 0 1 64.3 14.25"
          fill="none"
          stroke={i < lit ? 'url(#oc-surge)' : '#ffffff'}
          strokeOpacity={i < lit ? 1 : 0.08}
          strokeWidth="6.5"
          transform={`rotate(${i * (360 / segs) + 2.2} 50 50)`}
        />
      ))}
      <circle cx="50" cy="50" r="29" fill="#060a11" stroke="#ffffff" strokeOpacity="0.14" strokeWidth="1.2" />
      <g transform={label ? undefined : 'translate(0 6)'}>
        <path d="M42.2 33.4 A12.5 12.5 0 1 0 57.8 33.4" fill="none" stroke="#f2fbff" strokeWidth="4.4" strokeLinecap="round" />
        <path d="M50 28 V43" stroke="#f2fbff" strokeWidth="4.4" strokeLinecap="round" />
      </g>
      {label ? (
        <text x="50" y="68.5" textAnchor="middle" fontSize="10" fontWeight="800" letterSpacing="2.4" fill="#cfe9ff" fontFamily="var(--font-geist-sans), system-ui, sans-serif">
          SURGE
        </text>
      ) : null}
    </>
  );
}

const ART: Record<string, () => ReactNode> = {
  CELL: Cell,
  NODE: Node,
  FUSE: Fuse,
  DIODE: Diode,
  CHIP: Chip,
  COIL: Coil,
  CORE: Core,
  PLASMA: Plasma,
  REACTOR: Reactor,
  WILD: () => <WildBadge />,
  WILD2: () => <WildBadge hot />,
  SCATTER: () => <SurgeRing />,
};

const NAMES: Record<string, string> = {
  CELL: 'Cell',
  NODE: 'Node',
  FUSE: 'Fuse',
  DIODE: 'Diode',
  CHIP: 'Chip',
  COIL: 'Coil',
  CORE: 'Core',
  PLASMA: 'Plasma',
  REACTOR: 'Reactor',
  WILD: 'Wild',
  WILD2: 'Overcharged Wild ×2',
  SCATTER: 'Surge scatter',
};

const STRONG = new Set(['CORE', 'PLASMA', 'REACTOR', 'WILD', 'WILD2', 'SCATTER']);

export function renderOverchargeSymbol(symbol: string, opts: SymbolRenderOpts): ReactNode {
  const Art = ART[symbol];
  if (!Art) return null;
  const quiet = opts.blurred || opts.small;
  const hue = OC_HUES[symbol] ?? OC_HUES.CORE;
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible" role="img" aria-label={NAMES[symbol]}>
      {quiet ? null : (
        <circle
          cx="50"
          cy="50"
          r={opts.state === 'win' ? 50 : 44}
          fill={`url(#oc-glow-${symbol in OC_HUES ? symbol : 'CORE'})`}
          opacity={opts.state === 'win' ? 1 : STRONG.has(symbol) ? 0.75 : 0.45}
        />
      )}
      <g filter={quiet ? undefined : 'url(#oc-drop)'}>
        <Art />
      </g>
      {opts.state === 'pop' ? (
        <>
          <circle cx="50" cy="50" r="48" fill="url(#oc-zap)" />
          <circle cx="50" cy="50" r="44" fill="none" stroke={hue} strokeWidth="2" />
        </>
      ) : null}
    </svg>
  );
}
