'use client';
import { Undo2, X, RotateCcw } from 'lucide-react';
import { ChipSelector } from '@/components/ui/chip-selector';
import { CreditIcon } from '@/components/ui/credit-icon';
import { Button, PrimaryButton } from '@/components/ui/button';
import { Kbd } from '@/components/ui/bet-controls';
import { Tooltip } from '@/components/ui/tooltip';
import { ControlsPanel } from '@/components/games/shared/game-shell';
import { formatCredits } from '@/lib/format';
import { cn } from '@/lib/cn';
import { chipLabel } from '@/components/ui/casino-chip';
import type { BaccaratController, ZoneKey } from './use-baccarat';
import { SIDE_TONE } from './theme';

const ORDER: ZoneKey[] = ['PLAYER', 'BANKER', 'TIE'];

export function BaccaratControls({ c }: { c: BaccaratController }) {
  const { cfg, phase, bets, staked, pending } = c;
  const locked = phase === 'dealing' || pending;
  const settled = phase === 'result' && c.result ? c.result : null;
  const showBets = settled ? Object.fromEntries(settled.bets.map((b) => [b.type, b.amount])) as Record<ZoneKey, number | undefined> : bets;
  const totalShown = settled ? settled.totalWagered : staked;

  return (
    <ControlsPanel className="gap-3.5 sm:gap-4">
      <div>
        <div className="mb-1 flex items-center justify-between text-xs font-medium text-fg-subtle">
          <span>Chip value</span>
          {cfg ? (
            <span className="tabular">
              Limits {chipLabel(cfg.minBet)} – {chipLabel(cfg.maxBet)} per bet
            </span>
          ) : null}
        </div>
        <ChipSelector value={c.chip} onChange={c.setChip} size={42} className="-mx-1 px-1" />
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        <ActionButton label="Undo" hint="Backspace" icon={<Undo2 size={15} />} disabled={locked || phase !== 'betting' || c.history.length === 0} onClick={c.undo} />
        <ActionButton label="Clear" icon={<X size={15} />} disabled={locked || (phase === 'betting' ? staked === 0 : true)} onClick={c.clear} />
        <ActionButton label="Double" icon={<span className="text-[13px] font-bold leading-none">2×</span>} disabled={locked || phase !== 'betting' || staked === 0} onClick={c.doubleBets} />
        <ActionButton label="Rebet" icon={<RotateCcw size={15} />} disabled={locked || !c.lastBets || (phase === 'betting' && staked > 0)} onClick={() => c.rebet()} />
      </div>

      <PrimaryButton
        size="xl"
        block
        loading={pending}
        disabled={locked || c.primaryMode === 'none'}
        onClick={c.primary}
        data-testid="bac-deal"
        className="text-[15px]"
      >
        {c.primaryMode === 'rebet-deal' ? 'Rebet & Deal' : 'Deal'}
        <Kbd>Space</Kbd>
      </PrimaryButton>

      <div className="rounded-lg border border-line bg-bg-raised/60">
        {ORDER.map((z) => {
          const amt = showBets[z] ?? 0;
          const b = settled?.bets.find((x) => x.type === z);
          const tone = SIDE_TONE[z];
          return (
            <div key={z} className={cn('flex items-center justify-between border-b border-line-soft px-3 py-2 text-[13px]', !amt && 'text-fg-subtle')}>
              <span className="flex items-center gap-2">
                <span className={cn('h-2 w-2 rounded-full', tone.solid, !amt && 'opacity-40')} />
                <span className={cn(amt ? 'text-fg' : 'text-fg-subtle')}>{tone.label}</span>
              </span>
              <span className="tabular flex items-center gap-2">
                {b ? (
                  <span className={cn('text-xs font-semibold', b.outcome === 'WIN' ? 'text-win' : b.outcome === 'PUSH' ? 'text-fg-muted' : 'text-fg-subtle')}>
                    {b.outcome === 'WIN' ? `+${formatCredits(b.payout - b.amount)}` : b.outcome === 'PUSH' ? 'Push' : 'Lost'}
                  </span>
                ) : amt ? (
                  <Tooltip content="Total return if this bet wins">
                    <span className="text-xs text-fg-subtle">→ {formatCredits(c.potential[z])}</span>
                  </Tooltip>
                ) : null}
                <span className={cn('min-w-[56px] text-right font-semibold', amt ? 'text-fg' : 'text-fg-faint')}>{amt ? formatCredits(amt) : '—'}</span>
              </span>
            </div>
          );
        })}
        <div className="flex items-center justify-between px-3 py-2.5 text-[13px]">
          <span className="font-medium text-fg-muted">{settled ? 'Wagered' : 'Total wager'}</span>
          <span className="tabular flex items-center gap-1.5 font-semibold text-fg">
            <CreditIcon size={14} />
            {formatCredits(totalShown)}
          </span>
        </div>
        {settled ? (
          <div className="flex items-center justify-between border-t border-line-soft px-3 py-2.5 text-[13px]">
            <span className="font-medium text-fg-muted">Result</span>
            <span className={cn('tabular font-bold', settled.net > 0 ? 'text-win' : settled.net === 0 ? 'text-fg-muted' : 'text-fg-subtle')}>
              {settled.net > 0 ? `+${formatCredits(settled.net)}` : settled.net === 0 ? 'Push' : formatCredits(settled.net)}
            </span>
          </div>
        ) : null}
      </div>
    </ControlsPanel>
  );
}

function ActionButton({ label, icon, onClick, disabled, hint }: { label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean; hint?: string }) {
  return (
    <Button variant="subtle" size="md" onClick={onClick} disabled={disabled} className="h-11 flex-col gap-0 px-1 text-[11px]" aria-label={label} title={hint ? `${label} (${hint})` : label}>
      <span className="flex flex-col items-center gap-0.5">
        {icon}
        <span className="font-medium">{label}</span>
      </span>
    </Button>
  );
}
