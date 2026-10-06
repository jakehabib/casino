import type { PayMode, SlotDefinition, SymbolKind, Volatility } from './types';

/**
 * Client-facing projection of a SlotDefinition: everything the UI needs for
 * the info/paytable modal and for rendering (symbols, pays, lines, feature
 * rules) — but no reel weights (they are not needed to animate a result).
 */
export interface PublicSymbol {
  id: string;
  name: string;
  kind: SymbolKind;
  tier?: 'low' | 'high' | 'premium';
  multiplier?: number;
}

export interface PublicPay {
  /** count (lines/ways: symbols/reels; cluster: minimum cluster size; scatter: scatters) */
  count: number;
  /** hundredths of total bet (per line / per way / per cluster) */
  value: number;
}

export interface PublicSlotDefinition {
  id: string;
  name: string;
  reels: number;
  rows: number;
  mode: PayMode;
  /** lines: number of paylines · ways: rows^reels · cluster: minimum cluster size */
  modeCount: number;
  volatility: Volatility;
  rtpTarget: number;
  /** Measured RTP (%) over `rounds` simulated rounds. */
  rtpSimulated: { rtp: number; rounds: number };
  maxWinX: number;
  symbols: PublicSymbol[];
  /** Paying symbols, highest first. Values are per line (lines) / per way (ways) / per cluster (cluster). */
  paytable: { symbol: string; pays: PublicPay[] }[];
  paylines?: number[][];
  wilds: string[];
  expandingWilds: 'never' | 'free-spins' | 'always';
  scatter: { symbol: string; minCount: number; pays: PublicPay[]; freeSpins: PublicPay[]; retrigger: PublicPay[] };
  cascade: { multipliers: number[]; persistInFreeSpins: boolean } | null;
  relics: { symbol: string; thresholds: number[]; multipliers: number[]; spinsPerTier: number } | null;
  modifiers: string[];
  expander: { symbol: string; radius: number } | null;
  featureText: { title: string; body: string }[];
}

const pays = (t: Record<number, number> | undefined): PublicPay[] =>
  Object.entries(t ?? {})
    .map(([k, v]) => ({ count: Number(k), value: v }))
    .sort((a, b) => a.count - b.count);

export function toPublicDefinition(def: SlotDefinition): PublicSlotDefinition {
  const top = (sym: string) => {
    const vals = Object.values(def.paytable[sym] ?? {});
    return vals.length ? Math.max(...vals) : 0;
  };
  const paying = def.symbols.filter((s) => def.paytable[s.id]).sort((a, b) => top(b.id) - top(a.id));
  return {
    id: def.id,
    name: def.name,
    reels: def.reels,
    rows: def.rows,
    mode: def.mode,
    modeCount: def.mode === 'lines' ? (def.paylines?.length ?? 0) : def.mode === 'ways' ? def.rows ** def.reels : (def.clusterMin ?? 5),
    volatility: def.volatility,
    rtpTarget: def.rtpTarget,
    rtpSimulated: def.rtpSimulated,
    maxWinX: def.maxWinX,
    symbols: def.symbols.map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      ...(s.tier ? { tier: s.tier } : {}),
      ...(s.multiplier ? { multiplier: s.multiplier } : {}),
    })),
    paytable: paying.map((s) => ({ symbol: s.id, pays: pays(def.paytable[s.id]) })),
    ...(def.paylines ? { paylines: def.paylines } : {}),
    wilds: def.wildRules.symbols,
    expandingWilds: def.wildRules.expand ?? 'never',
    scatter: {
      symbol: def.scatterRules.symbol,
      minCount: def.scatterRules.minCount,
      pays: pays(def.scatterRules.pays),
      freeSpins: pays(def.scatterRules.freeSpins),
      retrigger: pays(def.scatterRules.retrigger),
    },
    cascade: def.cascadeRules
      ? { multipliers: def.cascadeRules.multipliers, persistInFreeSpins: !!def.cascadeRules.persistInFreeSpins }
      : null,
    relics: def.bonusRules.relics ?? null,
    modifiers: def.modifiers?.list.map((m) => m.kind) ?? [],
    expander: def.expander ? { symbol: def.expander.symbol, radius: def.expander.radius } : null,
    featureText: def.featureText,
  };
}

/** Format a hundredths-of-bet value as a multiplier string, e.g. 250 → "2.5×", 5 → "0.05×". */
export function formatPayX(value: number): string {
  const x = value / 100;
  const s = Number.isInteger(x) ? x.toString() : x.toFixed(2).replace(/0$/, '');
  return `${s}×`;
}
