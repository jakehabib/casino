'use client';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { SlotTheme } from '../shared/types';
import { VaultDoor, renderGildedSymbol } from './symbols';

/**
 * Gilded Vault — dark metallic luxury: brushed steel frame with rivets,
 * graphite reels, selective gold (logo, wild, vault, big moments).
 */

function Rivet({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`absolute h-[7px] w-[7px] rounded-full sm:h-[9px] sm:w-[9px] ${className ?? ''}`}
      style={{
        background: 'radial-gradient(circle at 35% 30%, #ffffff 0%, #c9d0d8 25%, #6b737e 60%, #2b2f36 100%)',
        boxShadow: '0 1px 1px rgba(0,0,0,.7), inset 0 -1px 1px rgba(0,0,0,.35)',
      }}
    />
  );
}

function Frame({ children, inBonus }: { children: ReactNode; inBonus: boolean }) {
  const rivetsX = ['left-[3%]', 'left-[26%]', 'left-1/2 -translate-x-1/2', 'right-[26%]', 'right-[3%]'];
  return (
    <div
      className="relative rounded-[16px] p-[9px] sm:rounded-[20px] sm:p-[13px]"
      style={{
        background:
          'linear-gradient(180deg, #8d949e 0%, #c9cfd6 7%, #5d646e 22%, #3a3f47 50%, #545b65 78%, #a7aeb7 94%, #6b727c 100%)',
        boxShadow: inBonus
          ? '0 0 0 1px #00000099, 0 24px 60px -18px #000, 0 0 60px -10px #e2b45677, inset 0 1px 0 #ffffff55'
          : '0 0 0 1px #00000099, 0 24px 60px -18px #000, inset 0 1px 0 #ffffff55',
      }}
    >
      {/* brushed texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-40 mix-blend-overlay"
        style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,.18) 0 1px, rgba(0,0,0,.12) 1px 2px, transparent 2px 4px)' }}
      />
      {rivetsX.map((c) => (
        <Rivet key={`t${c}`} className={`top-[2px] sm:top-[3px] ${c}`} />
      ))}
      {rivetsX.map((c) => (
        <Rivet key={`b${c}`} className={`bottom-[2px] sm:bottom-[3px] ${c}`} />
      ))}
      <Rivet className="left-[2px] top-1/2 -translate-y-1/2 sm:left-[3px]" />
      <Rivet className="right-[2px] top-1/2 -translate-y-1/2 sm:right-[3px]" />
      {/* gold inlay */}
      <div
        className="relative overflow-hidden rounded-[9px] p-[2px] sm:rounded-[11px]"
        style={{ background: inBonus ? 'linear-gradient(180deg,#fff0c4,#c8963a 40%,#7c5418 60%,#e9c878)' : 'linear-gradient(180deg,#1a1d22,#0b0c0f)' }}
      >
        <div className="relative overflow-hidden rounded-[8px] sm:rounded-[10px]" style={{ boxShadow: 'inset 0 10px 22px -10px #000, inset 0 -10px 22px -10px #000' }}>
          {children}
          {/* glass reflection */}
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,.06) 0%, transparent 18%, transparent 82%, rgba(0,0,0,.35) 100%)' }} />
        </div>
      </div>
    </div>
  );
}

export function GildedVaultLogo({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 sm:gap-3" aria-label="Gilded Vault">
      <svg viewBox="0 0 100 100" className={compact ? 'h-8 w-8' : 'h-9 w-9 sm:h-11 sm:w-11'} aria-hidden>
        <VaultDoor turn={15} />
      </svg>
      <div className="leading-none">
        <div
          className="bg-gradient-to-b from-[#fff3cf] via-[#e2b456] to-[#9c7428] bg-clip-text text-[19px] font-black uppercase tracking-[0.2em] text-transparent sm:text-[24px]"
          style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.6))' }}
        >
          Gilded Vault
        </div>
        <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.42em] text-[#aeb5bf] sm:text-[10px]">20 lines · free spins</div>
      </div>
    </div>
  );
}

function Background() {
  return (
    <div className="absolute inset-0" style={{ background: 'radial-gradient(120% 80% at 50% 0%, #22252b 0%, #121418 45%, #08090b 100%)' }}>
      {/* faint concentric vault rings */}
      <svg className="absolute left-1/2 top-[46%] h-[150%] w-[150%] -translate-x-1/2 -translate-y-1/2 opacity-[0.07]" viewBox="0 0 200 200" aria-hidden>
        {[95, 80, 66, 52].map((r) => (
          <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="#e2b456" strokeWidth="0.4" />
        ))}
        {Array.from({ length: 24 }).map((_, i) => {
          const a = (i * Math.PI) / 12;
          return <circle key={i} cx={(100 + Math.cos(a) * 88).toFixed(2)} cy={(100 + Math.sin(a) * 88).toFixed(2)} r="1.2" fill="#e2b456" />;
        })}
      </svg>
      <div className="absolute inset-0 opacity-[0.35] mix-blend-overlay" style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,.05) 0 1px, transparent 1px 3px)' }} />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" />
    </div>
  );
}

/** Free-spins transition: the handle spins, then the vault door swings open onto gold light. */
function BonusArt({ open, reduced }: { open: boolean; reduced: boolean }) {
  return (
    <div className="relative h-full w-full" style={{ perspective: 600 }}>
      <motion.div
        className="absolute inset-[-30%] rounded-full"
        style={{ background: 'radial-gradient(closest-side, #fff3cf 0%, #e2b456aa 35%, #e2b45600 70%)' }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: open ? 1 : 0, scale: open ? 1 : 0.6 }}
        transition={{ duration: reduced ? 0 : 0.8, delay: reduced ? 0 : 0.7 }}
      />
      <motion.div
        className="absolute inset-0"
        style={{ transformOrigin: '0% 50%' }}
        initial={{ rotateY: 0 }}
        animate={{ rotateY: open && !reduced ? -78 : 0 }}
        transition={{ duration: 0.9, delay: reduced ? 0 : 0.75, ease: [0.65, 0, 0.35, 1] }}
      >
        <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-[0_12px_30px_rgba(0,0,0,.8)]">
          <VaultDoor turn={open && !reduced ? 240 : 0} turnMs={750} />
        </svg>
      </motion.div>
    </div>
  );
}

export const gildedVaultTheme: SlotTheme = {
  id: 'gilded-vault',
  renderSymbol: renderGildedSymbol,
  background: <Background />,
  Frame,
  logo: <GildedVaultLogo />,
  lineColors: ['#f3dfa8', '#9fd3ff', '#ffffff', '#f0b46a', '#c7b8ff', '#7fe0c0', '#ff9a9a', '#ffd36e'],
  highlight: '#f3dfa8',
  reelBackground: 'linear-gradient(180deg, #15171b 0%, #1d2026 50%, #15171b 100%)',
  reelDivider: 'rgba(0,0,0,.55)',
  cellPadding: 0.09,
  BonusArt,
  bonusTitle: 'The vault is open',
  accentText: 'text-gold-bright',
};
