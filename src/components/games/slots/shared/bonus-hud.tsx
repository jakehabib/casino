'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { formatCredits } from '@/lib/format';
import { CreditIcon } from '@/components/ui/credit-icon';
import type { PublicBonus, PublicSlotDefinition } from './types';

/**
 * Free-spins HUD: "Free spins x / y", persistent multiplier, bonus win and
 * (machines with relics) tier progress. Renders nothing in the base game.
 */
export function BonusHud({
  def,
  bonus,
  current,
  accentClass = 'text-gold-bright',
  className,
}: {
  def: PublicSlotDefinition;
  bonus: PublicBonus | null;
  /** Spin number being played (1-based), or null to show `bonus.played`. */
  current: number | null;
  accentClass?: string;
  className?: string;
}) {
  const relics = def.relics;
  const ladder = def.cascade && def.cascade.persistInFreeSpins ? def.cascade.multipliers : null;
  const mult = bonus ? (ladder ? ladder[Math.min(bonus.cascadeLevel, ladder.length - 1)] * bonus.multiplier : bonus.multiplier) : 1;
  return (
    <AnimatePresence>
      {bonus ? (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className={cn('flex flex-wrap items-stretch justify-center gap-2', className)}
          data-testid="slot-bonus-hud"
        >
          <Pill label="Free spins">
            <span className={cn('tabular', accentClass)}>{Math.min(current ?? bonus.played, bonus.total)}</span>
            <span className="tabular text-white/45"> / {bonus.total}</span>
          </Pill>
          {mult > 1 || relics || ladder ? (
            <Pill label="Multiplier">
              <motion.span key={mult} initial={{ scale: 1.5 }} animate={{ scale: 1 }} className={cn('tabular inline-block', accentClass)}>
                ×{mult}
              </motion.span>
            </Pill>
          ) : null}
          <Pill label="Bonus win">
            <span className="tabular inline-flex items-center gap-1 text-white">
              <CreditIcon size={13} />
              {formatCredits(bonus.bonusWin)}
            </span>
          </Pill>
          {relics ? (
            <Pill label={`Relics · tier ${bonus.relicTier}`}>
              <span className="tabular text-white">
                {bonus.relics}
                <span className="text-white/45"> / {relics.thresholds[bonus.relicTier] ?? 'max'}</span>
              </span>
            </Pill>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function Pill({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[84px] rounded-lg border border-white/10 bg-black/45 px-3 py-1.5 text-center backdrop-blur">
      <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white/50">{label}</div>
      <div className="text-[15px] font-extrabold leading-tight">{children}</div>
    </div>
  );
}

/** Cascade multiplier ladder (e.g. 1× 2× 3× 5× 10×) with the active rung lit. */
export function MultiplierLadder({ ladder, active, className }: { ladder: number[]; active: number; className?: string }) {
  return (
    <div className={cn('flex items-center gap-1', className)} aria-label={`Multiplier ${active}×`}>
      {ladder.map((m) => {
        const on = m === active;
        const past = m < active;
        return (
          <motion.span
            key={m}
            animate={{ scale: on ? 1.12 : 1 }}
            className={cn(
              'tabular rounded-md border px-2 py-0.5 text-xs font-bold transition-colors',
              on ? 'border-white/60 bg-white text-black' : past ? 'border-white/20 bg-white/10 text-white/70' : 'border-white/10 bg-black/40 text-white/40',
            )}
          >
            {m}×
          </motion.span>
        );
      })}
    </div>
  );
}
