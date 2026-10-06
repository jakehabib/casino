'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatCredits, formatShortDateTime, timeAgo } from '@/lib/format';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/input';
import { CreditIcon } from '@/components/ui/credit-icon';
import { Tooltip } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { toast } from '@/components/ui/toast';

/* ── Layout ─────────────────────────────────────────────── */

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 @xl:flex-row @xl:items-end @xl:justify-between">
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-2xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">{eyebrow}</div> : null}
        <h1 className="truncate text-xl font-semibold tracking-tight sm:text-[22px]">{title}</h1>
        {description ? <p className="mt-1 text-[13px] text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  flush,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Remove body padding (for edge-to-edge tables). */
  flush?: boolean;
}) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-line bg-surface-1', className)}>
      {title || actions ? (
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line-soft px-4 py-3">
          <div className="min-w-[10rem] flex-1">
            {title ? <h2 className="truncate text-[13.5px] font-semibold tracking-tight text-fg">{title}</h2> : null}
            {description ? <p className="mt-0.5 truncate text-xs text-fg-subtle">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn(!flush && 'p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/* ── Tables ─────────────────────────────────────────────── */

export function Table({ children, className, minWidth = 640 }: { children: ReactNode; className?: string; minWidth?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full border-collapse text-[13px]', className)} style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function Th({ children, className, align = 'left' }: { children?: ReactNode; className?: string; align?: 'left' | 'right' | 'center' }) {
  return (
    <th
      className={cn(
        'h-9 whitespace-nowrap border-b border-line bg-surface-1 px-3 text-2xs font-semibold uppercase tracking-[0.08em] text-fg-subtle first:pl-4 last:pr-4',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className, align = 'left', colSpan }: { children?: ReactNode; className?: string; align?: 'left' | 'right' | 'center'; colSpan?: number }) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        'h-11 whitespace-nowrap border-b border-line-soft px-3 align-middle text-fg-muted first:pl-4 last:pr-4',
        align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left',
        className,
      )}
    >
      {children}
    </td>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-line-soft">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: cols }, (_, j) => (
            <Skeleton key={j} className={cn('h-3.5', j === 0 ? 'w-40' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Pager({ page, pages, total, onPage, label = 'results' }: { page: number; pages: number; total: number; onPage: (p: number) => void; label?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-fg-subtle">
      <span className="tabular">
        {total.toLocaleString('en-US')} {label}
      </span>
      <div className="flex items-center gap-1.5">
        <span className="tabular mr-1.5">
          Page {page} of {pages}
        </span>
        <Button variant="subtle" size="xs" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page" sound={false}>
          <ChevronLeft size={14} />
        </Button>
        <Button variant="subtle" size="xs" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page" sound={false}>
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

export function LoadMore({ hasMore, loading, onClick }: { hasMore: boolean; loading?: boolean; onClick: () => void }) {
  if (!hasMore) return null;
  return (
    <div className="flex justify-center border-t border-line-soft p-3">
      <Button variant="ghost" size="sm" loading={loading} onClick={onClick} sound={false}>
        Load more
      </Button>
    </div>
  );
}

/* ── Values & badges ────────────────────────────────────── */

export function Credits({ value, signed, className, icon = true }: { value: number; signed?: boolean; className?: string; icon?: boolean }) {
  return (
    <span
      className={cn(
        'tabular inline-flex items-center gap-1 font-medium',
        signed && value > 0 && 'text-win',
        signed && value < 0 && 'text-loss',
        !signed && 'text-fg',
        className,
      )}
    >
      {icon ? <CreditIcon size={12} className="opacity-80" /> : null}
      {formatCredits(value, { sign: signed })}
    </span>
  );
}

export function Time({ at, relative }: { at: string | null | undefined; relative?: boolean }) {
  if (!at) return <span className="text-fg-faint">—</span>;
  const abs = new Date(at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <Tooltip content={abs}>
      <time dateTime={at} className="tabular cursor-default">
        {relative ? timeAgo(at) : formatShortDateTime(at)}
      </time>
    </Tooltip>
  );
}

type Tone = 'neutral' | 'accent' | 'win' | 'loss' | 'warn' | 'info' | 'gold';
const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-fg-muted border-line-strong/50',
  accent: 'bg-accent-soft text-accent border-accent/25',
  win: 'bg-win-soft text-win border-win/25',
  loss: 'bg-loss-soft text-loss border-loss/25',
  warn: 'bg-warn/10 text-warn border-warn/25',
  info: 'bg-info/10 text-info border-info/25',
  gold: 'bg-gold-soft text-gold border-gold/30',
};

export function Pill({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn('inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-md border px-1.5 text-[11px] font-semibold', TONES[tone], className)}>
      {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

const ROLE_LABEL: Record<string, string> = { USER: 'Player', MODERATOR: 'Moderator', ADMIN: 'Admin', SUPER_ADMIN: 'Super admin' };
export function RolePill({ role }: { role: string }) {
  const tone: Tone = role === 'SUPER_ADMIN' ? 'gold' : role === 'ADMIN' ? 'accent' : role === 'MODERATOR' ? 'info' : 'neutral';
  return <Pill tone={tone}>{ROLE_LABEL[role] ?? role}</Pill>;
}
export const roleLabel = (r: string) => ROLE_LABEL[r] ?? r;

export function StatusPill({ status, until }: { status: string; until?: string | null }) {
  if (status === 'BANNED') return <Pill tone="loss" dot>Banned</Pill>;
  if (status === 'SUSPENDED') {
    const expired = until && new Date(until) <= new Date();
    return (
      <Pill tone={expired ? 'neutral' : 'warn'} dot>
        {expired ? 'Suspension ended' : until ? `Suspended · ${formatShortDateTime(until)}` : 'Suspended'}
      </Pill>
    );
  }
  return <Pill tone="win" dot>Active</Pill>;
}

export const GAME_LABEL: Record<string, string> = {
  BLACKJACK: 'Blackjack',
  BACCARAT: 'Baccarat',
  ROULETTE: 'Roulette',
  CRASH: 'Crash',
  SLOTS: 'Slots',
};

export const ACTION_LABEL: Record<string, string> = {
  USER_CREDIT_ADJUST: 'Credit adjustment',
  USER_SUSPEND: 'Suspend user',
  USER_BAN: 'Ban user',
  USER_UNBAN: 'Unban user',
  USER_UNSUSPEND: 'Lift suspension',
  USER_ROLE_CHANGE: 'Role change',
  SETTINGS_UPDATE: 'Settings update',
  RP_REINSTATEMENT: 'RP reinstatement',
};
export const actionLabel = (a: string) => ACTION_LABEL[a] ?? a.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export function KeyValue({ items, className }: { items: { label: ReactNode; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3 @xs:grid-cols-2', className)}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">{it.label}</dt>
          <dd className="mt-1 truncate text-[13px] text-fg">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RestrictedNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-xs text-fg-muted', className)}>
      <Lock size={14} className="mt-px shrink-0 text-fg-subtle" />
      <div>{children}</div>
    </div>
  );
}

export function UserLink({ id, username, className }: { id: string; username: string; className?: string }) {
  return (
    <Link href={`/admin/users/${id}`} className={cn('font-medium text-fg underline-offset-2 hover:text-accent hover:underline', className)}>
      @{username}
    </Link>
  );
}

/* ── Reason-gated confirmation ──────────────────────────── */

/**
 * Every admin mutation requires a written reason that lands in the audit log.
 * This dialog collects it, shows a summary of the change, and runs `onConfirm`.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  summary,
  children,
  confirmLabel = 'Confirm',
  tone = 'primary',
  disabled,
  onConfirm,
  placeholder = 'Why are you making this change? This is recorded in the audit log.',
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  summary?: ReactNode;
  children?: ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  disabled?: boolean;
  onConfirm: (reason: string) => Promise<unknown>;
  placeholder?: string;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = reason.trim().length >= 3;
  const close = (o: boolean) => {
    if (busy) return;
    onOpenChange(o);
    if (!o) {
      setReason('');
      setError(null);
    }
  };
  const submit = async () => {
    if (!valid || disabled) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
      setReason('');
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onOpenChange={close}
      title={title}
      description={description}
      tone="serious"
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={submit} loading={busy} disabled={!valid || disabled}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {children}
        {summary ? <div className="rounded-lg border border-line bg-surface-2 p-3 text-[13px]">{summary}</div> : null}
        <Field label="Reason" htmlFor="admin-reason" hint="Required · minimum 3 characters · visible to other admins" error={error}>
          <textarea
            id="admin-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={placeholder}
            className="w-full resize-none rounded-lg border border-line bg-bg-raised px-3 py-2.5 text-sm text-fg outline-none transition-[border,box-shadow] placeholder:text-fg-faint hover:border-line-strong focus:border-accent/70 focus:shadow-[0_0_0_3px_#7c5cff26]"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit();
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}

export function notifyError(e: unknown) {
  if (e instanceof ApiError) toast.error(e.title, e.message);
  else toast.error('Something went wrong', 'Please try again in a moment.');
}

/* ── Inputs ─────────────────────────────────────────────── */

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        'w-full resize-none rounded-lg border border-line bg-bg-raised px-3 py-2.5 text-sm text-fg outline-none transition-[border,box-shadow] placeholder:text-fg-faint hover:border-line-strong focus:border-accent/70 focus:shadow-[0_0_0_3px_#7c5cff26]',
        props.className,
      )}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full appearance-none rounded-lg border border-line bg-bg-raised pl-3 pr-8 text-[13px] text-fg outline-none transition-colors hover:border-line-strong focus:border-accent/70"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronRight size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 text-fg-subtle" />
    </div>
  );
}
