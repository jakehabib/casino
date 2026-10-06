'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { DUR, EASE } from '@/lib/motion';

/** MobileDrawer: swipe-dismissable sheet from the left, right or bottom. */
export function MobileDrawer({
  open,
  onOpenChange,
  side = 'bottom',
  title,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  side?: 'left' | 'right' | 'bottom';
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const axis = side === 'bottom' ? 'y' : 'x';
  const hidden = side === 'bottom' ? { y: '100%' } : side === 'left' ? { x: '-100%' } : { x: '100%' };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    const off = axis === 'y' ? info.offset.y : info.offset.x;
    const vel = axis === 'y' ? info.velocity.y : info.velocity.x;
    const dir = side === 'left' ? -1 : 1;
    if (off * dir > 90 || vel * dir > 500) onOpenChange(false);
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-[var(--z-drawer)] bg-black/60"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: DUR.standard }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                drag={axis}
                dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
                dragElastic={side === 'left' ? { left: 0.6, right: 0 } : side === 'right' ? { left: 0, right: 0.6 } : { top: 0, bottom: 0.6 }}
                onDragEnd={onDragEnd}
                initial={hidden}
                animate={{ x: 0, y: 0 }}
                exit={hidden}
                transition={{ duration: DUR.standard + 0.04, ease: EASE.outExpo }}
                className={cn(
                  'fixed z-[var(--z-drawer)] flex flex-col border-line bg-surface-1 shadow-3 outline-none',
                  side === 'bottom' && 'inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl border-t pb-safe',
                  side === 'left' && 'inset-y-0 left-0 w-[86vw] max-w-[320px] border-r',
                  side === 'right' && 'inset-y-0 right-0 w-[92vw] max-w-[400px] border-l',
                  className,
                )}
              >
                <Dialog.Title className="sr-only">{title}</Dialog.Title>
                {side === 'bottom' ? <div className="mx-auto mb-1 mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong" /> : null}
                {children}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
