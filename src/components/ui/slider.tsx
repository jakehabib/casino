'use client';
import * as S from '@radix-ui/react-slider';

export function Slider({ value, onValueChange, label, min = 0, max = 100, step = 1, disabled }: { value: number; onValueChange: (v: number) => void; label: string; min?: number; max?: number; step?: number; disabled?: boolean }) {
  return (
    <S.Root
      value={[value]}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={(v) => onValueChange(v[0])}
      aria-label={label}
      className="relative flex h-6 w-full touch-none select-none items-center data-[disabled]:opacity-40"
    >
      <S.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-surface-4">
        <S.Range className="absolute h-full rounded-full bg-accent" />
      </S.Track>
      <S.Thumb className="block h-4 w-4 rounded-full border-2 border-accent bg-white shadow transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/30" aria-label={label} />
    </S.Root>
  );
}
