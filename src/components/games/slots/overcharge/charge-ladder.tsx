'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';

/**
 * ChargeLadder — the chain multiplier as an energy conduit: five rungs
 * (1× 2× 3× 5× 10×) on a track that fills as cascades chain. Each rise
 * surges: the fill springs forward with a bright head, the new rung locks in
 * with a shockwave. The top rung runs hot (amber). During free spins the
 * level is held between spins ("Held").
 */
export function ChargeLadder({
  ladder,
  level,
  surgeKey,
  held,
  reduced,
}: {
  ladder: number[];
  /** Index into `ladder`. */
  level: number;
  /** Changes every time the chain advances (drives the surge). */
  surgeKey: number;
  /** Free spins: the ladder does not reset between spins. */
  held: boolean;
  reduced: boolean;
}) {
  const top = ladder.length - 1;
  const lv = Math.max(0, Math.min(level, top));
  const max = lv === top;
  const pct = top > 0 ? (lv / top) * 100 : 0;
  const hot = '#ffbf5a';
  const cool = '#5fe0ff';
  return (
    <div className="flex w-full items-center gap-2.5 sm:gap-4" aria-label={`Chain multiplier ${ladder[lv]}×`} data-testid="oc-ladder">
      <div className="w-[46px] shrink-0 leading-none sm:w-[64px]">
        <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#7f90a6] sm:text-[10px]">Chain</div>
        <div className={cn('mt-1 text-[9px] font-semibold uppercase tracking-[0.16em]', held ? 'text-[#ffcf86]' : 'text-[#4d5b6d]')}>{held ? 'Held' : 'Per spin'}</div>
      </div>
      <div className="relative h-9 min-w-0 flex-1 sm:h-10">
        <div className="absolute inset-x-[17px] top-1/2 -translate-y-1/2 sm:inset-x-[20px]">
          {/* track */}
          <div className="h-[3px] rounded-full bg-[#141c27] shadow-[inset_0_1px_1px_#000]" />
          {/* fill */}
          <motion.div
            className="absolute left-0 top-0 h-[3px] rounded-full"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={reduced ? { duration: 0 } : lv === 0 ? { duration: 0.35, ease: [0.4, 0, 0.2, 1] } : { type: 'spring', stiffness: 210, damping: 22 }}
            style={{
              background: max ? `linear-gradient(90deg, ${cool}55, ${cool} 55%, ${hot})` : `linear-gradient(90deg, ${cool}40, ${cool})`,
              boxShadow: `0 0 10px ${max ? hot : cool}aa`,
            }}
          >
            {lv > 0 ? (
              <motion.span
                key={surgeKey}
                className="absolute right-0 top-1/2 h-2.5 w-2.5 -translate-y-1/2 translate-x-1/2 rounded-full bg-white"
                initial={reduced ? false : { scale: 2.2, opacity: 1 }}
                animate={{ scale: 1, opacity: 0.9 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                style={{ boxShadow: `0 0 12px 3px ${max ? hot : cool}` }}
              />
            ) : null}
          </motion.div>
          {/* rungs */}
          {ladder.map((m, i) => {
            const on = i === lv;
            const past = i < lv;
            const isTop = i === top;
            const c = isTop && on ? hot : cool;
            return (
              <div key={m} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${top > 0 ? (i / top) * 100 : 0}%` }}>
                <AnimatePresence>
                  {on && i > 0 && !reduced ? (
                    <motion.span
                      key={`wave-${surgeKey}`}
                      aria-hidden
                      className="pointer-events-none absolute inset-0 rounded-[9px]"
                      style={{ boxShadow: `0 0 0 2px ${c}` }}
                      initial={{ scale: 1, opacity: 0.9 }}
                      animate={{ scale: 2.1, opacity: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                    />
                  ) : null}
                </AnimatePresence>
                <motion.div
                  initial={false}
                  animate={{ scale: on ? 1.12 : 1 }}
                  transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 18 }}
                  className={cn(
                    'tabular relative grid h-[24px] min-w-[34px] place-items-center rounded-[8px] border px-1.5 text-[12px] font-extrabold leading-none transition-colors duration-200 sm:h-[28px] sm:min-w-[42px] sm:text-[13px]',
                    on
                      ? 'border-transparent text-[#03121a]'
                      : past
                        ? 'border-[#2b6f86] bg-[#0b1e28] text-[#8fe7ff]'
                        : 'border-[#222c39] bg-[#0a0f16] text-[#566578]',
                  )}
                  style={
                    on
                      ? {
                          background: isTop ? 'linear-gradient(180deg,#fff1d4,#ffbf5a 55%,#e08a1e)' : 'linear-gradient(180deg,#eafcff,#7fe8ff 55%,#2fb6dc)',
                          boxShadow: `0 0 0 1px #00000080, 0 0 18px -2px ${c}, inset 0 1px 0 #ffffffaa`,
                        }
                      : undefined
                  }
                >
                  {m}×
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="hidden w-[64px] shrink-0 text-right leading-none sm:block">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={ladder[lv]}
            initial={reduced ? false : { y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className={cn('tabular text-[20px] font-black', max ? 'text-[#ffcf86]' : lv > 0 ? 'text-[#9cecff]' : 'text-[#5d6c80]')}
          >
            ×{ladder[lv]}
          </motion.div>
        </AnimatePresence>
        <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#4d5b6d]">{max ? 'Max' : 'Active'}</div>
      </div>
    </div>
  );
}
