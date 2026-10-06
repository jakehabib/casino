'use client';
import * as T from '@radix-ui/react-tabs';
import { motion } from 'framer-motion';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { SPRING } from '@/lib/motion';

export interface TabItem {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
}

/** Segmented tabs with a sliding indicator. */
export function Tabs({
  items,
  value,
  onValueChange,
  children,
  className,
  listClassName,
  size = 'md',
}: {
  items: TabItem[];
  value: string;
  onValueChange: (v: string) => void;
  children?: ReactNode;
  className?: string;
  listClassName?: string;
  size?: 'sm' | 'md';
}) {
  const id = useId();
  return (
    <T.Root value={value} onValueChange={onValueChange} className={className}>
      <T.List
        className={cn(
          'scrollbar-none inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-line bg-surface-1 p-1',
          listClassName,
        )}
      >
        {items.map((it) => (
          <T.Trigger
            key={it.value}
            value={it.value}
            className={cn(
              'relative inline-flex shrink-0 items-center gap-1.5 rounded-md font-medium text-fg-muted transition-colors duration-150 hover:text-fg data-[state=active]:text-fg',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
            )}
          >
            {value === it.value ? (
              <motion.span layoutId={`tab-${id}`} transition={SPRING.snappy} className="absolute inset-0 rounded-md bg-surface-3 shadow-1" />
            ) : null}
            <span className="relative inline-flex items-center gap-1.5">
              {it.icon}
              {it.label}
              {it.count !== undefined ? <span className="tabular rounded bg-surface-4 px-1.5 text-[10px] text-fg-muted">{it.count}</span> : null}
            </span>
          </T.Trigger>
        ))}
      </T.List>
      {children}
    </T.Root>
  );
}

export const TabPanel = T.Content;
