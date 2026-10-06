import { cn } from '@/lib/cn';

export type ResultTone = 'win' | 'loss' | 'push' | 'blackjack' | 'big' | 'neutral';

/** GameResultBadge — standard outcome pill shared by every game. */
export function GameResultBadge({ tone, children, className }: { tone: ResultTone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'tabular inline-flex h-6 items-center rounded-md px-2 text-xs font-semibold',
        tone === 'win' && 'bg-win-soft text-win',
        tone === 'loss' && 'bg-surface-3 text-fg-subtle',
        tone === 'push' && 'bg-surface-3 text-fg-muted',
        tone === 'neutral' && 'bg-surface-3 text-fg-muted',
        tone === 'blackjack' && 'bg-gold-soft text-gold',
        tone === 'big' && 'bg-gold-soft text-gold-bright',
        className,
      )}
    >
      {children}
    </span>
  );
}
