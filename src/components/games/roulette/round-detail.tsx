'use client';
import { getSpot, spotId, PAYOUT_ODDS, BET_LABEL, type BetType } from '@/engines/roulette/bets';
import { colorOf } from '@/engines/roulette/wheel';
import type { RouletteRoundData } from '@/engines/roulette/api-types';
import type { RoundDetail } from '@/lib/round-detail';
import { formatCredits } from '@/lib/format';
import { cn } from '@/lib/cn';
import { CreditIcon } from '@/components/ui/credit-icon';
import { NumberPill } from './history';

/** Round detail body for the history modal / fairness page. */
export function RouletteRoundDetail({ detail }: { detail: RoundDetail<RouletteRoundData> }) {
  const { winningNumber, bets } = detail.data;
  const c = colorOf(winningNumber);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2/60 p-3">
        <NumberPill n={winningNumber} size="lg" className="h-12 min-w-12 rounded-xl text-lg" />
        <div className="min-w-0">
          <div className="text-sm font-semibold">
            {winningNumber} {c === 'green' ? 'Zero' : c === 'red' ? 'Red' : 'Black'}
          </div>
          <div className="text-xs text-fg-subtle">
            {winningNumber === 0 ? 'Zero' : `${winningNumber % 2 ? 'Odd' : 'Even'} · ${winningNumber <= 18 ? '1–18' : '19–36'} · ${winningNumber <= 12 ? '1st' : winningNumber <= 24 ? '2nd' : '3rd'} dozen`}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-[11px] uppercase tracking-wider text-fg-subtle">Net</div>
          <div className={cn('tabular text-sm font-semibold', detail.net > 0 ? 'text-win' : detail.net < 0 ? 'text-fg-muted' : 'text-fg')}>
            {formatCredits(detail.net, { sign: true })}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-line">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-line bg-surface-2/60 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
          <span>Bet</span>
          <span className="text-right">Stake</span>
          <span className="w-20 text-right">Return</span>
        </div>
        {bets.map((b, i) => {
          const spot = getSpot(spotId(b.type as BetType, b.numbers));
          return (
            <div key={i} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-b border-line-soft px-3 py-2 text-[13px] last:border-0">
              <span className="min-w-0 truncate">
                {spot?.label ?? BET_LABEL[b.type as BetType] ?? b.type}
                <span className="ml-1.5 text-xs text-fg-subtle">{PAYOUT_ODDS[b.type as BetType]}:1</span>
              </span>
              <span className="tabular text-right text-fg-muted">{formatCredits(b.amount)}</span>
              <span className={cn('tabular w-20 text-right font-semibold', b.won ? 'text-win' : 'text-fg-subtle')}>{b.won ? formatCredits(b.payout) : '—'}</span>
            </div>
          );
        })}
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 bg-surface-2/40 px-3 py-2 text-[13px] font-semibold">
          <span>Total</span>
          <span className="tabular flex items-center justify-end gap-1 text-right">
            <CreditIcon size={13} />
            {formatCredits(detail.wager)}
          </span>
          <span className={cn('tabular w-20 text-right', detail.payout > 0 ? 'text-win' : 'text-fg-subtle')}>{formatCredits(detail.payout)}</span>
        </div>
      </div>
      {detail.forced ? <p className="text-xs text-warn">Development round — result was forced and is not verifiable.</p> : null}
    </div>
  );
}
