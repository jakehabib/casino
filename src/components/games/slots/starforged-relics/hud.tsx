'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { formatCredits } from '@/lib/format';
import { CreditIcon } from '@/components/ui/credit-icon';
import type { SpinModifier } from '@/engines/slots/types';
import type { PublicBonus, PublicSlotDefinition } from '../shared/types';
import { StarforgedGlyph } from './symbols';
import { MODIFIER_COPY, OrreryGlyph } from './fx';

/**
 * Starforged HUD pieces: the base-game modifier strip (Star Surge · Relic
 * Wilds · Orrery — the fired one lights up), the free-spins HUD and the relic
 * collection meter whose tier medallions carry the growing bonus multiplier.
 */

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V'];

const panel = 'border border-[#d9b46a33] bg-[#041416]/75 backdrop-blur-md shadow-[inset_0_1px_0_#ffffff0d]';

// ─── base game: modifier strip ───────────────────────────────────────────────

const MODS: SpinModifier['kind'][] = ['STAR_SURGE', 'RELIC_WILDS', 'ORRERY'];

function ModGlyph({ kind }: { kind: SpinModifier['kind'] }) {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible" aria-hidden>
      {kind === 'ORRERY' ? <OrreryGlyph /> : kind === 'RELIC_WILDS' ? <StarforgedGlyph symbol="WILD" plain /> : <StarforgedGlyph symbol="SUPERNOVA" plain />}
    </svg>
  );
}

export function ModifierStrip({ active }: { active: SpinModifier | null }) {
  return (
    <div className="flex w-full items-center justify-center gap-1.5 sm:gap-2" aria-label="Celestial modifiers">
      {MODS.map((k) => {
        const on = active?.kind === k;
        return (
          <motion.div
            key={k}
            animate={{ scale: on ? 1.04 : 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            className={cn(
              'relative flex min-w-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 transition-colors duration-300 sm:gap-2 sm:pr-3.5',
              panel,
              on && 'border-[#f5d589aa] bg-[#0b2b2e]/90',
            )}
          >
            {on ? (
              <motion.span
                layoutId="sf-mod-glow"
                aria-hidden
                className="absolute inset-0 rounded-full"
                style={{ boxShadow: '0 0 0 1px #f5d58955, 0 0 22px -4px #f5d589aa' }}
              />
            ) : null}
            <span className={cn('h-5 w-5 shrink-0 transition-opacity sm:h-6 sm:w-6', on ? 'opacity-100' : 'opacity-55')}>
              <ModGlyph kind={k} />
            </span>
            <span className={cn('truncate text-[9.5px] font-semibold uppercase tracking-[0.16em] sm:text-[10.5px]', on ? 'text-[#f5e3b3]' : 'text-[#9fc9c4]/60')}>
              {MODIFIER_COPY[k]}
              {on && active?.kind === 'ORRERY' ? <span className="ml-1 text-gold-bright">×{active.multiplier}</span> : null}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

// ─── free spins: HUD ─────────────────────────────────────────────────────────

function Stat({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-[78px] rounded-lg px-3 py-1.5 text-center sm:min-w-[96px]', panel, className)}>
      <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#9fc9c4]/70">{label}</div>
      <div className="text-[15px] font-extrabold leading-tight sm:text-base">{children}</div>
    </div>
  );
}

export function StarforgedBonusHud({ bonus, current, multiplier }: { bonus: PublicBonus; current: number | null; multiplier: number }) {
  return (
    <div className="flex items-stretch justify-center gap-1.5 sm:gap-2" data-testid="slot-bonus-hud">
      <Stat label="Free spins">
        <span className="tabular text-[#f5e3b3]">{Math.min(current ?? bonus.played, bonus.total)}</span>
        <span className="tabular text-white/40"> / {bonus.total}</span>
      </Stat>
      <div className={cn('relative flex min-w-[70px] flex-col items-center justify-center rounded-lg px-3 py-1', panel, 'border-[#f5d58966]')}>
        <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[#9fc9c4]/70">Bonus</div>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={multiplier}
            initial={{ scale: 1.9, opacity: 0, filter: 'brightness(2)' }}
            animate={{ scale: 1, opacity: 1, filter: 'brightness(1)' }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 16 }}
            className="tabular text-[17px] font-black leading-tight text-gold-bright sm:text-lg"
          >
            ×{multiplier}
          </motion.div>
        </AnimatePresence>
      </div>
      <Stat label="Bonus win">
        <span className="tabular inline-flex items-center gap-1 text-white">
          <CreditIcon size={13} />
          {formatCredits(bonus.bonusWin)}
        </span>
      </Stat>
    </div>
  );
}

// ─── relic meter ─────────────────────────────────────────────────────────────

export function RelicMeter({
  def,
  collected,
  tier,
  pulse,
  reduced,
}: {
  def: PublicSlotDefinition;
  collected: number;
  tier: number;
  /** Increments whenever relics are collected (drives the count pop). */
  pulse: number;
  reduced: boolean;
}) {
  const rules = def.relics;
  if (!rules) return null;
  const max = rules.thresholds[rules.thresholds.length - 1];
  const pct = Math.min(1, collected / max) * 100;
  const next = rules.thresholds[tier];
  return (
    <div className={cn('flex w-full max-w-[640px] items-center gap-2.5 rounded-xl px-2.5 py-1.5 sm:gap-3.5 sm:px-3.5', panel)} data-testid="sf-relic-meter" aria-label={`Relics ${collected}, tier ${tier}`}>
      <div className="flex shrink-0 items-center gap-1.5">
        <svg viewBox="0 0 100 100" className="h-7 w-7 overflow-visible sm:h-8 sm:w-8" aria-hidden>
          <StarforgedGlyph symbol="RELIC" plain />
        </svg>
        <div className="leading-none">
          <div className="text-[8.5px] font-semibold uppercase tracking-[0.18em] text-[#9fc9c4]/70">Relics</div>
          <motion.div key={pulse} initial={reduced ? false : { scale: 1.5, color: '#ffd2b0' }} animate={{ scale: 1, color: '#ffffff' }} transition={{ duration: 0.5 }} className="tabular mt-0.5 origin-left text-[15px] font-extrabold">
            {collected}
          </motion.div>
        </div>
      </div>

      {/* track */}
      <div className="relative mx-2 h-9 flex-1 sm:mx-3">
        <div className="absolute inset-x-0 top-[13px] h-[5px] rounded-full bg-black/60 shadow-[inset_0_1px_2px_#000]" />
        {/* relic ticks */}
        {Array.from({ length: max - 1 }).map((_, i) => (
          <span key={i} className="absolute top-[13px] h-[5px] w-px bg-white/10" style={{ left: `${((i + 1) / max) * 100}%` }} />
        ))}
        <motion.div
          className="absolute left-0 top-[13px] h-[5px] rounded-full"
          style={{ background: 'linear-gradient(90deg, #8c6428, #dcb873 55%, #ffb88a)', boxShadow: '0 0 10px #ffb88a88' }}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: reduced ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
        {rules.thresholds.map((t, i) => {
          const reached = tier > i;
          const m = rules.multipliers[i + 1];
          return (
            <div key={t} className="absolute top-0 -translate-x-1/2" style={{ left: `${(t / max) * 100}%` }}>
              <div className="relative flex flex-col items-center">
                <motion.div
                  className={cn(
                    'relative z-[1] flex h-[31px] w-[31px] items-center justify-center rounded-full border text-[10.5px] font-black tabular sm:h-[31px] sm:w-[31px]',
                    reached ? 'border-[#fff1cf] text-[#2b1a06]' : 'border-[#d9b46a55] bg-[#06191c] text-[#d9b46a]/70',
                  )}
                  style={reached ? { background: 'radial-gradient(circle at 40% 30%, #fff6dc, #f5d589 40%, #b88a3e)', boxShadow: '0 0 16px #f5d58999' } : undefined}
                  initial={false}
                  animate={reached && !reduced ? { scale: [1, 1.3, 1] } : { scale: 1 }}
                  transition={{ duration: 0.6 }}
                >
                  ×{m}
                  {reached && !reduced ? (
                    <motion.span
                      key={`burst-${t}`}
                      aria-hidden
                      className="absolute inset-0 rounded-full border-2 border-[#f5d589]"
                      initial={{ scale: 1, opacity: 0.9 }}
                      animate={{ scale: 2.4, opacity: 0 }}
                      transition={{ duration: 0.9, ease: 'easeOut' }}
                    />
                  ) : null}
                </motion.div>
                <span className={cn('tabular absolute top-[32px] whitespace-nowrap text-[8.5px] font-semibold', reached ? 'text-[#f5e3b3]' : 'text-white/35')}>{t}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden shrink-0 text-right leading-tight sm:block">
        <div className="text-[8.5px] font-semibold uppercase tracking-[0.18em] text-[#9fc9c4]/70">{next ? `Tier ${ROMAN[tier + 1]}` : 'Max tier'}</div>
        <div className="tabular mt-0.5 text-[12px] font-bold text-white/85">{next ? `${Math.max(0, next - collected)} to go · +${rules.spinsPerTier}` : `×${rules.multipliers[rules.multipliers.length - 1]}`}</div>
      </div>
    </div>
  );
}

// ─── banners ─────────────────────────────────────────────────────────────────

export function TierUpBanner({ tier, multiplier, spins }: { tier: number; multiplier: number; spins: number }) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-x-0 top-[34%] z-30 flex justify-center px-4"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.08, transition: { duration: 0.25 } }}
      transition={{ type: 'spring', stiffness: 360, damping: 22 }}
    >
      <div className="relative flex items-center gap-4 rounded-2xl border border-[#f5d58966] bg-[#041416]/90 py-3 pl-3 pr-6 shadow-3 backdrop-blur-md">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-black text-[#2b1a06]"
          style={{ background: 'radial-gradient(circle at 40% 30%, #fff6dc, #f5d589 40%, #b88a3e)', boxShadow: '0 0 30px #f5d58988' }}
        >
          ×{multiplier}
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#9fe8ff]/80">Relic tier {ROMAN[tier] ?? tier}</div>
          <div className="mt-0.5 text-lg font-black uppercase tracking-wide text-gold-bright sm:text-xl">Multiplier ×{multiplier}</div>
          <div className="text-xs font-medium text-white/65">+{spins} free spins</div>
        </div>
      </div>
    </motion.div>
  );
}

export function StarforgedBanner({ text, sub }: { text: string; sub?: string }) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-x-0 top-[38%] z-30 flex justify-center px-4"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.08, transition: { duration: 0.25 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
    >
      <div className="rounded-2xl border border-[#d9b46a55] bg-[#041416]/90 px-6 py-3 text-center shadow-3 backdrop-blur-md">
        <div className="text-xl font-black uppercase tracking-[0.08em] text-gold-bright sm:text-2xl">{text}</div>
        {sub ? <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9fe8ff]/75">{sub}</div> : null}
      </div>
    </motion.div>
  );
}
