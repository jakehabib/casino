'use client';
import type { ReactNode } from 'react';
import type { PublicSymbol } from '@/engines/slots/public';
import type { SlotTheme, SymbolRenderOpts } from './types';

/**
 * Neutral, machine-agnostic symbol glyphs. Used for interim machine UIs and
 * for compact round-detail grids. Each symbol gets a stable hue from its
 * position in the symbol list, a geometric mark by tier and a short label.
 */
const HUES = [196, 168, 262, 330, 28, 210, 140, 285, 12, 52];
const SHAPES = [
  'M50 18 L80 50 L50 82 L20 50 Z', // diamond
  'M26 26 H74 V74 H26 Z', // square
  'M50 18 L82 76 H18 Z', // triangle
  'M50 18 A32 32 0 1 1 49.9 18 Z', // circle
  'M50 16 L59 40 L84 40 L64 56 L72 82 L50 66 L28 82 L36 56 L16 40 L41 40 Z', // star
  'M30 20 H70 L84 50 L70 80 H30 L16 50 Z', // hexagon
];

export function genericSymbolColor(index: number, kind: PublicSymbol['kind']): string {
  if (kind === 'wild') return 'hsl(265 85% 68%)';
  if (kind === 'scatter') return 'hsl(42 80% 62%)';
  if (kind === 'special') return 'hsl(180 60% 60%)';
  return `hsl(${HUES[index % HUES.length]} 55% 62%)`;
}

export function GenericSymbol({ sym, index, opts }: { sym: PublicSymbol | undefined; index: number; opts?: SymbolRenderOpts }): ReactNode {
  if (!sym) return <svg viewBox="0 0 100 100" className="h-full w-full" />;
  const c = genericSymbolColor(index, sym.kind);
  const label =
    sym.kind === 'wild' ? (sym.multiplier ? `W×${sym.multiplier}` : 'WILD') : sym.kind === 'scatter' ? 'BONUS' : sym.name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase();
  const shape = sym.kind === 'scatter' ? SHAPES[4] : sym.kind === 'wild' ? SHAPES[5] : SHAPES[index % 4];
  const strong = sym.tier === 'premium' || sym.kind !== 'regular';
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-label={sym.name} role="img">
      <rect x="4" y="4" width="92" height="92" rx="18" fill="#ffffff08" stroke={c} strokeOpacity={opts?.state === 'win' ? 0.9 : 0.25} strokeWidth="2" />
      <path d={shape} transform="translate(50 42) scale(0.55) translate(-50 -50)" fill={c} fillOpacity={strong ? 1 : 0.85} />
      {opts?.blurred ? null : (
        <text x="50" y="84" textAnchor="middle" fontSize={label.length > 4 ? 12 : 14} fontWeight="800" letterSpacing="1" fill="#eceef2" fillOpacity="0.85" fontFamily="var(--font-geist-sans)">
          {label}
        </text>
      )}
    </svg>
  );
}

/** Build a neutral theme for any machine from its public symbol list. */
export function createGenericTheme(id: string, symbols: PublicSymbol[]): SlotTheme {
  const idx = new Map(symbols.map((s, i) => [s.id, i]));
  return {
    id,
    renderSymbol: (symbol, opts) => <GenericSymbol sym={symbols[idx.get(symbol) ?? -1]} index={idx.get(symbol) ?? 0} opts={opts} />,
    lineColors: ['#7c5cff', '#3ddc97', '#5ab0ff', '#f2b84b', '#e86a6a', '#c084fc', '#22d3ee', '#f472b6'],
    highlight: '#7c5cff',
    reelBackground: 'linear-gradient(180deg, #0e1014 0%, #121419 50%, #0e1014 100%)',
    reelDivider: '#ffffff0d',
    cellPadding: 0.07,
  };
}
