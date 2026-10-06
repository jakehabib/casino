'use client';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import type { SlotTheme } from '../shared/types';
import { renderStarforgedSymbol, starPath } from './symbols';

/**
 * Starforged Relics — an ancient celestial observatory: deep teal night sky,
 * aged-brass instrument frame with a degree scale, faint orrery rings turning
 * behind the reels. Gold-bright is kept for the bonus (relic tiers, totals).
 */

const SF_CSS = `
@keyframes sf-turn { to { transform: translate(-50%,-50%) rotate(360deg); } }
@keyframes sf-turn-rev { to { transform: translate(-50%,-50%) rotate(-360deg); } }
@keyframes sf-twinkle { 0%,100% { opacity: .25 } 50% { opacity: .9 } }
@media (prefers-reduced-motion: reduce) { .sf-anim { animation: none !important; } }
`;

/** Cosmetic star field (fixed layout; no game meaning). */
const STARS = (() => {
  const out: { x: number; y: number; r: number; tw: boolean; d: number }[] = [];
  let s = 1337;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) >>> 8) / 16777216;
  for (let i = 0; i < 90; i++) out.push({ x: rnd() * 100, y: rnd() * 100, r: rnd() < 0.12 ? 1.6 : rnd() < 0.5 ? 1 : 0.6, tw: rnd() < 0.18, d: rnd() * 4 });
  return out;
})();

function Background() {
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: 'radial-gradient(120% 90% at 50% -8%, #134a4f 0%, #0b2e33 32%, #061b1f 62%, #030c0e 100%)' }}>
      <style>{SF_CSS}</style>
      {/* stars */}
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
        {STARS.map((st, i) => (
          <circle
            key={i}
            cx={`${st.x}%`}
            cy={`${st.y}%`}
            r={st.r}
            fill="#dffaf5"
            opacity={st.tw ? 0.6 : 0.35}
            className={st.tw ? 'sf-anim' : undefined}
            style={st.tw ? { animation: `sf-twinkle ${3 + st.d}s ease-in-out ${st.d}s infinite` } : undefined}
          />
        ))}
      </svg>
      {/* constellations */}
      <svg className="absolute left-[3%] top-[8%] h-[30%] w-[22%] opacity-[0.22]" viewBox="0 0 100 100" aria-hidden>
        <polyline points="6,70 24,52 40,58 58,30 82,22 94,40" fill="none" stroke="#9fe8ff" strokeWidth="0.6" />
        {[[6, 70], [24, 52], [40, 58], [58, 30], [82, 22], [94, 40]].map(([x, y]) => (
          <circle key={`${x}`} cx={x} cy={y} r="1.6" fill="#e9fffb" />
        ))}
      </svg>
      <svg className="absolute right-[4%] top-[52%] h-[30%] w-[20%] opacity-[0.2]" viewBox="0 0 100 100" aria-hidden>
        <polyline points="10,20 30,36 26,64 52,78 78,60 90,84" fill="none" stroke="#9fe8ff" strokeWidth="0.6" />
        {[[10, 20], [30, 36], [26, 64], [52, 78], [78, 60], [90, 84]].map(([x, y]) => (
          <circle key={`${x}`} cx={x} cy={y} r="1.6" fill="#e9fffb" />
        ))}
      </svg>
      {/* orrery rings behind the reels */}
      <svg
        className="sf-anim absolute left-1/2 top-[52%] h-[150%] w-[150%] opacity-[0.12]"
        style={{ transform: 'translate(-50%,-50%)', animation: 'sf-turn 240s linear infinite' }}
        viewBox="0 0 200 200"
        aria-hidden
      >
        <circle cx="100" cy="100" r="96" fill="none" stroke="#d9b46a" strokeWidth="0.35" />
        <circle cx="100" cy="100" r="78" fill="none" stroke="#d9b46a" strokeWidth="0.25" strokeDasharray="0.6 2.2" />
        <circle cx="100" cy="100" r="62" fill="none" stroke="#d9b46a" strokeWidth="0.3" />
        <circle cx="196" cy="100" r="2.2" fill="#d9b46a" />
        <circle cx="38" cy="100" r="1.6" fill="#9fe8ff" />
        {Array.from({ length: 72 }).map((_, i) => {
          const a = (i * Math.PI) / 36;
          const r2 = i % 6 === 0 ? 90 : 93;
          return <line key={i} x1={100 + Math.cos(a) * 96} y1={100 + Math.sin(a) * 96} x2={100 + Math.cos(a) * r2} y2={100 + Math.sin(a) * r2} stroke="#d9b46a" strokeWidth="0.3" />;
        })}
      </svg>
      <svg
        className="sf-anim absolute left-1/2 top-[52%] h-[110%] w-[110%] opacity-[0.1]"
        style={{ transform: 'translate(-50%,-50%)', animation: 'sf-turn-rev 180s linear infinite' }}
        viewBox="0 0 200 200"
        aria-hidden
      >
        <ellipse cx="100" cy="100" rx="96" ry="40" fill="none" stroke="#9fe8ff" strokeWidth="0.35" transform="rotate(-18 100 100)" />
        <circle cx="12" cy="128" r="2" fill="#9fe8ff" />
      </svg>
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/55 to-transparent" />
    </div>
  );
}

/** Small 8-point brass rosette for the frame corners. */
function Rosette({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 40 40" className={`absolute z-10 h-[18px] w-[18px] sm:h-[24px] sm:w-[24px] ${className}`} aria-hidden>
      <circle cx="20" cy="20" r="17" fill="#0a2a2e" stroke="url(#sf-brass)" strokeWidth="2.4" />
      <path d={starPath(20, 20, 8, 14, 5)} fill="url(#sf-brass)" stroke="#4d3411" strokeWidth="0.6" />
      <circle cx="20" cy="20" r="3" fill="#c9fff6" />
    </svg>
  );
}

/** Degree scale along a brass band (pure CSS). */
const SCALE_TICKS =
  'repeating-linear-gradient(90deg, rgba(43,26,6,.75) 0 1px, transparent 1px 6px), repeating-linear-gradient(90deg, rgba(43,26,6,.85) 0 1px, transparent 1px 30px)';

function Frame({ children, inBonus }: { children: ReactNode; inBonus: boolean }) {
  return (
    <div
      className="relative rounded-[14px] p-[7px] transition-shadow duration-700 sm:rounded-[18px] sm:p-[10px]"
      style={{
        background: 'linear-gradient(180deg, #f1dca4 0%, #b88d47 9%, #7a5622 30%, #5a3f17 50%, #7a5622 70%, #c49a55 92%, #e9cf8f 100%)',
        boxShadow: inBonus
          ? '0 0 0 1px #000c, 0 26px 60px -20px #000, 0 0 70px -12px #3fd0c0aa, inset 0 1px 0 #fff6, inset 0 -1px 0 #0008'
          : '0 0 0 1px #000c, 0 26px 60px -20px #000, inset 0 1px 0 #fff6, inset 0 -1px 0 #0008',
      }}
    >
      {/* degree scales on the top and bottom bands */}
      <div aria-hidden className="pointer-events-none absolute inset-x-[22px] top-[1px] h-[4px] opacity-70 sm:inset-x-[30px] sm:top-[2px] sm:h-[6px]" style={{ backgroundImage: SCALE_TICKS }} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[22px] bottom-[1px] h-[4px] rotate-180 opacity-70 sm:inset-x-[30px] sm:bottom-[2px] sm:h-[6px]"
        style={{ backgroundImage: SCALE_TICKS }}
      />
      <Rosette className="-left-[6px] -top-[6px] sm:-left-[8px] sm:-top-[8px]" />
      <Rosette className="-right-[6px] -top-[6px] sm:-right-[8px] sm:-top-[8px]" />
      <Rosette className="-bottom-[6px] -left-[6px] sm:-bottom-[8px] sm:-left-[8px]" />
      <Rosette className="-bottom-[6px] -right-[6px] sm:-bottom-[8px] sm:-right-[8px]" />
      {/* inner bezel: teal enamel line in the base game, lit starlight in the bonus */}
      <div
        className="relative overflow-hidden rounded-[8px] p-[2px] sm:rounded-[10px]"
        style={{ background: inBonus ? 'linear-gradient(180deg,#c9fff6,#3fd0c0 45%,#0d5a57 70%,#9fe8ff)' : 'linear-gradient(180deg,#0f3a3e,#041316)' }}
      >
        <div className="relative overflow-hidden rounded-[7px] sm:rounded-[9px]" style={{ boxShadow: 'inset 0 10px 24px -10px #000, inset 0 -10px 24px -10px #000' }}>
          {children}
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(200,255,245,.05) 0%, transparent 16%, transparent 84%, rgba(0,0,0,.32) 100%)' }} />
        </div>
      </div>
    </div>
  );
}

/** Brand mark: a miniature astrolabe with a star rising through it. */
export function StarforgedEmblem({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <circle cx="50" cy="50" r="44" fill="url(#sf-night)" stroke="url(#sf-brass)" strokeWidth="5" />
      {Array.from({ length: 24 }).map((_, i) => {
        const a = (i * Math.PI) / 12;
        return <line key={i} x1={50 + Math.cos(a) * 34} y1={50 + Math.sin(a) * 34} x2={50 + Math.cos(a) * (i % 2 ? 37 : 39)} y2={50 + Math.sin(a) * (i % 2 ? 37 : 39)} stroke="#d9b46a" strokeWidth="1.4" />;
      })}
      <ellipse cx="50" cy="50" rx="27" ry="11" fill="none" stroke="url(#sf-brass-h)" strokeWidth="2.4" transform="rotate(-24 50 50)" />
      <path d={starPath(50, 50, 4, 22, 5)} fill="#effffb" />
      <circle cx="73" cy="40" r="3.4" fill="url(#sf-brass)" />
    </svg>
  );
}

export function StarforgedLogo() {
  return (
    <div className="flex items-center gap-3" aria-label="Starforged Relics">
      <StarforgedEmblem className="h-9 w-9 drop-shadow-[0_2px_8px_rgba(0,0,0,.6)] sm:h-11 sm:w-11" />
      <div className="leading-none">
        <div
          className="bg-gradient-to-b from-[#fbefcc] via-[#dcb873] to-[#8c6428] bg-clip-text text-[18px] font-semibold uppercase tracking-[0.34em] text-transparent sm:text-[23px]"
          style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.6))' }}
        >
          Starforged
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="h-px w-5 bg-gradient-to-r from-transparent to-[#9fe8ff88]" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.6em] text-[#9fe8ff] sm:text-[11px]">Relics</span>
          <span className="h-px flex-1 bg-gradient-to-r from-[#9fe8ff88] to-transparent" />
        </div>
      </div>
    </div>
  );
}

/**
 * Free-spins art: an armillary orrery. Its three rings sit askew, then swing
 * into alignment while the star gate at its heart ignites.
 */
function BonusArt({ open, reduced }: { open: boolean; reduced: boolean }) {
  const t = (d: number) => ({ duration: reduced ? 0 : 1.2, delay: reduced ? 0 : d, ease: [0.65, 0, 0.35, 1] as const });
  return (
    <div className="relative h-full w-full">
      <motion.div
        className="absolute inset-[-55%] rounded-full"
        style={{ background: 'radial-gradient(closest-side, #c9fff6aa 0%, #3fd0c044 40%, #3fd0c000 72%)' }}
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: open ? 1 : 0, scale: open ? 1 : 0.4 }}
        transition={{ duration: reduced ? 0 : 1, delay: reduced ? 0 : 0.9 }}
      />
      <svg viewBox="0 0 100 100" className="relative h-full w-full overflow-visible drop-shadow-[0_10px_24px_rgba(0,0,0,.8)]">
        <circle cx="50" cy="50" r="46" fill="none" stroke="url(#sf-brass)" strokeWidth="3" />
        {Array.from({ length: 36 }).map((_, i) => {
          const a = (i * Math.PI) / 18;
          return <line key={i} x1={50 + Math.cos(a) * 42} y1={50 + Math.sin(a) * 42} x2={50 + Math.cos(a) * (i % 3 ? 44 : 45.5)} y2={50 + Math.sin(a) * (i % 3 ? 44 : 45.5)} stroke="#d9b46a" strokeWidth="0.8" />;
        })}
        {[
          { rx: 38, ry: 13, from: -50, to: 0, d: 0.5, c: 'url(#sf-brass-h)' },
          { rx: 34, ry: 12, from: 70, to: 60, d: 0.65, c: 'url(#sf-brass-h)' },
          { rx: 30, ry: 10, from: 20, to: -60, d: 0.8, c: '#9fe8ff' },
        ].map((r, i) => (
          <motion.g key={i} style={{ originX: '50px', originY: '50px' }} initial={{ rotate: r.from }} animate={{ rotate: open ? r.to : r.from }} transition={t(r.d)}>
            <ellipse cx="50" cy="50" rx={r.rx} ry={r.ry} fill="none" stroke={r.c} strokeWidth={i === 2 ? 1.4 : 2.6} />
            <circle cx={50 + r.rx} cy="50" r={i === 2 ? 2.2 : 3.2} fill={i === 2 ? '#c9fff6' : 'url(#sf-brass)'} />
          </motion.g>
        ))}
        <motion.g style={{ originX: '50px', originY: '50px' }} initial={{ scale: 0.35, opacity: 0.6 }} animate={{ scale: open ? 1 : 0.35, opacity: 1 }} transition={t(1.1)}>
          <circle cx="50" cy="50" r="16" fill="url(#sf-nova)" />
          <path d={starPath(50, 50, 4, 14, 3)} fill="#ffffff" />
        </motion.g>
      </svg>
    </div>
  );
}

export const starforgedTheme: SlotTheme = {
  id: 'starforged-relics',
  renderSymbol: renderStarforgedSymbol,
  background: <Background />,
  Frame,
  logo: <StarforgedLogo />,
  lineColors: ['#ecd49a', '#5fe3d2', '#f59ab5', '#86bcff', '#f7c15f'],
  highlight: '#ecd49a',
  reelBackground:
    'radial-gradient(circle at 50% 50%, rgba(95,227,210,.07) 0 30%, rgba(95,227,210,.025) 31% 44%, transparent 45%) 0 0 / calc(100% / 6) calc(100% / 5), linear-gradient(180deg, #072124 0%, #0b2c30 50%, #061b1e 100%)',
  reelDivider: 'rgba(217,180,106,.08)',
  cellPadding: 0.075,
  BonusArt,
  bonusTitle: 'The star gate opens',
  accentText: 'text-gold-bright',
};
