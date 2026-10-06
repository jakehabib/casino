'use client';
import { PlayingCard } from '@/components/ui/playing-card';
import { GameResultBadge, type ResultTone } from '@/components/ui/result-badge';
import { formatCredits } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { RoundDetail } from '@/lib/round-detail';
import type { BlackjackRoundData } from '@/server/services/blackjack/blackjack-service';

const OUTCOME: Record<string, { label: string; tone: ResultTone }> = {
  BLACKJACK: { label: 'Blackjack', tone: 'blackjack' },
  WIN: { label: 'Win', tone: 'win' },
  PUSH: { label: 'Push', tone: 'push' },
  LOSS: { label: 'Loss', tone: 'loss' },
  BUST: { label: 'Bust', tone: 'loss' },
};

const ACTION_LABEL: Record<string, string> = {
  DEAL: 'Deal',
  HIT: 'Hit',
  STAND: 'Stand',
  DOUBLE: 'Double',
  SPLIT: 'Split',
  INSURANCE: 'Insurance taken',
  DECLINE_INSURANCE: 'Insurance declined',
};

const RANK: Record<string, string> = { T: '10' };
const SUIT: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

function CardText({ code }: { code: string }) {
  const red = code[1] === 'H' || code[1] === 'D';
  return (
    <span className={cn('tabular inline-flex items-center rounded bg-[#fbfaf7] px-1 text-[11px] font-bold leading-[18px]', red ? 'text-[#c62f3d]' : 'text-[#16181d]')}>
      {RANK[code[0]] ?? code[0]}
      {SUIT[code[1]]}
    </span>
  );
}

function Cards({ cards }: { cards: string[] }) {
  return (
    <div className="flex">
      {cards.map((c, i) => (
        <div key={i} style={{ marginLeft: i === 0 ? 0 : -30 }}>
          <PlayingCard code={c} size="sm" />
        </div>
      ))}
    </div>
  );
}

/** History modal visual for a settled blackjack round. */
export function BlackjackRoundDetail({ detail }: { detail: RoundDetail<BlackjackRoundData> }) {
  const d = detail.data;
  return (
    <div className="space-y-4" data-testid="bj-round-detail">
      <div className="felt overflow-hidden rounded-xl border border-felt-line/60 p-4">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
            Dealer
            <span className="tabular rounded-full bg-black/45 px-2 py-0.5 text-[12px] tracking-normal text-white">
              {d.dealer.blackjack ? 'Blackjack' : d.dealer.total > 21 ? `Bust · ${d.dealer.total}` : d.dealer.total}
            </span>
          </div>
          <Cards cards={d.dealer.cards} />
        </div>
        <div className="mt-5 flex flex-wrap items-start justify-center gap-x-6 gap-y-4">
          {d.hands.map((h, i) => {
            const o = OUTCOME[h.outcome ?? 'LOSS'];
            return (
              <div key={i} className="flex flex-col items-center gap-2">
                <Cards cards={h.cards} />
                <div className="flex items-center gap-1.5">
                  <span className="tabular rounded-full bg-black/45 px-2 py-0.5 text-[12px] font-semibold text-white">{h.total}</span>
                  <GameResultBadge tone={o.tone}>{o.label}</GameResultBadge>
                </div>
                <div className="tabular text-[11px] text-white/60">
                  Bet {formatCredits(h.bet)}
                  {h.doubled ? ' · doubled' : ''}
                  {h.payout > 0 ? ` · paid ${formatCredits(h.payout)}` : ''}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {d.insurance ? (
        <div className="flex items-center justify-between rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-[13px]">
          <span className="text-fg-muted">Insurance</span>
          <span className="tabular font-semibold">
            {formatCredits(d.insurance.bet)} → {d.insurance.payout > 0 ? <span className="text-win">{formatCredits(d.insurance.payout)}</span> : <span className="text-fg-subtle">lost</span>}
          </span>
        </div>
      ) : null}

      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">Action log</div>
        <ol className="divide-y divide-line-soft overflow-hidden rounded-lg border border-line">
          {d.actions.map((a) => (
            <li key={a.seq} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[13px]">
              <span className="tabular w-5 text-fg-faint">{a.seq + 1}</span>
              <span className="min-w-[96px] font-medium text-fg">
                {ACTION_LABEL[a.action] ?? a.action}
                {d.hands.length > 1 && a.action !== 'DEAL' && !a.action.includes('INSURANCE') ? <span className="text-fg-subtle"> · hand {a.hand + 1}</span> : null}
              </span>
              <span className="flex flex-wrap items-center gap-1">
                {a.cards.map((c, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[11px] text-fg-subtle">
                    {c.to === 'D' ? 'D' : d.hands.length > 1 ? `H${c.hand + 1}` : 'P'}
                    <CardText code={c.card} />
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-fg-subtle">
        <span>{d.rules.decks} decks</span>
        <span>Blackjack pays {d.rules.blackjackPayout.replace(':', ' to ')}</span>
        <span>Dealer {d.rules.dealerHitsSoft17 ? 'hits' : 'stands on'} soft 17</span>
        {d.segments[0] ? (
          <span className="tabular">
            Shoe cards {d.segments[0].from}–{Math.max(d.segments[0].from, d.segments[0].to - 1)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
