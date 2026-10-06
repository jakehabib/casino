'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { DUR, EASE } from '@/lib/motion';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  tone?: 'default' | 'serious';
  dismissible?: boolean;
  className?: string;
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-xl', xl: 'max-w-3xl' };

/** Modal: centred dialog on desktop, bottom sheet on mobile. */
export function Modal({ open, onOpenChange, title, description, children, footer, size = 'md', tone = 'default', dismissible = true, className }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => (dismissible || o ? onOpenChange(o) : undefined)}>
      <AnimatePresence>
        {open ? (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-[var(--z-modal)] bg-black/65 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: DUR.standard }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              onPointerDownOutside={(e) => !dismissible && e.preventDefault()}
              onEscapeKeyDown={(e) => !dismissible && e.preventDefault()}
            >
              <motion.div
                className={cn(
                  'fixed z-[var(--z-modal)] flex max-h-[92dvh] w-full flex-col overflow-hidden border border-line bg-surface-1 shadow-3 outline-none',
                  'inset-x-0 bottom-0 rounded-t-2xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl',
                  SIZES[size],
                  tone === 'serious' && 'border-line-strong',
                  className,
                )}
                initial={{ opacity: 0, y: 24, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.98 }}
                transition={{ duration: DUR.standard, ease: EASE.out }}
              >
                <div className="sm:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong" />
                {title ? (
                  <div className="flex items-start justify-between gap-4 px-5 pt-4 sm:px-6 sm:pt-5">
                    <div className="min-w-0">
                      <Dialog.Title className="text-[17px] font-semibold tracking-tight text-fg">{title}</Dialog.Title>
                      {description ? <Dialog.Description className="mt-1 text-sm text-fg-muted">{description}</Dialog.Description> : null}
                    </div>
                    {dismissible ? (
                      <Dialog.Close className="-mr-2 -mt-1 rounded-md p-2 text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg" aria-label="Close">
                        <X size={18} />
                      </Dialog.Close>
                    ) : null}
                  </div>
                ) : (
                  <Dialog.Title className="sr-only">Dialog</Dialog.Title>
                )}
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
                {footer ? <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 pb-safe sm:flex-row sm:justify-end sm:px-6">{footer}</div> : null}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
