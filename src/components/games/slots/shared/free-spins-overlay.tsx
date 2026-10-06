'use client';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { formatCredits } from '@/lib/format';
import { CreditIcon } from '@/components/ui/credit-icon';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import type { SlotTheme } from './types';

/**
 * Free-spins transitions.
 *  intro  — "N free spins" with the theme's BonusArt opening; Start (or auto after a beat in autoplay)
 *  outro  — total bonus win; Collect
 * The overlay covers the reel window only (the controls stay visible).
 */
export function FreeSpinsOverlay({
  mode,
  spins,
  totalWin,
  bet,
  theme,
  reduced,
  autoContinueMs,
  onContinue,
}: {
  mode: 'intro' | 'outro';
  spins: number;
  totalWin: number;
  bet: number;
  theme: SlotTheme;
  reduced: boolean;
  /** Continue automatically after this many ms (autoplay); undefined = wait for the player. */
  autoContinueMs?: number;
  onContinue: () => void;
}) {
  const [open, setOpen] = useState(reduced);
  const done = useRef(onContinue);
  done.current = onContinue;
  useEffect(() => {
    const t = setTimeout(() => setOpen(true), reduced ? 0 : 450);
    return () => clearTimeout(t);
  }, [reduced]);
  useEffect(() => {
    if (autoContinueMs === undefined) return;
    const t = setTimeout(() => done.current(), autoContinueMs);
    return () => clearTimeout(t);
  }, [autoContinueMs]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        done.current();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, []);

  const accent = theme.accentText ?? 'text-white';
  const x = bet > 0 ? totalWin / bet : 0;
  return (
    <motion.div
      className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden bg-black/80 backdrop-blur-[4px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.35 } }}
      role="dialog"
      aria-label={mode === 'intro' ? 'Free spins awarded' : 'Free spins complete'}
      data-testid={`slot-fs-${mode}`}
    >
      <div className="relative flex w-full max-w-md flex-col items-center px-6 text-center">
        {theme.BonusArt ? (
          <div className="relative mb-3 h-[min(30vw,140px)] w-[min(30vw,140px)] sm:mb-5">{theme.BonusArt({ open, reduced })}</div>
        ) : null}
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduced ? 0 : 0.35, duration: 0.4 }}
          className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/55"
        >
          {mode === 'intro' ? (theme.bonusTitle ?? 'Bonus unlocked') : 'Bonus complete'}
        </motion.div>
        {mode === 'intro' ? (
          <motion.div
            initial={reduced ? false : { scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: reduced ? 0 : 0.5, type: 'spring', stiffness: 300, damping: 18 }}
            className="mt-2"
          >
            <div className={cn('tabular text-[clamp(44px,12vw,84px)] font-black leading-none tracking-tight', accent)}>{spins}</div>
            <div className="mt-1 text-lg font-bold uppercase tracking-[0.12em] text-white sm:text-xl">Free spins</div>
          </motion.div>
        ) : (
          <motion.div
            initial={reduced ? false : { scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: reduced ? 0 : 0.4, type: 'spring', stiffness: 300, damping: 20 }}
            className="mt-3 flex flex-col items-center"
          >
            <div className="flex items-center gap-2">
              <CreditIcon size={26} />
              <span className={cn('tabular text-[clamp(32px,9vw,60px)] font-extrabold leading-none', totalWin > 0 ? accent : 'text-white')}>{formatCredits(totalWin)}</span>
            </div>
            <div className="tabular mt-2 text-sm font-medium text-white/60">
              {spins} free spins · {x.toFixed(2)}× bet
            </div>
          </motion.div>
        )}
        <motion.div initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: reduced ? 0 : 0.9 }} className="mt-6 w-full max-w-[220px]">
          <Button size="lg" block variant={mode === 'intro' ? 'gold' : 'secondary'} onClick={() => done.current()} data-testid={`slot-fs-${mode}-continue`}>
            {mode === 'intro' ? 'Start free spins' : 'Collect'}
          </Button>
          {autoContinueMs !== undefined ? <div className="mt-2 text-[11px] text-white/40">Continuing automatically…</div> : null}
        </motion.div>
      </div>
    </motion.div>
  );
}

/** Non-blocking banner for retriggers / tier-ups ("+5 FREE SPINS"). */
export function FeatureBanner({ text, sub, theme }: { text: string; sub?: string; theme: SlotTheme }) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-x-0 top-[38%] z-30 flex justify-center"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1, transition: { duration: 0.25 } }}
      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
    >
      <div className="rounded-2xl border border-white/15 bg-black/80 px-6 py-3 text-center shadow-3 backdrop-blur-md">
        <div className={cn('text-xl font-black uppercase tracking-wide sm:text-2xl', theme.accentText ?? 'text-white')}>{text}</div>
        {sub ? <div className="mt-0.5 text-xs font-medium text-white/60">{sub}</div> : null}
      </div>
    </motion.div>
  );
}
