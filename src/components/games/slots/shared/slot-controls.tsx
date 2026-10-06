'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Minus, Plus, RotateCw, Square, Zap, Repeat } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatCredits } from '@/lib/format';
import { CreditIcon } from '@/components/ui/credit-icon';
import { AnimatedNumber } from '@/components/ui/animated-number';
import { Popover, PopoverClose } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Kbd, useHotkeys } from '@/components/ui/bet-controls';
import { useDisplayBalance } from '@/stores/balance-store';
import { playSound } from '@/audio/audio-manager';
import type { SlotMachineController, AutoplayConfig } from './use-slot-machine';

const AUTOPLAY_COUNTS = [10, 25, 50, 100] as const;

/**
 * SlotControls — the slot control bar: balance · total bet stepper (the
 * configured bet levels) · big Spin button (Space; tap again to quick-stop)
 * · autoplay (10/25/50/100, stop on bonus / big win) · turbo · last win.
 * Mobile puts Spin front and centre with autoplay/turbo either side.
 */
export function SlotControls({ m, spinClassName }: { m: SlotMachineController; spinClassName?: string }) {
  const balance = useDisplayBalance();
  const levels = m.betLevels;
  const idx = Math.max(0, levels.indexOf(m.betLevel));
  const inBonus = !!m.bonus;
  const shownBet = inBonus ? m.bonus!.betLevel : m.betLevel;
  const step = (d: number) => {
    const next = levels[Math.min(levels.length - 1, Math.max(0, idx + d))];
    if (next !== undefined && next !== m.betLevel) {
      playSound('click', { pitch: d > 0 ? 1.15 : 0.9 });
      m.setBetLevel(next);
    }
  };

  useHotkeys(
    {
      // Same as the Spin button: while autoplay runs (outside a bonus) Space stops it.
      Space: () => (m.autoplay && !m.bonus ? m.stopAutoplay() : void m.spin()),
      t: () => m.setTurbo(!m.turbo),
      ArrowUp: m.canChangeBet ? () => step(1) : undefined,
      ArrowDown: m.canChangeBet ? () => step(-1) : undefined,
    },
    !!m.def,
  );

  const spinDisabled = !m.def || m.phase === 'loading' || !m.enabled;
  const insufficient = !inBonus && balance !== null && balance < m.betLevel && !m.busy;

  const betStepper = (
    <div className="flex min-w-0 items-center gap-1.5" data-testid="slot-bet">
      <StepButton label="Decrease bet" disabled={!m.canChangeBet || idx === 0} onClick={() => step(-1)}>
        <Minus size={16} />
      </StepButton>
      <div className="min-w-[96px] flex-1 text-center sm:min-w-[118px]">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">{inBonus ? 'Bet (locked)' : 'Total bet'}</div>
        <div className="tabular mt-0.5 flex items-center justify-center gap-1.5 text-[15px] font-bold text-fg">
          <CreditIcon size={14} />
          {formatCredits(shownBet)}
        </div>
      </div>
      <StepButton label="Increase bet" disabled={!m.canChangeBet || idx >= levels.length - 1} onClick={() => step(1)}>
        <Plus size={16} />
      </StepButton>
    </div>
  );

  const spinButton = (
    <SpinButton
      m={m}
      disabled={spinDisabled}
      className={spinClassName}
      label={m.autoplay ? `Stop autoplay (${m.autoplay.remaining} left)` : inBonus ? 'Play free spin' : 'Spin'}
    />
  );

  return (
    <div className="@container surface-panel rounded-xl px-3 py-3 sm:px-4" data-testid="slot-controls">
      {/* Mobile */}
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-3 @min-[720px]:hidden">
        <div className="flex items-center justify-between gap-2">
          <AutoplayButton m={m} />
          {spinButton}
          <TurboButton m={m} />
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line-soft pt-3">
          {betStepper}
          <Readout label="Last win" value={m.lastWin} tone={m.lastWin > 0 ? 'win' : 'muted'} align="right" />
        </div>
        <div className="-mt-1 flex items-center justify-between text-xs text-fg-subtle">
          <span>Balance</span>
          <span className="tabular flex items-center gap-1 font-semibold text-fg-muted">
            <CreditIcon size={12} />
            {balance === null ? '—' : <AnimatedNumber value={balance} />}
          </span>
        </div>
      </div>

      {/* Tablet / desktop */}
      <div className="hidden items-center gap-4 @min-[720px]:flex">
        <div className="flex min-w-0 flex-1 items-center gap-4 lg:gap-6">
          <Readout label="Balance" value={balance} icon />
          <Readout label="Last win" value={m.lastWin} tone={m.lastWin > 0 ? 'win' : 'muted'} />
        </div>
        <div className="flex items-center gap-3">
          {betStepper}
          <AutoplayButton m={m} />
          {spinButton}
          <TurboButton m={m} />
        </div>
        <div className="flex flex-1 items-center justify-end text-[11px] text-fg-subtle">
          <span className="hidden whitespace-nowrap xl:inline">
            <Kbd>Space</Kbd> spin · <Kbd>T</Kbd> turbo
          </span>
        </div>
      </div>
      {insufficient ? (
        <div className="mt-2 text-center text-xs font-medium text-warn" role="status">
          Not enough Credits for this bet — lower the bet or claim a reward.
        </div>
      ) : null}
    </div>
  );
}

function Readout({ label, value, tone = 'default', icon, align = 'left' }: { label: string; value: number | null; tone?: 'default' | 'win' | 'muted'; icon?: boolean; align?: 'left' | 'right' }) {
  return (
    <div className={cn('min-w-0', align === 'right' && 'text-right')}>
      <div className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-subtle">{label}</div>
      <div
        className={cn(
          'tabular mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-[15px] font-bold',
          align === 'right' && 'justify-end',
          tone === 'win' ? 'text-win' : tone === 'muted' ? 'text-fg-muted' : 'text-fg',
        )}
      >
        {icon ? <CreditIcon size={14} /> : null}
        {value === null ? '—' : <AnimatedNumber value={value} />}
      </div>
    </div>
  );
}

function StepButton({ children, label, disabled, onClick }: { children: React.ReactNode; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface-3 text-fg-muted transition-[background,color,transform] hover:bg-surface-4 hover:text-fg active:scale-95 disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}

function SpinButton({ m, disabled, label, className }: { m: SlotMachineController; disabled: boolean; label: string; className?: string }) {
  const auto = m.autoplay;
  const inBonus = !!m.bonus;
  const onClick = () => {
    if (auto && !inBonus) {
      m.stopAutoplay();
      return;
    }
    void m.spin();
  };
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      // Space is handled by the page hotkey; stop the native keyup "click" so one press = one action.
      onKeyUp={(e) => {
        if (e.key === ' ') e.preventDefault();
      }}
      whileTap={{ scale: 0.94 }}
      className={cn(
        'relative flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-full text-white outline-offset-4 transition-[filter,opacity] disabled:opacity-40 md:h-[64px] md:w-[64px]',
        'bg-[radial-gradient(circle_at_50%_30%,#9a82ff,#7c5cff_55%,#5b3fe0)] shadow-[inset_0_1px_0_rgb(255_255_255/0.35),inset_0_-3px_8px_rgb(0_0_0/0.25),0_10px_30px_-8px_#7c5cffcc] hover:brightness-110',
        inBonus && 'bg-[radial-gradient(circle_at_50%_30%,#f5d589,#e2b456_55%,#9c7428)] text-[#2a1d05] shadow-[inset_0_1px_0_rgb(255_255_255/0.5),inset_0_-3px_8px_rgb(0_0_0/0.25),0_10px_30px_-8px_#e2b456aa]',
        className,
      )}
      data-testid="slot-spin"
    >
      <span className="absolute inset-[5px] rounded-full border border-white/20" aria-hidden />
      {auto && !inBonus ? (
        <span className="flex flex-col items-center leading-none">
          <Square size={16} fill="currentColor" />
          <span className="tabular mt-1 text-[11px] font-bold">{auto.remaining}</span>
        </span>
      ) : inBonus && !m.busy ? (
        <span className="flex flex-col items-center leading-none">
          <span className="text-[10px] font-black uppercase tracking-wider">Free</span>
          <span className="tabular mt-0.5 text-base font-black">{m.bonus!.remaining}</span>
        </span>
      ) : (
        <motion.span
          animate={m.busy && !m.reduced ? { rotate: 360 } : { rotate: 0 }}
          transition={m.busy ? { duration: 0.6, repeat: Infinity, ease: 'linear' } : { duration: 0.2 }}
          className="flex"
        >
          <RotateCw size={28} strokeWidth={2.5} />
        </motion.span>
      )}
    </motion.button>
  );
}

function TurboButton({ m }: { m: SlotMachineController }) {
  return (
    <button
      type="button"
      aria-pressed={m.turbo}
      aria-label={m.turbo ? 'Turbo on' : 'Turbo off'}
      title="Turbo (T)"
      onClick={() => {
        playSound('toggle');
        m.setTurbo(!m.turbo);
      }}
      className={cn(
        'flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-full border text-[9px] font-bold uppercase tracking-wider transition-colors',
        m.turbo ? 'border-accent/60 bg-accent-soft text-accent' : 'border-line-strong bg-surface-3 text-fg-subtle hover:text-fg',
      )}
      data-testid="slot-turbo"
    >
      <Zap size={15} fill={m.turbo ? 'currentColor' : 'none'} />
    </button>
  );
}

function AutoplayButton({ m }: { m: SlotMachineController }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number>(25);
  const [stopOnBonus, setStopOnBonus] = useState(true);
  const [stopOnBigWin, setStopOnBigWin] = useState(true);
  const active = !!m.autoplay;
  if (active) {
    return (
      <button
        type="button"
        onClick={m.stopAutoplay}
        className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-full border border-accent/60 bg-accent-soft text-accent"
        aria-label="Stop autoplay"
        title="Stop autoplay"
      >
        <Square size={12} fill="currentColor" />
        <span className="tabular mt-0.5 text-[10px] font-bold leading-none">{m.autoplay!.remaining}</span>
      </button>
    );
  }
  const start = (cfg: AutoplayConfig) => {
    setOpen(false);
    m.startAutoplay(cfg);
  };
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="top"
      align="center"
      className="w-[280px] p-3"
      trigger={
        <button
          type="button"
          disabled={!m.def || m.busy || !!m.bonus || !m.enabled}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface-3 text-fg-subtle transition-colors hover:text-fg disabled:opacity-40"
          aria-label="Autoplay"
          title="Autoplay"
          data-testid="slot-autoplay"
        >
          <Repeat size={16} />
        </button>
      }
    >
      <div className="text-[13px] font-semibold text-fg">Autoplay</div>
      <div className="mt-2.5 grid grid-cols-4 gap-1.5">
        {AUTOPLAY_COUNTS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              playSound('click');
              setCount(n);
            }}
            className={cn(
              'tabular h-9 rounded-md border text-sm font-semibold transition-colors',
              count === n ? 'border-accent bg-accent-soft text-fg' : 'border-line bg-surface-2 text-fg-muted hover:text-fg',
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-3 space-y-2.5 text-[13px]">
        <label className="flex items-center justify-between gap-3 text-fg-muted">
          Stop when free spins trigger
          <Switch checked={stopOnBonus} onCheckedChange={setStopOnBonus} label="Stop on free spins" />
        </label>
        <label className="flex items-center justify-between gap-3 text-fg-muted">
          Stop on a big win (10×+)
          <Switch checked={stopOnBigWin} onCheckedChange={setStopOnBigWin} label="Stop on big win" />
        </label>
      </div>
      <div className="mt-2 text-[11px] leading-snug text-fg-subtle">Autoplay also stops on any error, a limit or when your balance runs out.</div>
      <div className="mt-3 flex gap-2">
        <PopoverClose asChild>
          <Button variant="ghost" size="sm" className="flex-1">
            Cancel
          </Button>
        </PopoverClose>
        <Button size="sm" className="flex-1" onClick={() => start({ count, stopOnBonus, stopOnBigWin })} data-testid="slot-autoplay-start">
          Start {count}
        </Button>
      </div>
    </Popover>
  );
}
