'use client';
import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; leading?: ReactNode; trailing?: ReactNode }>(
  function Input({ className, invalid, leading, trailing, ...props }, ref) {
    return (
      <div
        className={cn(
          'flex h-11 items-center gap-2 rounded-lg border bg-bg-raised px-3 transition-[border,box-shadow] duration-150 focus-within:border-accent/70 focus-within:shadow-[0_0_0_3px_#7c5cff26]',
          invalid ? 'border-loss/60' : 'border-line hover:border-line-strong',
          className,
        )}
      >
        {leading ? <span className="shrink-0 text-fg-subtle">{leading}</span> : null}
        <input
          ref={ref}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-faint sm:text-sm"
          aria-invalid={invalid || undefined}
          {...props}
        />
        {trailing}
      </div>
    );
  },
);

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-fg-muted">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs font-medium text-loss">{error}</p> : hint ? <p className="text-xs text-fg-subtle">{hint}</p> : null}
    </div>
  );
}
