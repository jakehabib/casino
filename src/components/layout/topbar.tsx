'use client';
import Link from 'next/link';
import { MessageSquare, Users } from 'lucide-react';
import { useMe } from '@/hooks/use-me';
import { usePresence } from '@/hooks/use-socket';
import { useUi } from '@/stores/ui-store';
import { useChatUnread } from '@/components/chat/chat-store';
import { BalanceDisplay } from '@/components/ui/balance-display';
import { IconButton, Button } from '@/components/ui/button';
import { LogoMark } from '@/components/brand/logo';
import { Skeleton } from '@/components/ui/skeleton';
import { GameSearch } from './search';
import { RewardsPopover } from './rewards-popover';
import { NotificationsPopover } from './notifications-popover';
import { AccountMenu } from './account-menu';
import { cn } from '@/lib/cn';

export function OnlineCount({ className }: { className?: string }) {
  const online = usePresence();
  return (
    <div className={cn('flex items-center gap-1.5 text-xs font-medium text-fg-muted', className)} title="Players online" data-testid="online-count">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-win opacity-40" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-win" />
      </span>
      <Users size={13} className="hidden xl:block" />
      <span className="tabular">{online ?? '—'}</span>
      <span className="hidden xl:inline">online</span>
    </div>
  );
}

export function TopBar() {
  const { data: me, isLoading } = useMe();
  const chatOpen = useUi((s) => s.chatOpen);
  const toggleChat = useUi((s) => s.toggleChat);
  const unread = useChatUnread().count;
  return (
    <header className="sticky top-0 z-[var(--z-header)] flex h-14 items-center gap-2 border-b border-line-soft bg-bg/85 px-3 backdrop-blur-xl sm:h-16 sm:gap-3 sm:px-5">
      <Link href="/" className="lg:hidden" aria-label="NOVA home">
        <LogoMark size={28} />
      </Link>
      <div className="hidden flex-1 items-center gap-4 md:flex">
        <GameSearch />
        <OnlineCount />
      </div>
      <div className="flex flex-1 items-center justify-end gap-1.5 sm:gap-2 md:flex-none">
        {isLoading ? (
          <Skeleton className="h-9 w-40" />
        ) : me ? (
          <>
            <Link href="/wallet" aria-label="Wallet">
              <BalanceDisplay />
            </Link>
            <RewardsPopover compact={false} />
            <NotificationsPopover unread={me.unreadNotifications} />
            <AccountMenu me={me} />
            <IconButton label={chatOpen ? 'Hide chat' : 'Show chat'} tone={chatOpen ? 'active' : 'filled'} onClick={toggleChat} badge={chatOpen ? undefined : unread} className="hidden xl:inline-flex">
              <MessageSquare size={17} />
            </IconButton>
          </>
        ) : (
          <>
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Create account</Button>
            </Link>
            <IconButton label={chatOpen ? 'Hide chat' : 'Show chat'} tone={chatOpen ? 'active' : 'filled'} onClick={toggleChat} badge={chatOpen ? undefined : unread} className="hidden xl:inline-flex">
              <MessageSquare size={17} />
            </IconButton>
          </>
        )}
      </div>
    </header>
  );
}
