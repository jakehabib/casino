'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, LayoutGrid, Gift, MessageSquare, History } from 'lucide-react';
import { useUi } from '@/stores/ui-store';
import { MobileDrawer } from '@/components/ui/drawer';
import { Logo } from '@/components/brand/logo';
import { NavSections, FooterNav, isActive } from './sidebar';
import { ChatPanel } from '@/components/chat/chat-panel';
import { OnlineCount } from './topbar';
import { cn } from '@/lib/cn';

export function MobileBottomNav() {
  const pathname = usePathname();
  const { setMobileMenuOpen, setMobileChatOpen, mobileMenuOpen, mobileChatOpen } = useUi();
  const item = 'flex flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition-colors';
  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-[var(--z-header)] border-t border-line-soft bg-bg/95 backdrop-blur-xl pb-safe lg:hidden"
        aria-label="Mobile"
      >
        <div className="flex h-14 items-stretch">
          <button className={cn(item, mobileMenuOpen ? 'text-fg' : 'text-fg-subtle')} onClick={() => setMobileMenuOpen(true)}>
            <Menu size={19} />
            Menu
          </button>
          <Link href="/casino" className={cn(item, isActive(pathname, '/casino') ? 'text-accent' : 'text-fg-subtle')}>
            <LayoutGrid size={19} />
            Casino
          </Link>
          <Link href="/rewards" className={cn(item, isActive(pathname, '/rewards') ? 'text-accent' : 'text-fg-subtle')}>
            <Gift size={19} />
            Rewards
          </Link>
          <Link href="/history" className={cn(item, isActive(pathname, '/history') ? 'text-accent' : 'text-fg-subtle')}>
            <History size={19} />
            History
          </Link>
          <button className={cn(item, mobileChatOpen ? 'text-fg' : 'text-fg-subtle')} onClick={() => setMobileChatOpen(true)} data-testid="mobile-chat-button">
            <MessageSquare size={19} />
            Chat
          </button>
        </div>
      </nav>
      <MobileDrawer open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} side="left" title="Menu">
        <div className="flex h-14 items-center justify-between px-4">
          <Logo />
          <OnlineCount />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <NavSections onNavigate={() => setMobileMenuOpen(false)} />
          <div className="mx-2.5 my-3 h-px bg-line-soft" />
          <FooterNav onNavigate={() => setMobileMenuOpen(false)} />
        </div>
      </MobileDrawer>
      <MobileDrawer open={mobileChatOpen} onOpenChange={setMobileChatOpen} side="bottom" title="Chat" className="h-[86dvh]">
        <ChatPanel variant="drawer" onClose={() => setMobileChatOpen(false)} />
      </MobileDrawer>
    </>
  );
}
