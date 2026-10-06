'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { useUi } from '@/stores/ui-store';
import { cn } from '@/lib/cn';
import { Tooltip } from '@/components/ui/tooltip';
import { ACCOUNT_NAV, FOOTER_NAV, GAME_NAV, PRIMARY_NAV } from './nav-items';

type Item = { href: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; exact?: boolean };

export function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact || href === '/') return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}

function NavLink({ item, collapsed, onNavigate }: { item: Item; collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href, item.exact);
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors duration-150',
        active ? 'bg-surface-3 text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
        collapsed && 'justify-center px-0',
      )}
    >
      {active ? <span className="absolute -left-3 top-2 h-5 w-[3px] rounded-r bg-accent" /> : null}
      <Icon size={17} className={cn('shrink-0', active ? 'text-accent' : 'text-fg-subtle group-hover:text-fg-muted')} />
      {collapsed ? null : <span className="truncate">{item.label}</span>}
    </Link>
  );
  return collapsed ? (
    <Tooltip content={item.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

export function NavSections({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const divider = <div className="mx-2.5 my-3 h-px bg-line-soft" />;
  return (
    <>
      <nav className="space-y-0.5" aria-label="Main">
        {PRIMARY_NAV.map((i) => (
          <NavLink key={i.href} item={i} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </nav>
      {divider}
      {collapsed ? null : <div className="mb-1.5 px-2.5 text-2xs font-semibold uppercase tracking-[0.14em] text-fg-faint">Games</div>}
      <nav className="space-y-0.5" aria-label="Games">
        {GAME_NAV.map((i) => (
          <NavLink key={i.href} item={i} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </nav>
      {divider}
      <nav className="space-y-0.5" aria-label="Account">
        {ACCOUNT_NAV.map((i) => (
          <NavLink key={i.href} item={i} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </nav>
    </>
  );
}

export function FooterNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <nav className="space-y-0.5" aria-label="Support and settings">
      {FOOTER_NAV.map((i) => (
        <NavLink key={i.href} item={i} collapsed={collapsed} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

export function Sidebar() {
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const setCollapsed = useUi((s) => s.setSidebarCollapsed);
  return (
    <aside
      className={cn(
        'sticky top-0 z-[var(--z-sidebar)] hidden h-dvh shrink-0 flex-col border-r border-line-soft bg-bg-raised transition-[width] duration-200 ease-[var(--ease-out-quint)] lg:flex',
        collapsed ? 'w-[68px]' : 'w-[232px]',
      )}
    >
      <div className={cn('flex h-16 items-center', collapsed ? 'justify-center' : 'justify-between px-4')}>
        <Link href="/" aria-label="NOVA home">
          <Logo collapsed={collapsed} />
        </Link>
        {collapsed ? null : (
          <button onClick={() => setCollapsed(true)} className="rounded-md p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fg" aria-label="Collapse sidebar">
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>
      <div className={cn('flex-1 overflow-y-auto pb-4 pt-2', collapsed ? 'px-2.5' : 'px-3')}>
        <NavSections collapsed={collapsed} />
      </div>
      <div className={cn('border-t border-line-soft py-3', collapsed ? 'px-2.5' : 'px-3')}>
        <FooterNav collapsed={collapsed} />
        {collapsed ? (
          <button onClick={() => setCollapsed(false)} className="mt-2 flex h-9 w-full items-center justify-center rounded-lg text-fg-subtle hover:bg-surface-2 hover:text-fg" aria-label="Expand sidebar">
            <PanelLeftOpen size={16} />
          </button>
        ) : null}
      </div>
    </aside>
  );
}
