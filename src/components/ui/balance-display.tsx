'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { useBalance, useDisplayBalance } from '@/stores/balance-store';
import { AnimatedNumber } from './animated-number';
import { CreditIcon } from './credit-icon';
import { formatCredits } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Skeleton } from './skeleton';

/** BalanceDisplay — always-visible wallet pill with smooth deltas. */
export function BalanceDisplay({ className, compact }: { className?: string; compact?: boolean }) {
  const balance = useDisplayBalance();
  const lastDelta = useBalance((s) => s.lastDelta);
  return (
    <div className={cn('relative flex h-9 items-center gap-2 rounded-lg border border-line bg-bg-raised pl-2.5 pr-3', className)} data-testid="balance">
      <CreditIcon size={18} />
      {balance === null ? (
        <Skeleton className="h-4 w-20" />
      ) : (
        <AnimatedNumber value={balance} className={cn('tabular font-semibold tracking-tight text-fg', compact ? 'text-[13px]' : 'text-sm')} />
      )}
      <AnimatePresence>
        {lastDelta && lastDelta.amount > 0 && Date.now() - lastDelta.at < 1600 ? (
          <motion.span
            key={lastDelta.at}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: -2 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.5 }}
            className="tabular pointer-events-none absolute -bottom-5 right-2 text-[11px] font-semibold text-win"
          >
            +{formatCredits(lastDelta.amount)}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
