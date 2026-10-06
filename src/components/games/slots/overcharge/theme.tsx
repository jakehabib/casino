'use client';
import { motion } from 'framer-motion';
import type { SlotTheme } from '../shared/types';
import { SurgeRing, renderOverchargeSymbol } from './symbols';

/**
 * Overcharge — refined dark cyber. Graphite chassis, an ink-blue reel bay,
 * one electric cyan for energy and amber only when the system runs hot
 * (max chain, ×2 wilds, free spins). No neon wash: light comes from the
 * symbols themselves and from the chain level.
 */

export const OC_CYAN = '#5fe0ff';
export const OC_AMBER = '#ffbf5a';

/** Faint circuit-board traces (one hand-routed tile, repeated). */
function CircuitPattern() {
  return (
    <svg className="absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <pattern id="oc-circuit" width="180" height="180" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="#7fe8ff" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M0 30 H48 L66 48 H118" />
            <path d="M118 48 L136 30 H180" />
            <path d="M30 0 V18 L44 32" />
            <path d="M90 180 V140 L108 122 H150 L168 104 V60" />
            <path d="M0 120 H40 L58 138 V180" />
            <path d="M150 0 V22" />
            <path d="M66 86 H96 L110 72" />
          </g>
          <g fill="#7fe8ff">
            <circle cx="118" cy="48" r="2.6" />
            <circle cx="44" cy="32" r="2.2" />
            <circle cx="168" cy="60" r="2.6" />
            <circle cx="150" cy="22" r="2.2" />
            <circle cx="66" cy="86" r="2.2" />
            <circle cx="110" cy="72" r="2.2" />
          </g>
        </pattern>
        <radialGradient id="oc-circuit-fade" cx="50%" cy="45%" r="70%">
          <stop offset="0.25" stopColor="#fff" stopOpacity="0.25" />
          <stop offset="1" stopColor="#fff" stopOpacity="1" />
        </radialGradient>
        <mask id="oc-circuit-mask">
          <rect width="100%" height="100%" fill="url(#oc-circuit-fade)" />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill="url(#oc-circuit)" mask="url(#oc-circuit-mask)" opacity="0.07" />
    </svg>
  );
}

/** Stage background. `charge` (0..1) raises the bay glow behind the reels as the chain climbs. */
export function OverchargeBackground({ charge = 0, hot = false }: { charge?: number; hot?: boolean }) {
  const c = hot ? '255,191,90' : '95,224,255';
  return (
    <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 75% at 50% -5%, #0f1d2b 0%, #08101a 42%, #04070b 100%)' }}>
      <CircuitPattern />
      <div
        className="absolute left-1/2 top-[55%] h-[85%] w-[85%] -translate-x-1/2 -translate-y-1/2 rounded-full transition-[background,opacity] duration-700"
        style={{ background: `radial-gradient(closest-side, rgba(${c},0.22), rgba(${c},0.05) 60%, transparent)`, opacity: 0.35 + charge * 0.65 }}
      />
      {/* horizon rule under the logo */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#7fe8ff40] to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/55 to-transparent" />
    </div>
  );
}

export function OverchargeLogo() {
  return (
    <div className="flex items-center gap-2.5 sm:gap-3" aria-label="Overcharge">
      <svg viewBox="0 0 100 100" className="h-9 w-9 sm:h-11 sm:w-11" aria-hidden>
        <SurgeRing lit={11} label={false} />
      </svg>
      <div className="leading-none">
        <div className="flex items-baseline text-[20px] uppercase tracking-[0.18em] sm:text-[25px]" style={{ filter: 'drop-shadow(0 2px 8px rgba(0,0,0,.7))' }}>
          <span className="font-light text-[#c9d6e3]">Over</span>
          <span className="bg-gradient-to-b from-[#f2fdff] via-[#9cecff] to-[#3cbfe6] bg-clip-text font-black text-transparent">charge</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.36em] text-[#7487a0] sm:text-[10px]">
          <span>1,024 ways</span>
          <span className="h-1 w-1 rotate-45 bg-[#5fe0ff]" />
          <span>Cascades</span>
        </div>
      </div>
    </div>
  );
}

/** Free-spins art: the Surge ring charges segment by segment, then discharges. */
function BonusArt({ open, reduced }: { open: boolean; reduced: boolean }) {
  return (
    <div className="relative h-full w-full">
      <motion.div
        className="absolute inset-[-40%] rounded-full"
        style={{ background: 'radial-gradient(closest-side, rgba(127,232,255,.35), rgba(159,139,255,.12) 50%, transparent 75%)' }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: open ? 1 : 0.2, scale: open ? 1 : 0.6 }}
        transition={{ duration: reduced ? 0 : 0.9, delay: reduced ? 0 : 0.85 }}
      />
      {!reduced && open ? (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ boxShadow: '0 0 0 2px #9cecff' }}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: [0.9, 1.9], opacity: [0, 0.9, 0] }}
          transition={{ duration: 0.9, delay: 0.95, ease: [0.22, 1, 0.36, 1] }}
        />
      ) : null}
      <ChargingRing open={open} reduced={reduced} />
    </div>
  );
}

function ChargingRing({ open, reduced }: { open: boolean; reduced: boolean }) {
  return (
    <svg viewBox="0 0 100 100" className="relative h-full w-full drop-shadow-[0_10px_30px_rgba(0,0,0,.8)]" aria-hidden>
      <circle cx="50" cy="50" r="45" fill="url(#oc-dark)" stroke="url(#oc-metal)" strokeWidth="2.6" />
      {Array.from({ length: 16 }, (_, i) => (
        <g key={i} transform={`rotate(${i * 22.5 + 2.2} 50 50)`}>
          <path d="M50 11.5 A38.5 38.5 0 0 1 64.3 14.25" fill="none" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="6.5" />
          <motion.path
            d="M50 11.5 A38.5 38.5 0 0 1 64.3 14.25"
            fill="none"
            stroke="url(#oc-surge)"
            strokeWidth="6.5"
            initial={{ opacity: reduced ? 1 : 0 }}
            animate={{ opacity: open ? 1 : 0 }}
            transition={{ duration: reduced ? 0 : 0.08, delay: reduced ? 0 : i * 0.045 }}
          />
        </g>
      ))}
      <circle cx="50" cy="50" r="29" fill="#060a11" stroke="#ffffff" strokeOpacity="0.14" strokeWidth="1.2" />
      <motion.g
        initial={{ opacity: reduced ? 1 : 0.35 }}
        animate={{ opacity: open ? 1 : 0.35 }}
        transition={{ duration: reduced ? 0 : 0.2, delay: reduced ? 0 : 0.8 }}
        style={{ filter: 'drop-shadow(0 0 6px #7fe8ff)' }}
      >
        <path d="M57 26 L40 52 H50 L45 74 L62 46 H52 L58 26 Z" fill="#f2fbff" />
      </motion.g>
    </svg>
  );
}

export const overchargeTheme: SlotTheme = {
  id: 'overcharge',
  renderSymbol: renderOverchargeSymbol,
  lineColors: [OC_CYAN],
  highlight: OC_CYAN,
  reelBackground: [
    'linear-gradient(180deg, rgba(0,0,0,.35) 0%, transparent 14%, transparent 86%, rgba(0,0,0,.45) 100%)',
    'repeating-linear-gradient(180deg, transparent 0 calc(25% - 1px), rgba(127,232,255,.045) calc(25% - 1px) 25%)',
    'linear-gradient(180deg, #060a10 0%, #0a111a 50%, #060a10 100%)',
  ].join(', '),
  reelDivider: 'rgba(127,232,255,.07)',
  cellPadding: 0.1,
  BonusArt,
  bonusTitle: 'System overcharged',
  accentText: 'text-[#9cecff]',
};
