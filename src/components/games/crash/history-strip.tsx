'use client';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatCredits, formatShortDateTime } from '@/lib/format';
import { DUR, EASE } from '@/lib/motion';
import { crashTier } from '@/engines/crash/crash-math';
import type { CrashRoundInfo } from '@/engines/crash/types';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { CreditIcon } from '@/components/ui/credit-icon';
import { verifyHref } from '@/components/fairness/verify-link';
import { useCrash } from './crash-store';

export function CrashPill({ x100, className, onClick }: { x100: number; className?: string; onClick?: () => void }) {
  const tier = crashTier(x100);
  const cls = cn(
    'tabular inline-flex h-6 shrink-0 items-center rounded-md px-2 text-xs font-semibold transition-colors',
    tier === 'low' && 'bg-white/[0.06] text-fg-muted',
    tier === 'mid' && 'bg-accent/15 text-[#b4a2ff]',
    tier === 'high' && 'bg-gold-soft text-gold-bright ring-1 ring-inset ring-gold/30',
    onClick && 'hover:brightness-125',
    className,
  );
  const label = `${(x100 / 100).toFixed(2)}×`;
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} aria-label={`Round crashed at ${label} — view fairness`}>
      {label}
    </button>
  ) : (
    <span className={cls}>{label}</span>
  );
}

/** Recent crash points, newest first; click opens the round's fairness info. */
export function HistoryStrip({ onOpen }: { onOpen: (roundId: string) => void }) {
  const history = useCrash((s) => s.history);
  return (
    <div
      className="scrollbar-none flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto"
      style={{ maskImage: 'linear-gradient(90deg, #000 85%, transparent)', WebkitMaskImage: 'linear-gradient(90deg, #000 85%, transparent)' }}
      aria-label="Recent results"
    >
      <AnimatePresence initial={false}>
        {history.slice(0, 20).map((h) => (
          <motion.div
            key={h.id}
            layout
            initial={{ opacity: 0, scale: 0.8, x: -8 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ duration: DUR.standard, ease: EASE.out }}
          >
            <CrashPill x100={h.crashPoint} onClick={() => onOpen(h.id)} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function Row({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid gap-1">
      <div className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className={cn('break-all rounded-md border border-line bg-bg-raised px-2.5 py-1.5 text-xs text-fg-muted', mono && 'font-mono')}>{children}</div>
    </div>
  );
}

/** Public round info: result, totals, seed hash, revealed seed, verify link. */
export function RoundInfoModal({ roundId, onClose }: { roundId: string | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['crash', 'round', roundId],
    queryFn: () => api.get<CrashRoundInfo>(`/api/games/crash/round/${roundId}`),
    enabled: !!roundId,
    staleTime: 60_000,
  });
  const r = q.data;
  return (
    <Modal open={!!roundId} onOpenChange={(o) => !o && onClose()} title={r ? `Round #${r.number.toLocaleString('en-US')}` : 'Round'} size="md">
      {!r ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/60 p-3">
            {r.crashPoint !== null ? <CrashPill x100={r.crashPoint} className="h-9 px-3 text-base" /> : null}
            <div className="min-w-0 text-xs text-fg-subtle">
              {r.voided ? 'Round voided — stakes refunded' : r.crashedAt ? `Crashed ${formatShortDateTime(new Date(r.crashedAt))}` : 'In progress'}
            </div>
            <div className="ml-auto grid grid-cols-3 gap-4 text-right">
              <Stat label="Players" value={r.players.toLocaleString('en-US')} />
              <Stat label="Wagered" value={formatCredits(r.totalWagered, { compact: true })} credit />
              <Stat label="Paid" value={formatCredits(r.totalPaid, { compact: true })} credit />
            </div>
          </div>
          <Row label="Seed hash (published before betting)" mono>
            {r.seedHash}
          </Row>
          <Row label="Revealed seed" mono>
            {r.seed ?? 'Revealed when the round crashes'}
          </Row>
          <Row label="Salt (public, fixed)" mono>
            {r.salt}
          </Row>
          {r.forced ? (
            <p className="rounded-md border border-warn/25 bg-warn/10 px-3 py-2 text-xs text-warn">
              Development round: the result was forced from the dev panel and is not verifiable.
            </p>
          ) : null}
          {r.seed ? (
            <Link href={verifyHref({ game: 'crash', serverSeed: r.seed, salt: r.salt, seedHash: r.seedHash })} onClick={onClose}>
              <Button variant="secondary" block leftIcon={<ShieldCheck size={15} />} rightIcon={<ExternalLink size={13} className="opacity-60" />}>
                Verify this round
              </Button>
            </Link>
          ) : null}
        </motion.div>
      )}
    </Modal>
  );
}

function Stat({ label, value, credit }: { label: string; value: string; credit?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className="tabular flex items-center justify-end gap-1 text-[13px] font-semibold text-fg">
        {credit ? <CreditIcon size={11} /> : null}
        {value}
      </div>
    </div>
  );
}

