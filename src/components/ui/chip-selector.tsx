'use client';
import { motion } from 'framer-motion';
import { CasinoChip, CHIP_DENOMS } from './casino-chip';
import { cn } from '@/lib/cn';
import { playSound } from '@/audio/audio-manager';
import { SPRING } from '@/lib/motion';

/** ChipSelector — pick the active chip denomination for table betting. */
export function ChipSelector({ value, onChange, denoms = CHIP_DENOMS as unknown as number[], disabledAbove, className, size = 40 }: { value: number; onChange: (v: number) => void; denoms?: number[]; disabledAbove?: number; className?: string; size?: number }) {
  return (
    <div role="radiogroup" aria-label="Chip value" className={cn('scrollbar-none flex items-center gap-1.5 overflow-x-auto py-1', className)}>
      {denoms.map((d) => {
        const selected = d === value;
        const disabled = disabledAbove !== undefined && d > disabledAbove;
        return (
          <motion.button
            key={d}
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            type="button"
            onClick={() => {
              playSound('chip');
              onChange(d);
            }}
            animate={{ y: selected ? -4 : 0, scale: selected ? 1.06 : 1 }}
            whileTap={{ scale: 0.94 }}
            transition={SPRING.snappy}
            className="relative shrink-0 rounded-full disabled:opacity-35"
          >
            <CasinoChip value={d} size={size} selected={selected} />
          </motion.button>
        );
      })}
    </div>
  );
}
