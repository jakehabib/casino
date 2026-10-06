'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import {
  LayoutDashboard,
  Users,
  Gamepad2,
  Gift,
  SlidersHorizontal,
  HeartHandshake,
  MessageSquareWarning,
  ScrollText,
  ShieldAlert,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useMe } from '@/hooks/use-me';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { Button } from '@/components/ui/button';
import { RolePill } from './ui';

type Role = 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN';
const RANK: Record<Role, number> = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 };

export const ADMIN_NAV: { href: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; min: Role; exact?: boolean }[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, min: 'ADMIN', exact: true },
  { href: '/admin/users', label: 'Users', icon: Users, min: 'ADMIN' },
  { href: '/admin/games', label: 'Games', icon: Gamepad2, min: 'ADMIN' },
  { href: '/admin/rewards', label: 'Rewards', icon: Gift, min: 'ADMIN' },
  { href: '/admin/system', label: 'System', icon: SlidersHorizontal, min: 'ADMIN' },
  { href: '/admin/responsible-play', label: 'Responsible Play', icon: HeartHandshake, min: 'ADMIN' },
  { href: '/admin/moderation', label: 'Moderation', icon: MessageSquareWarning, min: 'MODERATOR' },
  { href: '/admin/audit', label: 'Audit Log', icon: ScrollText, min: 'ADMIN' },
];

function matchNav(pathname: string) {
  return [...ADMIN_NAV].sort((a, b) => b.href.length - a.href.length).find((i) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + '/')));
}

export function useStaffRole(): Role | null | undefined {
  const { data, isLoading } = useMe();
  if (isLoading) return undefined;
  return (data?.user.role as Role | undefined) ?? null;
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const role = useStaffRole();
  const current = matchNav(pathname);

  // Moderators land straight on the one section they can use.
  useEffect(() => {
    if (role === 'MODERATOR' && pathname === '/admin') router.replace('/admin/moderation');
  }, [role, pathname, router]);

  if (role === undefined) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 pt-6 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[208px_minmax(0,1fr)]">
          <Skeleton className="hidden h-80 rounded-xl lg:block" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-56" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-[92px] rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-72 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (role === null || RANK[role] < RANK.MODERATOR) {
    return (
      <div className="mx-auto flex max-w-lg px-4 pt-16 sm:px-6">
        <div className="w-full rounded-2xl border border-line bg-surface-1" data-testid="admin-forbidden">
          <EmptyState
            icon={<ShieldAlert size={20} />}
            title={role === null ? 'Sign in required' : 'Staff only'}
            body={
              role === null
                ? 'Sign in with a staff account to open the admin console.'
                : 'The admin console is restricted to NOVA staff. If you think you should have access, contact an administrator.'
            }
            action={
              <Link href={role === null ? '/login?next=/admin' : '/'}>
                <Button variant="secondary" size="sm">
                  {role === null ? 'Sign in' : 'Back to lobby'}
                </Button>
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  const visible = ADMIN_NAV.filter((i) => RANK[role] >= RANK[i.min]);
  const allowed = !current || RANK[role] >= RANK[current.min];

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-10 pt-4 sm:px-6 lg:pt-6">
      {/* Mobile / tablet: horizontal section switcher */}
      <div className="sticky top-14 z-[var(--z-sticky)] -mx-4 mb-4 border-b border-line-soft bg-bg/90 px-4 backdrop-blur-xl sm:top-16 sm:-mx-6 sm:px-6 lg:hidden">
        <div className="flex items-center gap-2 pt-2.5 text-2xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">
          <Shield size={12} className="text-accent" /> Admin console
        </div>
        <nav aria-label="Admin sections" className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto py-2">
          {visible.map((i) => {
            const active = current?.href === i.href;
            const Icon = i.icon;
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors',
                  active ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                <Icon size={14} className={active ? 'text-accent' : 'text-fg-subtle'} />
                {i.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="grid gap-6 lg:grid-cols-[208px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-[88px]">
            <div className="mb-3 flex items-center justify-between px-2.5">
              <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">
                <Shield size={12} className="text-accent" /> Admin console
              </div>
            </div>
            <nav aria-label="Admin sections" className="space-y-0.5">
              {visible.map((i) => {
                const active = current?.href === i.href;
                const Icon = i.icon;
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors duration-150',
                      active ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:bg-surface-2/70 hover:text-fg',
                    )}
                  >
                    {active ? <span className="absolute left-0 top-2 h-5 w-[3px] rounded-r bg-accent" /> : null}
                    <Icon size={16} className={cn('shrink-0', active ? 'text-accent' : 'text-fg-subtle group-hover:text-fg-muted')} />
                    {i.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mx-2.5 mt-5 border-t border-line-soft pt-4">
              <div className="text-[11px] text-fg-subtle">Signed in as</div>
              <div className="mt-1.5">
                <RolePill role={role} />
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-fg-faint">Every change you make is recorded in the audit log with your reason and IP.</p>
            </div>
          </div>
        </aside>
        <div className="min-w-0">
          {allowed ? (
            children
          ) : (
            <div className="rounded-2xl border border-line bg-surface-1">
              <EmptyState
                icon={<ShieldAlert size={20} />}
                title="Restricted section"
                body="Moderators can access the moderation queue only."
                action={
                  <Link href="/admin/moderation">
                    <Button variant="secondary" size="sm">
                      Open moderation
                    </Button>
                  </Link>
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
