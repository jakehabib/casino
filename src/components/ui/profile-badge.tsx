import { Avatar } from './avatar';
import { LevelBadge, RoleBadge } from './level-badge';
import { cn } from '@/lib/cn';

/** ProfileBadge — avatar + name + level, used in chat, tables, menus. */
export function ProfileBadge({
  user,
  size = 'sm',
  className,
  subtitle,
}: {
  user: { username: string; displayName?: string; avatarUrl?: string | null; level: number; role?: string };
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  subtitle?: React.ReactNode;
}) {
  const av = size === 'lg' ? 48 : size === 'md' ? 36 : 26;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2.5', className)}>
      <Avatar avatarUrl={user.avatarUrl} name={user.username} size={av} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className={cn('truncate font-semibold text-fg', size === 'lg' ? 'text-base' : 'text-[13px]')}>{user.displayName ?? user.username}</span>
          <LevelBadge level={user.level} size={size === 'lg' ? 'md' : 'xs'} />
          {user.role ? <RoleBadge role={user.role} /> : null}
        </span>
        {subtitle ? <span className="block truncate text-xs text-fg-subtle">{subtitle}</span> : null}
      </span>
    </span>
  );
}
