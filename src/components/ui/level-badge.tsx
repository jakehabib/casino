import { cn } from '@/lib/cn';
import { tierForLevel, TIER_LABEL, type LevelTier } from '@/lib/levels';

const TIER_STYLE: Record<LevelTier, string> = {
  neutral: 'bg-surface-4 text-fg-muted border-line-strong',
  bronze: 'bg-[#2a1d14] text-[#e0a77a] border-[#5c3b24]',
  silver: 'bg-[#1d2128] text-[#d3d9e3] border-[#4a5260]',
  gold: 'bg-[#2a2210] text-gold-bright border-gold-deep',
  platinum: 'bg-[#16242a] text-[#a6ecf5] border-[#2f6170]',
  prestige: 'bg-gradient-to-r from-[#2b1c4d] to-[#3a2a12] text-gold-bright border-gold/60',
};

/** LevelBadge — compact level pill with milestone tier treatment. */
export function LevelBadge({ level, size = 'sm', showTier, className }: { level: number; size?: 'xs' | 'sm' | 'md'; showTier?: boolean; className?: string }) {
  const tier = tierForLevel(level);
  return (
    <span
      title={`Level ${level} · ${TIER_LABEL[tier]}`}
      className={cn(
        'tabular inline-flex shrink-0 items-center gap-1 rounded-[5px] border font-bold leading-none',
        size === 'xs' && 'h-4 px-1 text-[9.5px]',
        size === 'sm' && 'h-5 px-1.5 text-[10.5px]',
        size === 'md' && 'h-6 px-2 text-xs',
        TIER_STYLE[tier],
        className,
      )}
    >
      {tier === 'prestige' ? <span aria-hidden>✦</span> : null}
      {level}
      {showTier ? <span className="font-semibold opacity-80">· {TIER_LABEL[tier]}</span> : null}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  if (role === 'USER') return null;
  const label = role === 'MODERATOR' ? 'MOD' : role === 'SUPER_ADMIN' ? 'ADMIN' : role;
  return (
    <span className={cn('inline-flex h-4 items-center rounded-[4px] px-1 text-[9px] font-bold tracking-wide', role === 'MODERATOR' ? 'bg-info/15 text-info' : 'bg-accent/20 text-accent')}>
      {label}
    </span>
  );
}
