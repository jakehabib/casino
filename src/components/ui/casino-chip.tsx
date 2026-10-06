import { cn } from '@/lib/cn';

/** Chip denominations and their colours (consistent across all table games). */
export const CHIP_DENOMS = [100, 500, 1_000, 5_000, 10_000, 25_000, 100_000] as const;

const CHIP_COLORS: Record<number, { base: string; edge: string; text: string }> = {
  100: { base: '#e9ebef', edge: '#9aa1ad', text: '#22252c' },
  500: { base: '#d6455a', edge: '#ffd3da', text: '#fff' },
  1000: { base: '#2f7de1', edge: '#cfe3ff', text: '#fff' },
  5000: { base: '#1f9d6c', edge: '#c8f5e1', text: '#fff' },
  10000: { base: '#24262d', edge: '#9aa1ad', text: '#fff' },
  25000: { base: '#7c5cff', edge: '#e3dbff', text: '#fff' },
  100000: { base: '#c9993d', edge: '#fff0c8', text: '#2a1d05' },
};

export function chipColor(value: number) {
  const denom = [...CHIP_DENOMS].reverse().find((d) => value >= d) ?? 100;
  return CHIP_COLORS[denom];
}

export function chipLabel(v: number): string {
  if (v >= 1_000_000) return `${+(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${+(v / 1_000).toFixed(v % 1000 === 0 ? 0 : 1)}K`;
  return String(v);
}

/** Casino chip rendered in SVG — edge inserts, inner ring, value. */
export function CasinoChip({ value, size = 40, className, selected, dim }: { value: number; size?: number; className?: string; selected?: boolean; dim?: boolean }) {
  const c = chipColor(value);
  const label = chipLabel(value);
  const fs = label.length > 3 ? 9.5 : 11;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={cn('shrink-0 drop-shadow-[0_2px_3px_rgba(0,0,0,0.5)] transition-transform', selected && 'drop-shadow-[0_0_10px_rgba(124,92,255,0.6)]', dim && 'opacity-50', className)}
      aria-label={`${value} credit chip`}
    >
      <circle cx="20" cy="20" r="19" fill={c.base} />
      {Array.from({ length: 8 }).map((_, i) => (
        <rect key={i} x="18" y="1.2" width="4" height="6" rx="1" fill={c.edge} transform={`rotate(${i * 45} 20 20)`} opacity="0.95" />
      ))}
      <circle cx="20" cy="20" r="13" fill={c.base} stroke={c.edge} strokeOpacity="0.55" strokeWidth="1" strokeDasharray="2 2" />
      <circle cx="20" cy="20" r="11" fill="rgba(0,0,0,0.12)" />
      <circle cx="20" cy="20" r="19" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="1" />
      <ellipse cx="20" cy="12" rx="11" ry="5" fill="rgba(255,255,255,0.12)" />
      <text x="20" y="20.5" textAnchor="middle" dominantBaseline="middle" fontSize={fs} fontWeight="800" fill={c.text} fontFamily="var(--font-geist-sans)">
        {label}
      </text>
      {selected ? <circle cx="20" cy="20" r="19.3" fill="none" stroke="#fff" strokeWidth="1.4" /> : null}
    </svg>
  );
}

/** Decompose an amount into a short visual stack of chips (largest first). */
export function chipStack(amount: number, max = 5): number[] {
  const out: number[] = [];
  let rest = amount;
  for (const d of [...CHIP_DENOMS].reverse()) {
    while (rest >= d && out.length < max) {
      out.push(d);
      rest -= d;
    }
  }
  if (!out.length && amount > 0) out.push(100);
  return out.reverse();
}

export function ChipStackView({ amount, size = 34, className }: { amount: number; size?: number; className?: string }) {
  const chips = chipStack(amount);
  return (
    <div className={cn('relative', className)} style={{ width: size, height: size + (chips.length - 1) * 3 }}>
      {chips.map((v, i) => (
        <div key={i} className="absolute left-0" style={{ bottom: i * 3 }}>
          <CasinoChip value={v} size={size} />
        </div>
      ))}
    </div>
  );
}
