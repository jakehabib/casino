'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion } from 'framer-motion';
import { formatCredits } from '@/lib/format';
import { CreditIcon } from '@/components/ui/credit-icon';
import { playSound } from '@/audio/audio-manager';
import { cn } from '@/lib/cn';

/** Win tiers in × total bet. */
export const WIN_TIERS = { big: 10, mega: 50 } as const;
export type WinTier = 'none' | 'win' | 'big' | 'mega';

export function winTier(amount: number, bet: number): WinTier {
  if (amount <= 0 || bet <= 0) return 'none';
  const x = amount / bet;
  if (x >= WIN_TIERS.mega) return 'mega';
  if (x >= WIN_TIERS.big) return 'big';
  return 'win';
}

/**
 * Running win readout shown under the reels while a spin is presented
 * (accumulates across cascades). Tweens between values.
 */
export function WinTicker({ amount, bet, multiplier, className }: { amount: number; bet: number; multiplier?: number; className?: string }) {
  const [display, setDisplay] = useState(amount);
  const prev = useRef(amount);
  useEffect(() => {
    const c = animate(prev.current, amount, { duration: 0.5, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setDisplay(Math.round(v)) });
    prev.current = amount;
    return () => c.stop();
  }, [amount]);
  const x = bet > 0 ? amount / bet : 0;
  return (
    <AnimatePresence>
      {amount > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          className={cn(
            'pointer-events-none flex items-center gap-2 rounded-full border border-white/10 bg-black/70 py-1.5 pl-2.5 pr-3.5 shadow-3 backdrop-blur-md',
            className,
          )}
          data-testid="slot-win-ticker"
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">Win</span>
          <CreditIcon size={15} />
          <span className="tabular text-[15px] font-bold text-white sm:text-base">{formatCredits(display)}</span>
          {x >= 1 ? <span className="tabular text-xs font-semibold text-win">{x.toFixed(x >= 100 ? 0 : 2)}×</span> : null}
          {multiplier && multiplier > 1 ? (
            <span className="tabular rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-bold text-white/85">×{multiplier}</span>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * Big / Mega win celebration: counts the amount up over a dramatic duration,
 * tap (or Space) to skip to the end. Gold is reserved for the mega tier.
 */
export function BigWinOverlay({
  amount,
  bet,
  reduced,
  turbo,
  onDone,
}: {
  amount: number;
  bet: number;
  reduced: boolean;
  turbo: boolean;
  onDone: () => void;
}) {
  const tier = winTier(amount, bet);
  const mega = tier === 'mega';
  const [display, setDisplay] = useState(reduced ? amount : 0);
  const [finished, setFinished] = useState(reduced);
  const ctl = useRef<ReturnType<typeof animate> | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    playSound('bigWin');
    if (reduced) return;
    const duration = (mega ? 4.2 : 2.6) * (turbo ? 0.5 : 1);
    ctl.current = animate(0, amount, {
      duration,
      ease: [0.3, 0.1, 0.25, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
      onComplete: () => setFinished(true),
    });
    return () => ctl.current?.stop();
  }, [amount, mega, reduced, turbo]);

  useEffect(() => {
    if (!finished) return;
    const t = setTimeout(() => doneRef.current(), turbo ? 700 : 1500);
    return () => clearTimeout(t);
  }, [finished, turbo]);

  const skip = () => {
    if (!finished) {
      ctl.current?.stop();
      setDisplay(amount);
      setFinished(true);
    } else doneRef.current();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        e.stopImmediatePropagation();
        skip();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  });

  const x = amount / bet;
  return (
    <motion.button
      type="button"
      onClick={skip}
      aria-label="Skip win celebration"
      className="absolute inset-0 z-30 flex cursor-pointer flex-col items-center justify-center overflow-hidden bg-black/70 backdrop-blur-[3px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
      data-testid="slot-big-win"
    >
      {!reduced ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[180%] w-[180%] -translate-x-1/2 -translate-y-1/2"
          style={{
            background: `repeating-conic-gradient(from 0deg, ${mega ? '#e2b45626' : '#ffffff12'} 0deg 8deg, transparent 8deg 22deg)`,
            maskImage: 'radial-gradient(closest-side, black 20%, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(closest-side, black 20%, transparent 70%)',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
        />
      ) : null}
      <motion.div
        initial={reduced ? false : { scale: 0.4, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 16 }}
        className={cn(
          'relative text-[clamp(28px,7vw,64px)] font-black uppercase italic leading-none tracking-tight',
          mega ? 'bg-gradient-to-b from-gold-bright via-gold to-gold-deep bg-clip-text text-transparent drop-shadow-[0_4px_24px_#e2b45666]' : 'text-white drop-shadow-[0_4px_24px_#7c5cff88]',
        )}
      >
        {mega ? 'Mega win' : 'Big win'}
      </motion.div>
      <div className="relative mt-3 flex items-center gap-2.5 sm:mt-4">
        <CreditIcon size={28} />
        <span className={cn('tabular text-[clamp(30px,8vw,72px)] font-extrabold leading-none tracking-tight', mega ? 'text-gold-bright' : 'text-white')}>
          {formatCredits(display)}
        </span>
      </div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: finished ? 1 : 0.6 }}
        className="tabular relative mt-2 text-sm font-semibold text-white/70 sm:text-base"
      >
        {x.toFixed(2)}× bet
      </motion.div>
      <div className="relative mt-6 text-[11px] font-medium uppercase tracking-[0.2em] text-white/35">{finished ? 'Tap to continue' : 'Tap to skip'}</div>
    </motion.button>
  );
}
