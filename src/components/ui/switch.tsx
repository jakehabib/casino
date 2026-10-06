'use client';
import * as S from '@radix-ui/react-switch';
import { cn } from '@/lib/cn';
import { playSound } from '@/audio/audio-manager';

export function Switch({ checked, onCheckedChange, label, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <S.Root
      checked={checked}
      disabled={disabled}
      onCheckedChange={(v) => {
        playSound('toggle');
        onCheckedChange(v);
      }}
      aria-label={label}
      className={cn(
        'relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border border-line-strong transition-colors duration-150',
        checked ? 'bg-accent border-accent' : 'bg-surface-3',
        disabled && 'opacity-50',
      )}
    >
      <S.Thumb className="block h-[18px] w-[18px] translate-x-[3px] rounded-full bg-white shadow transition-transform duration-150 ease-[var(--ease-out-quint)] data-[state=checked]:translate-x-[19px]" />
    </S.Root>
  );
}
