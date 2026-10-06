'use client';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut, User, Settings, History, HeartHandshake, Shield, Wrench, Wallet } from 'lucide-react';
import { Dropdown, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown';
import { Avatar } from '@/components/ui/avatar';
import { LevelBadge } from '@/components/ui/level-badge';
import { api } from '@/lib/api';
import { resetSocket } from '@/lib/socket-client';
import type { Me } from '@/hooks/use-me';
import { TIER_LABEL } from '@/lib/levels';
import { formatCredits } from '@/lib/format';

export function LevelProgress({ me, className }: { me: Me; className?: string }) {
  const pct = me.level.xpForNext ? Math.min(100, (me.level.xpIntoLevel / me.level.xpForNext) * 100) : 100;
  return (
    <div className={className}>
      <div className="flex items-center justify-between text-[11px] text-fg-subtle">
        <span>
          {TIER_LABEL[me.level.tier]} · Level {me.level.level}
        </span>
        <span className="tabular">{me.level.xpForNext ? `${formatCredits(me.level.xpIntoLevel)} / ${formatCredits(me.level.xpForNext)} XP` : 'Max level'}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-4">
        <div className="h-full rounded-full bg-gradient-to-r from-accent to-[#a48bff] transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function AccountMenu({ me }: { me: Me }) {
  const router = useRouter();
  const qc = useQueryClient();
  const logout = async () => {
    await api.post('/api/auth/logout');
    qc.clear();
    resetSocket();
    router.push('/login');
    router.refresh();
  };
  const isStaff = me.user.role !== 'USER';
  return (
    <Dropdown
      trigger={
        <button className="flex h-9 items-center gap-2 rounded-lg pl-1 pr-1 transition-colors hover:bg-surface-2 sm:pr-2" aria-label="Account menu" data-testid="account-menu">
          <Avatar avatarUrl={me.user.avatarUrl} name={me.user.username} size={28} />
          <span className="hidden sm:block">
            <LevelBadge level={me.level.level} size="xs" />
          </span>
        </button>
      }
      className="w-[260px]"
    >
      <div className="px-2.5 pb-3 pt-2">
        <div className="flex items-center gap-2.5">
          <Avatar avatarUrl={me.user.avatarUrl} name={me.user.username} size={36} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold">{me.user.displayName}</span>
              <LevelBadge level={me.level.level} size="xs" />
            </div>
            <div className="truncate text-xs text-fg-subtle">{me.user.email}</div>
          </div>
        </div>
        <LevelProgress me={me} className="mt-3" />
      </div>
      <DropdownSeparator />
      <DropdownItem icon={<User size={15} />} onSelect={() => router.push('/profile')}>Profile</DropdownItem>
      <DropdownItem icon={<Wallet size={15} />} onSelect={() => router.push('/wallet')}>Wallet</DropdownItem>
      <DropdownItem icon={<History size={15} />} onSelect={() => router.push('/history')}>Game history</DropdownItem>
      <DropdownItem icon={<Settings size={15} />} onSelect={() => router.push('/settings')}>Settings</DropdownItem>
      <DropdownItem icon={<HeartHandshake size={15} />} onSelect={() => router.push('/responsible-play')}>Responsible play</DropdownItem>
      {isStaff ? (
        <>
          <DropdownSeparator />
          <DropdownItem icon={<Shield size={15} />} onSelect={() => router.push('/admin')}>Admin</DropdownItem>
        </>
      ) : null}
      {process.env.NODE_ENV !== 'production' ? (
        <DropdownItem icon={<Wrench size={15} />} onSelect={() => router.push('/dev')}>Dev panel</DropdownItem>
      ) : null}
      <DropdownSeparator />
      <DropdownItem icon={<LogOut size={15} />} onSelect={logout}>Sign out</DropdownItem>
    </Dropdown>
  );
}
