'use client';
import { memo, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { colorOf } from '@/engines/roulette/wheel';
import type { RouletteRecent } from '@/engines/roulette/api-types';
import { cn } from '@/lib/cn';
import { SPRING } from '@/lib/motion';

export function NumberPill({ n, size = 'md', className }: { n: number; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const c = colorOf(n);
  return (
    <span
      className={cn(
        'tabular inline-flex shrink-0 items-center justify-center rounded-md font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]',
        c === 'red' && 'bg-roulette-red',
        c === 'black' && 'bg-roulette-black ring-1 ring-inset ring-white/10',
        c === 'green' && 'bg-roulette-green',
        size === 'sm' && 'h-6 min-w-6 px-1 text-[11px]',
        size === 'md' && 'h-7 min-w-7 px-1 text-xs',
        size === 'lg' && 'h-9 min-w-9 px-1.5 text-sm',
        className,
      )}
    >
      {n}
    </span>
  );
}

/** Last results, newest first (newest emphasised). */
export const HistoryStrip = memo(function HistoryStrip({ recent, max = 20, className }: { recent: RouletteRecent[]; max?: number; className?: string }) {
  const items = recent.slice(0, max);
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">Last</span>
      {items.length === 0 ? (
        <span className="text-xs text-fg-subtle">No spins yet</span>
      ) : (
        <div className="scrollbar-none flex min-w-0 items-center gap-1 overflow-x-auto py-0.5 [mask-image:linear-gradient(90deg,#000_85%,transparent)]">
          <AnimatePresence initial={false}>
            {items.map((r, i) => (
              <motion.span
                key={r.id}
                layout
                initial={{ opacity: 0, scale: 0.6, x: -8 }}
                animate={{ opacity: i === 0 ? 1 : 0.88, scale: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={SPRING.snappy}
                title={`${r.winningNumber}`}
              >
                <NumberPill n={r.winningNumber} size={i === 0 ? 'md' : 'sm'} className={i === 0 ? 'ring-2 ring-white/60' : undefined} />
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
});

/** Simple distribution over the recent results: colour / parity / range. */
export const RecentStats = memo(function RecentStats({ recent, className }: { recent: RouletteRecent[]; className?: string }) {
  const s = useMemo(() => {
    const nums = recent.map((r) => r.winningNumber);
    const nz = nums.filter((n) => n !== 0);
    const count = (f: (n: number) => boolean, arr = nums) => arr.filter(f).length;
    const freq = new Map<number, number>();
    for (const n of nums) freq.set(n, (freq.get(n) ?? 0) + 1);
    const hot = [...freq.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
    return {
      total: nums.length,
      red: count((n) => colorOf(n) === 'red'),
      black: count((n) => colorOf(n) === 'black'),
      green: count((n) => n === 0),
      odd: count((n) => n % 2 === 1, nz),
      even: count((n) => n % 2 === 0, nz),
      low: count((n) => n <= 18, nz),
      high: count((n) => n >= 19, nz),
      hot,
    };
  }, [recent]);

  if (s.total === 0) {
    return <div className={cn('rounded-lg border border-white/[0.06] bg-black/20 px-3 py-3 text-center text-xs text-fg-subtle', className)}>Statistics appear after your first spin.</div>;
  }
  const pct = (a: number, t = s.total) => (t ? Math.round((a / t) * 100) : 0);
  return (
    <div className={cn('space-y-2.5 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2.5', className)}>
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
        <span>Last {s.total} spins</span>
        {s.hot.length ? (
          <span className="flex items-center gap-1 normal-case tracking-normal">
            <span className="mr-0.5 text-fg-subtle">Repeats</span>
            {s.hot.map(([n]) => (
              <NumberPill key={n} n={n} size="sm" className="h-5 min-w-5 text-[10px]" />
            ))}
          </span>
        ) : null}
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-surface-3">
        <div className="bg-roulette-red transition-[width] duration-500" style={{ width: `${pct(s.red)}%` }} />
        <div className="bg-roulette-green transition-[width] duration-500" style={{ width: `${pct(s.green)}%` }} />
        <div className="bg-[#3a3f4b] transition-[width] duration-500" style={{ width: `${pct(s.black)}%` }} />
      </div>
      <div className="tabular flex justify-between text-[11px] text-fg-muted">
        <span><b className="font-semibold text-fg">{pct(s.red)}%</b> Red</span>
        <span><b className="font-semibold text-fg">{pct(s.green)}%</b> Zero</span>
        <span><b className="font-semibold text-fg">{pct(s.black)}%</b> Black</span>
      </div>
      <Split a={['Odd', s.odd]} b={['Even', s.even]} />
      <Split a={['1–18', s.low]} b={['19–36', s.high]} />
    </div>
  );
});

function Split({ a, b }: { a: [string, number]; b: [string, number] }) {
  const t = a[1] + b[1];
  const pa = t ? Math.round((a[1] / t) * 100) : 50;
  return (
    <div className="tabular flex items-center gap-2 text-[11px] text-fg-muted">
      <span className="w-[52px]">{a[0]} <b className="font-semibold text-fg">{t ? pa : 0}%</b></span>
      <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
        <div className="bg-fg-muted/70 transition-[width] duration-500" style={{ width: `${pa}%` }} />
      </div>
      <span className="w-[60px] text-right">
        <b className="font-semibold text-fg">{t ? 100 - pa : 0}%</b> {b[0]}
      </span>
    </div>
  );
}
