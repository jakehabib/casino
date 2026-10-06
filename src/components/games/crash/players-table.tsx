'use client';
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Users } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatCredits } from '@/lib/format';
import { DUR, EASE } from '@/lib/motion';
import { Avatar } from '@/components/ui/avatar';
import { LevelBadge } from '@/components/ui/level-badge';
import { CreditIcon } from '@/components/ui/credit-icon';
import { useCrash } from './crash-store';

/**
 * Live table of everyone in the current round. Cash-outs float to the top
 * (highest payout first), then active bets by size. Collapsible.
 */
export function PlayersTable() {
  const [open, setOpen] = useState(true);
  const betsMap = useCrash((s) => s.bets);
  const round = useCrash((s) => s.round);
  const mine = useCrash((s) => s.mine);
  const crashed = round?.status === 'CRASHED' || round?.status === 'SETTLED';

  const { rows, players, wagered, paid } = useMemo(() => {
    const list = Object.values(betsMap);
    const rank = (s: string) => (s === 'CASHED_OUT' ? 0 : s === 'ACTIVE' ? 1 : 2);
    list.sort((a, b) => rank(a.status) - rank(b.status) || (b.payout ?? 0) - (a.payout ?? 0) || b.amount - a.amount || a.id.localeCompare(b.id));
    return {
      rows: list,
      players: new Set(list.map((b) => b.user.username + (b.user.hidden ? b.id : ''))).size,
      wagered: list.reduce((n, b) => n + b.amount, 0),
      paid: list.reduce((n, b) => n + (b.status === 'CASHED_OUT' ? (b.payout ?? 0) : 0), 0),
    };
  }, [betsMap]);
  const myIds = new Set(mine.filter(Boolean).map((m) => m!.id));

  return (
    <section className="surface-panel overflow-hidden rounded-xl" aria-label="Players this round">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.015]"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-[13px] font-semibold text-fg">
          <Users size={15} className="text-fg-subtle" /> Players
        </span>
        <span className="tabular rounded bg-surface-3 px-1.5 py-0.5 text-[11px] font-semibold text-fg-muted">{players}</span>
        <span className="ml-auto flex items-center gap-4 text-xs text-fg-subtle">
          <span className="hidden items-center gap-1.5 xs:flex">
            Wagered
            <span className="tabular flex items-center gap-1 font-semibold text-fg-muted">
              <CreditIcon size={12} />
              {formatCredits(wagered, { compact: true })}
            </span>
          </span>
          <span className="hidden items-center gap-1.5 sm:flex">
            Paid
            <span className={cn('tabular flex items-center gap-1 font-semibold', paid > 0 ? 'text-win' : 'text-fg-muted')}>
              <CreditIcon size={12} />
              {formatCredits(paid, { compact: true })}
            </span>
          </span>
          <ChevronDown size={16} className={cn('transition-transform duration-200', open && 'rotate-180')} />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: DUR.standard, ease: EASE.out }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-[minmax(0,1fr)_68px_52px_68px] gap-x-2 border-y border-line bg-surface-2/40 px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-fg-subtle sm:grid-cols-[minmax(0,1fr)_120px_90px_120px]">
              <span>Player</span>
              <span className="text-right">Bet</span>
              <span className="text-right">Cashout</span>
              <span className="text-right">Payout</span>
            </div>
            <div className="max-h-[340px] overflow-y-auto">
              {rows.length === 0 ? (
                <div className="px-4 py-8 text-center text-[13px] text-fg-subtle">No bets yet this round. Be the first to launch.</div>
              ) : (
                rows.map((b) => {
                  const won = b.status === 'CASHED_OUT';
                  const lost = b.status === 'LOST' || (crashed && b.status === 'ACTIVE');
                  const me = myIds.has(b.id);
                  return (
                    <motion.div
                      key={b.id}
                      layout="position"
                      transition={{ duration: DUR.standard, ease: EASE.out }}
                      className={cn(
                        'grid grid-cols-[minmax(0,1fr)_68px_52px_68px] items-center gap-x-2 border-b border-line-soft px-4 py-2 text-[13px] last:border-0 sm:grid-cols-[minmax(0,1fr)_120px_90px_120px]',
                        won && 'bg-win/[0.045]',
                        me && 'shadow-[inset_2px_0_0_var(--color-accent)]',
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Avatar avatarUrl={b.user.avatarUrl} name={b.user.username} size={22} className="hidden xs:inline-flex" />
                        <span className={cn('min-w-[2.5rem] truncate font-medium', b.user.hidden ? 'italic text-fg-subtle' : 'text-fg')}>{b.user.displayName}</span>
                        {!b.user.hidden ? <LevelBadge level={b.user.level} size="xs" className="hidden sm:inline-flex" /> : null}
                        {me ? <span className="shrink-0 rounded bg-accent-soft px-1 text-[10px] font-semibold text-accent">YOU</span> : null}
                      </span>
                      <span className="tabular flex items-center justify-end gap-1 text-fg-muted">
                        <CreditIcon size={12} className="hidden xs:block" />
                        {formatCredits(b.amount, { compact: b.amount >= 1_000_000 })}
                      </span>
                      <span className={cn('tabular text-right font-semibold', won ? 'text-win' : 'text-fg-faint')}>
                        {won && b.cashoutAt ? `${(b.cashoutAt / 100).toFixed(2)}×` : '—'}
                      </span>
                      <span className={cn('tabular text-right font-semibold', won ? 'text-win' : lost ? 'text-fg-subtle' : 'text-fg-faint')}>
                        {won ? formatCredits(b.payout ?? 0) : lost ? '0' : '—'}
                      </span>
                    </motion.div>
                  );
                })
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
