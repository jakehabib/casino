'use client';
import * as D from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Dropdown({ trigger, children, align = 'end', className }: { trigger: ReactNode; children: ReactNode; align?: 'start' | 'end' | 'center'; className?: string }) {
  return (
    <D.Root modal={false}>
      <D.Trigger asChild>{trigger}</D.Trigger>
      <D.Portal>
        <D.Content
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className={cn(
            'z-[var(--z-popover)] min-w-[220px] rounded-xl border border-line bg-surface-1 p-1.5 shadow-3 data-[state=open]:animate-[popIn_160ms_var(--ease-out-quint)]',
            className,
          )}
        >
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function DropdownItem({ children, icon, onSelect, tone = 'default', className }: { children: ReactNode; icon?: ReactNode; onSelect?: () => void; tone?: 'default' | 'danger'; className?: string }) {
  return (
    <D.Item
      onSelect={onSelect}
      className={cn(
        'flex h-9 cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium outline-none transition-colors',
        tone === 'danger' ? 'text-loss data-[highlighted]:bg-loss-soft' : 'text-fg-muted data-[highlighted]:bg-surface-3 data-[highlighted]:text-fg',
        className,
      )}
    >
      {icon ? <span className="text-fg-subtle">{icon}</span> : null}
      {children}
    </D.Item>
  );
}

export const DropdownSeparator = () => <D.Separator className="my-1 h-px bg-line" />;
export const DropdownLabel = ({ children }: { children: ReactNode }) => (
  <D.Label className="px-2.5 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">{children}</D.Label>
);
