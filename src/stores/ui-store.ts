'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiState {
  chatOpen: boolean;
  sidebarCollapsed: boolean;
  mobileMenuOpen: boolean;
  mobileChatOpen: boolean;
  setChatOpen: (v: boolean) => void;
  toggleChat: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setMobileMenuOpen: (v: boolean) => void;
  setMobileChatOpen: (v: boolean) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      chatOpen: true,
      sidebarCollapsed: false,
      mobileMenuOpen: false,
      mobileChatOpen: false,
      setChatOpen: (chatOpen) => set({ chatOpen }),
      toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setMobileMenuOpen: (mobileMenuOpen) => set({ mobileMenuOpen }),
      setMobileChatOpen: (mobileChatOpen) => set({ mobileChatOpen }),
    }),
    { name: 'nova.ui.v1', partialize: (s) => ({ chatOpen: s.chatOpen, sidebarCollapsed: s.sidebarCollapsed }) },
  ),
);
