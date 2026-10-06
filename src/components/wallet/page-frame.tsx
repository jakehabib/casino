'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useMe, type Me } from '@/hooks/use-me';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';

/**
 * Shared frame for the account-area pages (wallet, rewards, history,
 * responsible play, fairness, support): consistent width, header rhythm and
 * signed-out handling.
 */
export function PageContainer({ children, className, narrow }: { children: ReactNode; className?: string; narrow?: boolean }) {
  return <div className={cn('mx-auto w-full px-4 pb-10 pt-5 sm:px-6 sm:pt-7', narrow ? 'max-w-[920px]' : 'max-w-[1120px]', className)}>{children}</div>;
}

export function PageHeader({ eyebrow, title, description, actions, icon }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-3.5">
        {icon ? <div className="mt-0.5 hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-fg-muted sm:flex">{icon}</div> : null}
        <div className="min-w-0">
          {eyebrow ? <div className="mb-1 text-2xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">{eyebrow}</div> : null}
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-fg">{title}</h1>
          {description ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-fg-muted">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionHeading({ title, description, aside, id }: { title: string; description?: ReactNode; aside?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between" id={id}>
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-fg">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p> : null}
      </div>
      {aside}
    </div>
  );
}

export function Panel({ children, className, as: As = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  return <As className={cn('rounded-xl border border-line bg-surface-1', className)}>{children}</As>;
}

/** Renders children with the signed-in user, or a calm sign-in prompt. */
export function RequireAuth({ children, title, skeleton }: { children: (me: Me) => ReactNode; title: string; skeleton?: ReactNode }) {
  const { data: me, isLoading } = useMe();
  const pathname = usePathname();
  if (isLoading) {
    return (
      skeleton ?? (
        <div className="space-y-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      )
    );
  }
  if (!me) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-line bg-surface-1 px-6 py-12 text-center">
        <div className="text-lg font-semibold">Sign in to view {title}</div>
        <p className="mt-1.5 text-sm text-fg-muted">This page is private to your account.</p>
        <div className="mt-5 flex gap-2">
          <Link href={`/login?next=${encodeURIComponent(pathname ?? '/')}`}>
            <Button variant="secondary">Sign in</Button>
          </Link>
          <Link href="/register">
            <Button>Create account</Button>
          </Link>
        </div>
      </div>
    );
  }
  return <>{children(me)}</>;
}

/** Small copy-to-clipboard affordance for hashes and seeds. */
export function useCopy() {
  return async (text: string, label = 'Copied') => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };
}
