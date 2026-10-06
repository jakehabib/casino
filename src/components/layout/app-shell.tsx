'use client';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from './sidebar';
import { TopBar } from './topbar';
import { MobileBottomNav } from './mobile-nav';
import { ChatPanel } from '@/components/chat/chat-panel';
import { useUi } from '@/stores/ui-store';
import { Footer } from './footer';
import { AnnouncementBanner } from './announcement';
import { DUR, EASE } from '@/lib/motion';

export function AppShell({ children }: { children: ReactNode }) {
  const chatOpen = useUi((s) => s.chatOpen);
  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <AnnouncementBanner />
        <main id="main" className="min-w-0 flex-1 pb-20 lg:pb-0">
          {children}
        </main>
        <Footer />
      </div>
      <AnimatePresence initial={false}>
        {chatOpen ? (
          <motion.aside
            key="chat"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 340, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: DUR.standard, ease: EASE.out }}
            className="sticky top-0 z-[var(--z-sidebar)] hidden h-dvh shrink-0 overflow-hidden border-l border-line-soft bg-bg-raised xl:block"
            aria-label="Chat"
          >
            <div className="h-full w-[340px]">
              <ChatPanel variant="panel" />
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>
      <MobileBottomNav />
    </div>
  );
}
