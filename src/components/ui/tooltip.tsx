'use client';
import * as T from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <T.Provider delayDuration={250} skipDelayDuration={100}>
    {children}
  </T.Provider>
);

export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  if (!content) return <>{children}</>;
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className="z-[var(--z-tooltip)] max-w-xs rounded-md border border-line-strong bg-surface-4 px-2.5 py-1.5 text-xs font-medium text-fg shadow-2 data-[state=delayed-open]:animate-[popIn_120ms_var(--ease-out-quint)]"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
