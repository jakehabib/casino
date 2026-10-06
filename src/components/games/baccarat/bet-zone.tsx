'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { ChipStackView } from '@/components/ui/casino-chip';
import { CreditIcon } from '@/components/ui/credit-icon';
import { cn } from '@/lib/cn';
import { EASE, SPRING } from '@/lib/motion';
import { formatCredits } from '@/lib/format';
import type { BetOutcome, MainBetType } from '@/engines/baccarat/types';
import { SIDE_TONE } from './theme';

/**
 * A betting zone on the felt. Big tap target; shows the chip stack, the
 * amount, and — after the round — win / push / loss treatment. On a win the
 * dealer's payout stack slides in next to the stake.
 */
export function BetZone({
  zone,
  amount,
  odds,
  disabled,
  settled,
  compact,
  onPlace,
}: {
  zone: MainBetType;
  amount: number;
  odds: string;
  disabled: boolean;
  settled: { outcome: BetOutcome; payout: number } | null;
  compact: boolean;
  onPlace: () => void;
}) {
  const tone = SIDE_TONE[zone];
  const win = settled?.outcome === 'WIN';
  const lose = settled?.outcome === 'LOSS';
  const push = settled?.outcome === 'PUSH';
  const chipSize = compact ? 30 : 36;

  return (
    <motion.button
      type="button"
      onClick={onPlace}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.985 }}
      aria-label={`Bet on ${tone.label}, pays ${odds}${amount ? `, current bet ${amount}` : ''}`}
      data-testid={`bac-zone-${zone.toLowerCase()}`}
      className={cn(
        'group relative flex min-w-0 flex-col items-center justify-between overflow-hidden rounded-xl border text-center transition-[border-color,background-color,box-shadow,opacity] duration-300 disabled:cursor-default',
        compact ? 'h-[112px] px-1.5 py-2' : 'h-[132px] px-3 py-2.5',
        tone.border,
        tone.soft,
        !disabled && 'hover:bg-white/[0.045] hover:border-white/25',
        win && 'border-win/80 bg-win/[0.08] shadow-[0_0_0_1px_#3ddc9766,0_0_36px_-6px_#3ddc97aa,inset_0_0_30px_-10px_#3ddc9755]',
        lose && 'opacity-45',
      )}
    >
      {/* Inner print line, like a table layout */}
      <span aria-hidden className="pointer-events-none absolute inset-[5px] rounded-[10px] border border-white/[0.05]" />

      <span className="relative flex flex-col items-center leading-none">
        <span className={cn('font-bold uppercase tracking-[0.18em]', compact ? 'text-[11px]' : 'text-[13px]', tone.text)}>{tone.label}</span>
        <span className="tabular mt-1 text-[10px] font-medium tracking-wide text-white/40 sm:text-[11px]">{odds}</span>
      </span>

      <span className="relative flex items-end justify-center gap-1" style={{ height: chipSize + 12 }}>
        <AnimatePresence>
          {amount > 0 ? (
            <motion.span
              key="stake"
              initial={{ opacity: 0, y: 14, scale: 0.8 }}
              animate={lose ? { opacity: 0.0, y: -26, scale: 0.85 } : { opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7, transition: { duration: 0.15 } }}
              transition={lose ? { duration: 0.6, delay: 0.35, ease: EASE.inOut } : SPRING.snappy}
            >
              <ChipStackView amount={amount} size={chipSize} />
            </motion.span>
          ) : (
            <motion.span
              key="spot"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="block rounded-full border border-dashed border-white/15 transition-colors group-hover:border-white/30"
              style={{ width: chipSize, height: chipSize }}
            />
          )}
          {win ? (
            <motion.span
              key="paid"
              initial={{ opacity: 0, y: -46, x: 10 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              transition={{ duration: 0.55, delay: 0.25, ease: EASE.outExpo }}
            >
              <ChipStackView amount={settled!.payout - amount} size={chipSize} />
            </motion.span>
          ) : null}
        </AnimatePresence>
      </span>

      <span className="relative h-5">
        <AnimatePresence mode="wait">
          {win ? (
            <motion.span
              key="w"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="tabular inline-flex items-center gap-1 rounded-md bg-win px-1.5 py-0.5 text-[11px] font-bold text-[#04150d]"
            >
              +{formatCredits(settled!.payout - amount, { compact: compact })}
            </motion.span>
          ) : push ? (
            <motion.span key="p" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-fg-muted">
              Push
            </motion.span>
          ) : amount > 0 ? (
            <motion.span
              key="a"
              initial={{ opacity: 0 }}
              animate={{ opacity: lose ? 0.6 : 1 }}
              className="tabular inline-flex items-center gap-1 rounded-md bg-black/35 px-1.5 py-0.5 text-[11px] font-semibold text-white"
            >
              <CreditIcon size={11} />
              {formatCredits(amount, { compact: compact })}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </span>
    </motion.button>
  );
}
