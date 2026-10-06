'use client';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';
import { LoadingSpinner } from './spinner';
import { playSound } from '@/audio/audio-manager';

const buttonVariants = cva(
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-semibold tracking-[-0.005em] transition-[background,box-shadow,color,transform,opacity] duration-150 ease-[var(--ease-out-quint)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-accent-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_6px_20px_-8px_#7c5cffaa] hover:bg-accent-hover active:bg-accent-press',
        secondary: 'bg-surface-3 text-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.05)] hover:bg-surface-4 border border-line-strong/60',
        ghost: 'text-fg-muted hover:bg-surface-3 hover:text-fg',
        outline: 'border border-line-strong text-fg hover:bg-surface-3',
        win: 'bg-win text-[#04150d] hover:brightness-110 shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_6px_20px_-8px_#3ddc97aa]',
        gold: 'bg-gradient-to-b from-gold-bright to-gold text-[#2a1d05] hover:brightness-105 shadow-[inset_0_1px_0_rgb(255_255_255/0.4),0_6px_20px_-8px_#e2b456aa]',
        danger: 'bg-loss/90 text-white hover:bg-loss',
        subtle: 'bg-surface-2 text-fg-muted hover:text-fg hover:bg-surface-3 border border-line',
      },
      size: {
        xs: 'h-7 rounded-sm px-2.5 text-xs',
        sm: 'h-8 rounded-md px-3 text-[13px]',
        md: 'h-10 rounded-md px-4 text-sm',
        lg: 'h-12 rounded-lg px-5 text-[15px]',
        xl: 'h-14 rounded-xl px-6 text-base',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  sound?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, loading, leftIcon, rightIcon, children, disabled, onClick, sound = true, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onClick={(e) => {
        if (sound) playSound('click');
        onClick?.(e);
      }}
      {...props}
    >
      {loading ? <LoadingSpinner size={size === 'xs' || size === 'sm' ? 12 : 16} className="absolute" /> : null}
      <span className={cn('inline-flex items-center gap-2', loading && 'invisible')}>
        {leftIcon}
        {children}
        {rightIcon}
      </span>
    </button>
  );
});

export const PrimaryButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, 'variant'>>(function PrimaryButton(p, ref) {
  return <Button ref={ref} variant="primary" {...p} />;
});

export const SecondaryButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, 'variant'>>(function SecondaryButton(p, ref) {
  return <Button ref={ref} variant="secondary" {...p} />;
});

const iconButtonVariants = cva(
  'relative inline-flex shrink-0 items-center justify-center rounded-md text-fg-muted transition-colors duration-150 hover:bg-surface-3 hover:text-fg active:scale-95 disabled:opacity-40 disabled:pointer-events-none',
  {
    variants: {
      size: { sm: 'h-8 w-8', md: 'h-9 w-9', lg: 'h-10 w-10' },
      tone: { default: '', filled: 'bg-surface-2 border border-line', active: 'bg-accent-soft text-accent' },
    },
    defaultVariants: { size: 'md', tone: 'default' },
  },
);

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof iconButtonVariants> {
  label: string;
  badge?: number | boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, size, tone, label, badge, children, ...props },
  ref,
) {
  return (
    <button ref={ref} aria-label={label} title={label} className={cn(iconButtonVariants({ size, tone }), className)} {...props}>
      {children}
      {badge ? (
        <span className="absolute right-1 top-1 flex min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold leading-4 text-white ring-2 ring-bg">
          {typeof badge === 'number' ? (badge > 9 ? '9+' : badge) : ''}
        </span>
      ) : null}
    </button>
  );
});
