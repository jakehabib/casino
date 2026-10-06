'use client';
import { RotateCcw, Trash2 } from 'lucide-react';
import { BetField, Kbd } from '@/components/ui/bet-controls';
import { ChipSelector } from '@/components/ui/chip-selector';
import { Button } from '@/components/ui/button';
import { ControlsPanel } from '@/components/games/shared/game-shell';
import { CreditIcon } from '@/components/ui/credit-icon';
import { formatCredits } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { BlackjackTableConfig } from '@/server/services/blackjack/blackjack-service';
import type { RoundView } from './reveal';

function Line({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'win' | 'loss' | 'gold' | 'muted' }) {
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className="text-fg-subtle">{label}</span>
      <span
        className={cn(
          'tabular flex items-center gap-1.5 font-semibold',
          tone === 'win' && 'text-win',
          tone === 'loss' && 'text-fg-muted',
          tone === 'gold' && 'text-gold',
          !tone && 'text-fg',
          tone === 'muted' && 'text-fg-muted',
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function BlackjackControls({
  config,
  bet,
  setBet,
  chip,
  onChip,
  onReset,
  balance,
  view,
  inRound,
  busy,
  revealing,
  pending,
  onDeal,
  onRebetDouble,
  hasPrevious,
}: {
  config: BlackjackTableConfig;
  bet: number;
  setBet: (v: number) => void;
  chip: number;
  onChip: (v: number) => void;
  onReset: () => void;
  balance: number | null;
  view: RoundView | null;
  inRound: boolean;
  busy: boolean;
  revealing: boolean;
  pending: string | null;
  onDeal: () => void;
  onRebetDouble: () => void;
  hasPrevious: boolean;
}) {
  const locked = inRound || busy;
  const clamp = (v: number) => Math.max(config.minBet, Math.min(config.maxBet, v));
  const settled = view?.settled ? view : null;
  const tooPoor = balance !== null && balance < bet;
  const canDeal = !locked && !revealing && config.enabled && !tooPoor;

  return (
    <ControlsPanel className="lg:sticky lg:top-[76px]">
      <BetField
        value={bet}
        onChange={(v) => setBet(clamp(v))}
        min={config.minBet}
        max={config.maxBet}
        balance={balance}
        disabled={locked}
        aside={<span className="tabular">Limits {formatCredits(config.minBet)} – {formatCredits(config.maxBet, { compact: true })}</span>}
      />

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-medium text-fg-subtle">
          <span>Quick chips</span>
          <button
            type="button"
            className="flex items-center gap-1 rounded px-1 text-fg-subtle transition-colors hover:text-fg disabled:opacity-40"
            onClick={onReset}
            disabled={locked}
          >
            <Trash2 size={12} /> Clear
          </button>
        </div>
        <ChipSelector
          value={chip}
          onChange={onChip}
          disabledAbove={config.maxBet}
          size={38}
          className={cn(locked && 'pointer-events-none opacity-50')}
        />
      </div>

      <div className="hidden flex-col gap-2 lg:flex">
        <Button size="xl" block disabled={!canDeal} loading={pending === 'DEAL'} onClick={onDeal} data-testid="bj-deal">
          {hasPrevious ? 'Rebet' : 'Deal'}
          <Kbd>Space</Kbd>
        </Button>
        {hasPrevious ? (
          <Button variant="secondary" size="md" block disabled={!canDeal || bet * 2 > config.maxBet} onClick={onRebetDouble} leftIcon={<RotateCcw size={14} />} data-testid="bj-rebet-x2">
            Rebet ×2
          </Button>
        ) : null}
      </div>
      {tooPoor && !inRound ? <p className="-mt-1 text-[12px] text-warn">Not enough Credits for this bet.</p> : null}

      <div className="space-y-2 rounded-lg border border-line-soft bg-surface-2/50 p-3">
        {view && !view.settled ? (
          <>
            <Line label="In play" value={<><CreditIcon size={13} />{formatCredits(view.totalWagered)}</>} />
            {view.insurance.taken ? <Line label="Insurance" value={formatCredits(view.insurance.bet)} tone="muted" /> : null}
            <Line label="Hands" value={view.hands.length} tone="muted" />
          </>
        ) : settled ? (
          <>
            <Line label="Last round" value={<><CreditIcon size={13} />{formatCredits(settled.totalWagered)}</>} tone="muted" />
            <Line
              label="Result"
              value={settled.net === 0 ? 'Push' : `${settled.net > 0 ? '+' : '−'}${formatCredits(Math.abs(settled.net))}`}
              tone={settled.hands.some((h) => h.outcome === 'BLACKJACK') ? 'gold' : settled.net > 0 ? 'win' : settled.net < 0 ? 'loss' : 'muted'}
            />
          </>
        ) : (
          <>
            <Line label="Blackjack pays" value={config.blackjackPayout === '6:5' ? '6 to 5' : '3 to 2'} tone="gold" />
            <Line label="Dealer" value={config.dealerHitsSoft17 ? 'Hits soft 17' : 'Stands on soft 17'} tone="muted" />
          </>
        )}
      </div>

      <div className="hidden flex-wrap gap-x-3 gap-y-1 text-[11px] text-fg-faint lg:flex">
        <span><Kbd>H</Kbd> Hit</span>
        <span><Kbd>S</Kbd> Stand</span>
        <span><Kbd>D</Kbd> Double</span>
        <span><Kbd>P</Kbd> Split</span>
      </div>
    </ControlsPanel>
  );
}
