'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { CreditIcon } from './credit-icon';
import { formatCredits } from '@/lib/format';
import { playSound } from '@/audio/audio-manager';

/**
 * BetInput — integer Credit amount input. Keeps a local text buffer so typing
 * feels natural, commits clamped integers on blur / Enter.
 */
export function BetInput({
  value,
  onChange,
  min = 1,
  max,
  disabled,
  label = 'Bet amount',
  className,
  id,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  label?: string;
  className?: string;
  id?: string;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const commit = () => {
    const n = Math.floor(Number(text.replace(/[^\d]/g, '')));
    const clamped = Math.max(min, Math.min(max ?? Number.MAX_SAFE_INTEGER, Number.isFinite(n) && n > 0 ? n : min));
    onChange(clamped);
    setText(String(clamped));
  };

  return (
    <div
      className={cn(
        'flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-bg-raised pl-3 pr-2 transition-[border,box-shadow] focus-within:border-accent/70 focus-within:shadow-[0_0_0_3px_#7c5cff22]',
        disabled && 'opacity-50',
        className,
      )}
    >
      <CreditIcon size={16} />
      <input
        id={id}
        aria-label={label}
        inputMode="numeric"
        disabled={disabled}
        value={focused ? text : formatCredits(value)}
        onFocus={(e) => {
          setFocused(true);
          setText(String(value));
          requestAnimationFrame(() => e.target.select());
        }}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onChange={(e) => setText(e.target.value.replace(/[^\d]/g, '').slice(0, 12))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="tabular h-full min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-fg outline-none"
      />
    </div>
  );
}

/** AmountControls — ½ / 2× / MAX modifiers. */
export function AmountControls({ value, onChange, min = 1, max, balance, disabled }: { value: number; onChange: (v: number) => void; min?: number; max?: number; balance?: number | null; disabled?: boolean }) {
  const cap = Math.min(max ?? Number.MAX_SAFE_INTEGER, balance ?? Number.MAX_SAFE_INTEGER);
  const set = (v: number) => {
    playSound('click', { pitch: 1.1 });
    onChange(Math.max(min, Math.min(cap > 0 ? cap : min, Math.floor(v))));
  };
  const btn = 'h-11 min-w-[44px] rounded-lg border border-line bg-surface-2 px-2.5 text-[13px] font-semibold text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg active:scale-95 disabled:opacity-40';
  return (
    <div className="flex gap-1.5">
      <button type="button" className={btn} disabled={disabled} onClick={() => set(value / 2)} aria-label="Half bet" title="Half (S)">
        ½
      </button>
      <button type="button" className={btn} disabled={disabled} onClick={() => set(value * 2)} aria-label="Double bet" title="Double (D)">
        2×
      </button>
      <button type="button" className={btn} disabled={disabled} onClick={() => set(cap)} aria-label="Max bet">
        MAX
      </button>
    </div>
  );
}

export function PotentialWin({ label = 'Potential win', amount, className }: { label?: string; amount: number | null; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between rounded-lg bg-surface-2/60 px-3 py-2 text-[13px]', className)}>
      <span className="text-fg-subtle">{label}</span>
      <span className="tabular flex items-center gap-1.5 font-semibold text-fg">
        <CreditIcon size={14} />
        {amount === null ? '—' : formatCredits(amount)}
      </span>
    </div>
  );
}

/** Standard bet field block: label + input + modifiers. */
export function BetField({
  value,
  onChange,
  min,
  max,
  balance,
  disabled,
  label = 'Bet amount',
  aside,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  balance?: number | null;
  disabled?: boolean;
  label?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs font-medium text-fg-subtle">
        <span>{label}</span>
        {aside}
      </div>
      <div className="flex gap-1.5">
        <BetInput value={value} onChange={onChange} min={min} max={max} disabled={disabled} label={label} />
        <AmountControls value={value} onChange={onChange} min={min} max={max} balance={balance} disabled={disabled} />
      </div>
    </div>
  );
}

/**
 * Keyboard shortcuts for game controls. Ignored while typing in inputs.
 * Space/Enter = primary action is wired by each game.
 */
export function useHotkeys(map: Record<string, (() => void) | undefined | false>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const fn = map[key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [map, enabled]);
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ml-1.5 hidden rounded border border-white/20 px-1 font-mono text-[10px] font-medium opacity-70 lg:inline">{children}</kbd>;
}
