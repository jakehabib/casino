'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, AlertTriangle, Info, X, Gift } from 'lucide-react';
import { create } from 'zustand';
import { cn } from '@/lib/cn';
import { SPRING } from '@/lib/motion';
import { playSound } from '@/audio/audio-manager';

type ToastTone = 'success' | 'error' | 'info' | 'reward';
interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
  duration: number;
}

interface ToastState {
  items: ToastItem[];
  push: (t: Omit<ToastItem, 'id' | 'duration'> & { duration?: number }) => void;
  dismiss: (id: number) => void;
}

let seq = 0;
const useToasts = create<ToastState>((set, get) => ({
  items: [],
  push: (t) => {
    const id = ++seq;
    const item = { duration: 4200, ...t, id };
    set({ items: [...get().items.slice(-3), item] });
    setTimeout(() => get().dismiss(id), item.duration);
  },
  dismiss: (id) => set({ items: get().items.filter((i) => i.id !== id) }),
}));

export const toast = {
  success: (title: string, description?: string) => useToasts.getState().push({ tone: 'success', title, description }),
  error: (title: string, description?: string) => {
    playSound('error');
    useToasts.getState().push({ tone: 'error', title, description, duration: 5200 });
  },
  info: (title: string, description?: string) => useToasts.getState().push({ tone: 'info', title, description }),
  reward: (title: string, description?: string) => {
    playSound('notify');
    useToasts.getState().push({ tone: 'reward', title, description });
  },
};

const ICON = {
  success: <CheckCircle2 size={18} className="text-win" />,
  error: <AlertTriangle size={18} className="text-loss" />,
  info: <Info size={18} className="text-info" />,
  reward: <Gift size={18} className="text-gold" />,
};

export function Toaster() {
  const { items, dismiss } = useToasts();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+64px)] z-[var(--z-toast)] flex flex-col items-center gap-2 px-3 sm:bottom-6 sm:left-auto sm:right-6 sm:top-auto sm:items-end"
    >
      <AnimatePresence initial={false}>
        {items.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.14 } }}
            transition={SPRING.snappy}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-surface-2/95 px-4 py-3 shadow-3 backdrop-blur',
              t.tone === 'reward' ? 'border-gold/30' : 'border-line-strong',
            )}
          >
            <div className="mt-0.5">{ICON[t.tone]}</div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-fg">{t.title}</div>
              {t.description ? <div className="mt-0.5 text-[13px] leading-snug text-fg-muted">{t.description}</div> : null}
            </div>
            <button className="-mr-1 rounded p-1 text-fg-subtle hover:text-fg" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
