'use client';
import { PlayingCard } from '@/components/ui/playing-card';
import { GameResultBadge } from '@/components/ui/result-badge';
import { formatCredits } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { RoundDetail } from '@/lib/round-detail';
import type { BaccaratRoundData } from '@/server/services/baccarat/types';
import { SIDE_TONE } from './theme';

/** Round detail for the history modal / fairness page. */
export function BaccaratRoundDetail({ detail }: { detail: RoundDetail<BaccaratRoundData> }) {
  const d = detail.data;
  const tone = SIDE_TONE[d.outcome];
  return (
    <div className="space-y-4">
      <div className="felt noise overflow-hidden rounded-xl border border-felt-line/60 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
            Shoe {d.shoeNumber} · Hand {d.shoeRound}
          </span>
          <span className="flex items-center gap-2">
            {d.natural ? <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white/80">Natural</span> : null}
            <span className="text-sm font-bold uppercase tracking-[0.16em]" style={{ color: tone.hex }}>
              {d.outcome === 'TIE' ? 'Tie' : `${tone.label} wins`}
            </span>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(['PLAYER', 'BANKER'] as const).map((side) => {
            const cards = side === 'PLAYER' ? d.playerCards : d.bankerCards;
            const total = side === 'PLAYER' ? d.playerTotal : d.bankerTotal;
            const won = d.outcome === side;
            const t = SIDE_TONE[side];
            return (
              <div key={side} className="flex flex-col items-center">
                <div className="mb-2 flex items-center gap-2">
                  <span className={cn('text-[11px] font-bold uppercase tracking-[0.2em]', t.text)}>{t.label}</span>
                  <span
                    className="tabular flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-bold text-white ring-1 ring-white/15"
                    style={{ background: won ? t.hex : 'rgba(0,0,0,0.35)' }}
                  >
                    {total}
                  </span>
                </div>
                <div className="flex items-center">
                  {cards.map((c, i) => (
                    <div key={i} className="flex items-center justify-center" style={i === 2 ? { width: 80, height: 80, marginLeft: -6 } : { marginLeft: i ? -10 : 0 }}>
                      <PlayingCard code={c} size="sm" style={i === 2 ? { transform: 'rotate(90deg)' } : undefined} dim={d.outcome !== 'TIE' && !won} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-center text-[11px] text-white/40">
          Deal order: {d.deal.map((x) => `${x.side === 'PLAYER' ? 'P' : 'B'}${x.third ? '3' : ''} ${x.card}`).join(' · ')}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-line">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 border-b border-line bg-surface-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
          <span>Bet</span>
          <span className="text-right">Stake</span>
          <span className="text-right">Return</span>
          <span className="text-right">Result</span>
        </div>
        {d.bets.map((b) => (
          <div key={b.type} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 border-b border-line-soft px-3 py-2 text-[13px] last:border-0">
            <span className="flex items-center gap-2">
              <span className={cn('h-2 w-2 rounded-full', SIDE_TONE[b.type].solid)} />
              {SIDE_TONE[b.type].label}
            </span>
            <span className="tabular text-right text-fg-muted">{formatCredits(b.amount)}</span>
            <span className="tabular text-right font-semibold">{formatCredits(b.payout)}</span>
            <span className="text-right">
              <GameResultBadge tone={b.outcome === 'WIN' ? 'win' : b.outcome === 'PUSH' ? 'push' : 'loss'}>
                {b.outcome === 'WIN' ? 'Win' : b.outcome === 'PUSH' ? 'Push' : 'Loss'}
              </GameResultBadge>
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-fg-subtle">
        Banker pays 1:1 less {d.rules.bankerCommissionBps / 100}% commission (rounded down) · Tie pays {d.rules.tiePayout}:1 · {d.rules.decks} decks
      </p>
    </div>
  );
}
