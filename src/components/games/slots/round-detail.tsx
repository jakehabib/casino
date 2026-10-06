'use client';
import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { RoundDetail } from '@/lib/round-detail';
import type { SlotRoundData } from '@/server/services/slots/slot-service';
import type { SpinOutcome, SpinWin } from '@/engines/slots/types';
import { getSlotDefinition } from '@/engines/slots/definitions';
import { toPublicDefinition, type PublicSymbol } from '@/engines/slots/public';
import { formatCredits } from '@/lib/format';
import { cn } from '@/lib/cn';
import { CreditIcon } from '@/components/ui/credit-icon';
import { GenericSymbol, genericSymbolColor } from './shared/generic-symbols';

/**
 * History / fairness view of one slot ROUND (the paid spin + its free spins):
 * each spin's evaluated grid with winning cells outlined, the wins list and
 * features. Uses neutral glyphs coloured from each machine's symbol palette.
 */
export function SlotRoundDetail({ detail }: { detail: RoundDetail<SlotRoundData> }) {
  const data = detail.data;
  const def = useMemo(() => {
    const d = getSlotDefinition(data.slotId);
    return d ? toPublicDefinition(d) : null;
  }, [data.slotId]);
  const [showAll, setShowAll] = useState(false);
  if (!def) return <div className="text-sm text-fg-muted">Unknown machine.</div>;
  const paid = data.spins.find((s) => !s.isFreeSpin) ?? data.spins[0];
  const free = data.spins.filter((s) => s.isFreeSpin);
  const visibleFree = showAll ? free : free.slice(0, 6);
  const symIndex = new Map(def.symbols.map((s, i) => [s.id, i]));
  const symbols = def.symbols;

  return (
    <div className="space-y-4" data-testid="slot-round-detail">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-fg-muted">
        <span className="font-semibold text-fg">{def.name}</span>
        <span>Bet {formatCredits(data.betLevel)}</span>
        {free.length ? <span>{free.length} free spins</span> : null}
        {!data.complete ? <span className="text-warn">Bonus in progress</span> : null}
        {detail.forced ? <span className="rounded bg-warn/15 px-1.5 py-0.5 text-[11px] font-semibold text-warn">Dev forced</span> : null}
      </div>

      {paid ? <SpinCard title="Paid spin" outcome={paid.outcome} payout={paid.payout} symbols={symbols} symIndex={symIndex} nonce={paid.nonce} large /> : null}

      {free.length ? (
        <div>
          <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-subtle">Free spins</div>
          <div className="grid gap-3 sm:grid-cols-2">
            {visibleFree.map((s) => (
              <SpinCard
                key={s.id}
                title={`Free spin ${s.outcome.freeSpins?.played ?? ''}`}
                outcome={s.outcome}
                payout={s.payout}
                symbols={symbols}
                symIndex={symIndex}
                nonce={s.nonce}
              />
            ))}
          </div>
          {free.length > visibleFree.length ? (
            <button type="button" onClick={() => setShowAll(true)} className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg border border-line py-2 text-[13px] font-medium text-fg-muted hover:bg-surface-2 hover:text-fg">
              Show all {free.length} free spins <ChevronDown size={14} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const FEATURE_LABEL: Record<string, string> = {
  FREE_SPINS_TRIGGERED: 'Free spins',
  FREE_SPINS_RETRIGGERED: 'Retrigger',
  FREE_SPINS_ENDED: 'Bonus end',
  EXPANDING_WILD: 'Expanding wild',
  CASCADE: 'Cascades',
  SCATTER_WIN: 'Scatter win',
  STAR_SURGE: 'Star Surge',
  RELIC_WILDS: 'Relic Wilds',
  ORRERY: 'Orrery',
  SUPERNOVA: 'Supernova',
  RELIC_TIER_UP: 'Relic tier up',
  MAX_WIN: 'Max win',
};

function SpinCard({
  title,
  outcome,
  payout,
  symbols,
  symIndex,
  nonce,
  large,
}: {
  title: string;
  outcome: SpinOutcome;
  payout: number;
  symbols: PublicSymbol[];
  symIndex: Map<string, number>;
  nonce: number;
  large?: boolean;
}) {
  const step0 = outcome.steps[0];
  const grid = step0.grid;
  const reels = grid.length;
  const rows = grid[0]?.length ?? 0;
  const winCells = new Set(step0.wins.flatMap((w) => w.positions.map(([r, y]) => `${r}:${y}`)));
  const wins = outcome.steps.flatMap((s, i) => s.wins.map((w) => ({ ...w, step: i })));
  const cascades = outcome.steps.length - 1;
  return (
    <div className="rounded-xl border border-line bg-surface-2/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-[12px]">
        <span className="font-semibold text-fg">{title}</span>
        <span className="flex items-center gap-2">
          <span className="tabular text-fg-subtle">nonce {nonce}</span>
          <span className={cn('tabular flex items-center gap-1 font-semibold', payout > 0 ? 'text-win' : 'text-fg-muted')}>
            <CreditIcon size={12} />
            {payout > 0 ? `+${formatCredits(payout)}` : '0'}
          </span>
        </span>
      </div>
      <div
        className={cn('mx-auto grid gap-[3px] rounded-lg bg-bg p-1.5', large ? 'max-w-[360px]' : 'max-w-[240px]')}
        style={{ gridTemplateColumns: `repeat(${reels}, minmax(0, 1fr))` }}
        role="img"
        aria-label={`${reels} by ${rows} grid`}
      >
        {Array.from({ length: rows }).flatMap((_, y) =>
          grid.map((col, r) => {
            const s = col[y];
            const i = symIndex.get(s) ?? 0;
            const hit = winCells.has(`${r}:${y}`);
            return (
              <div
                key={`${r}-${y}`}
                className={cn('aspect-square rounded-md transition-opacity', hit ? 'opacity-100' : winCells.size ? 'opacity-45' : 'opacity-100')}
                style={hit ? { boxShadow: `0 0 0 1.5px ${genericSymbolColor(i, symbols[i]?.kind ?? 'regular')}` } : undefined}
              >
                <GenericSymbol sym={symbols[i]} index={i} opts={{ state: hit ? 'win' : 'idle', small: true }} />
              </div>
            );
          }),
        )}
      </div>
      {outcome.features.length || cascades > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {outcome.features.filter((f) => FEATURE_LABEL[f]).map((f) => (
            <span key={f} className="rounded bg-surface-4 px-1.5 py-0.5 text-[10.5px] font-medium text-fg-muted">
              {f === 'CASCADE' ? `${cascades} cascade${cascades === 1 ? '' : 's'}` : FEATURE_LABEL[f]}
            </span>
          ))}
          {step0.modifiers?.map((m) =>
            m.kind === 'ORRERY' ? (
              <span key="orrery" className="rounded bg-surface-4 px-1.5 py-0.5 text-[10.5px] font-medium text-fg-muted">
                ×{m.multiplier} spin multiplier
              </span>
            ) : null,
          )}
        </div>
      ) : null}
      {wins.length ? (
        <ul className="mt-2 space-y-0.5 text-[12px]">
          {wins.slice(0, large ? 12 : 4).map((w, i) => (
            <li key={i} className="flex items-center justify-between gap-2 text-fg-muted">
              <span className="truncate">{describeWin(w, symbols)}</span>
              <span className="tabular shrink-0 font-medium text-fg">
                {w.multiplier > 1 ? <span className="mr-1 text-fg-subtle">×{w.multiplier}</span> : null}
                {formatCredits(w.amount)}
              </span>
            </li>
          ))}
          {wins.length > (large ? 12 : 4) ? <li className="text-fg-subtle">+{wins.length - (large ? 12 : 4)} more wins</li> : null}
        </ul>
      ) : (
        <div className="mt-2 text-center text-[12px] text-fg-subtle">No win</div>
      )}
      {outcome.maxWinReached ? <div className="mt-1 text-[11px] font-semibold text-gold">Max win reached — round capped</div> : null}
    </div>
  );
}

function describeWin(w: SpinWin & { step: number }, symbols: PublicSymbol[]): string {
  const name = symbols.find((s) => s.id === w.symbol)?.name ?? w.symbol;
  const step = w.step > 0 ? ` · cascade ${w.step}` : '';
  switch (w.kind) {
    case 'line':
      return `Line ${(w.lineIndex ?? 0) + 1} · ${w.count}× ${name}${step}`;
    case 'ways':
      return `${w.count} reels ${name} · ${w.ways} ways${step}`;
    case 'cluster':
      return `Cluster of ${w.count} ${name}${step}`;
    case 'scatter':
      return `${w.count}× ${name} scatter`;
  }
}
