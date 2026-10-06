import type { ReactNode } from 'react';
import type { PublicSlotDefinition } from '@/engines/slots/public';
import type { Pos, SpinOutcome, SpinWin } from '@/engines/slots/types';
import type { PublicBonus, PublicSpin, SlotSpinResponse, SlotStateResponse } from '@/server/services/slots/slot-service';

export type { PublicSlotDefinition, Pos, SpinOutcome, SpinWin, PublicBonus, PublicSpin, SlotSpinResponse, SlotStateResponse };

/**
 * Visual state of one cell, passed to `theme.renderSymbol`.
 *  idle      — resting
 *  win       — part of the win being presented (pulse/glow)
 *  dim       — another win is being presented
 *  landing   — just stopped (themes may add a subtle flash)
 *  transform — just changed via a transform (expanding wild, surge, supernova)
 *  pop       — being removed by a cascade (the framework animates it out)
 */
export type CellState = 'idle' | 'win' | 'dim' | 'landing' | 'transform' | 'pop';

export interface SymbolRenderOpts {
  state: CellState;
  /** true while drawn inside a spinning strip (render cheaply, no filters). */
  blurred?: boolean;
  /** Small glyph (paytable / round detail). */
  small?: boolean;
}

/**
 * SlotTheme — everything that makes a machine look like itself. The shared
 * framework (reels, overlays, controls, sequencing) is identical for every
 * machine; a theme only supplies art and colour.
 */
export interface SlotTheme {
  id: string;
  /** Render a symbol filling its (square) cell. Must be pure + cheap. */
  renderSymbol: (symbol: string, opts: SymbolRenderOpts) => ReactNode;
  /** Background art behind the reel window (fills the stage). */
  background?: ReactNode;
  /** Decorative frame around the reel window (children = the reels). */
  Frame?: (props: { children: ReactNode; inBonus: boolean }) => ReactNode;
  /** Logo shown above the reels. */
  logo?: ReactNode;
  /** Payline colours (cycled by line index). */
  lineColors: string[];
  /** Colour for way / cluster outlines and generic highlights. */
  highlight: string;
  /** Reel window background (CSS background value). */
  reelBackground: string;
  /** Thin separators between reels (CSS colour) — omit for none. */
  reelDivider?: string;
  /** Cell inner padding as a fraction of the cell size (default 0.08). */
  cellPadding?: number;
  /** Art for the free-spins intro/outro overlay. `open` animates from closed → open. */
  BonusArt?: (props: { open: boolean; reduced: boolean }) => ReactNode;
  /** Short copy for the free-spins intro. */
  bonusTitle?: string;
  /** Accent class for prominent numbers in overlays (e.g. 'text-gold'). */
  accentText?: string;
}

/** A displayed cell. `key` survives cascades so survivors can animate their fall. */
export interface CellModel {
  key: number;
  symbol: string;
  /** rows a NEW cell starts above its slot (cascade fall-in); 0 for survivors. */
  dropFrom?: number;
  state?: CellState;
}

export type ReelColumn = CellModel[];

/** Win currently presented: everything at once (`all`) or one win (cycling). */
export interface WinPresentation {
  wins: SpinWin[];
  /** Cells to highlight. */
  cells: Set<string>;
  /** Step multiplier for the label. */
  multiplier: number;
}

export const posKey = (r: number, y: number) => `${r}:${y}`;
