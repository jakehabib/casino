import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function StatCard({ label, value, sub, tone = 'default', icon, className }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'default' | 'win' | 'loss' | 'gold' | 'muted'; icon?: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-line bg-surface-1 p-4', className)}>
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-fg-subtle">
        <span>{label}</span>
        {icon}
      </div>
      <div
        className={cn(
          'tabular mt-1.5 truncate text-xl font-semibold tracking-tight',
          tone === 'win' && 'text-win',
          tone === 'loss' && 'text-loss/90',
          tone === 'gold' && 'text-gold',
          tone === 'muted' && 'text-fg-muted',
          tone === 'default' && 'text-fg',
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-0.5 truncate text-xs text-fg-subtle">{sub}</div> : null}
    </div>
  );
}
