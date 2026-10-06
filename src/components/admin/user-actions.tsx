'use client';
import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Minus, Plus } from 'lucide-react';
import { api, requestId } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatCredits, formatDateTime } from '@/lib/format';
import { toast } from '@/components/ui/toast';
import { Input, Field } from '@/components/ui/input';
import { CreditIcon } from '@/components/ui/credit-icon';
import type { AdminUserDetail } from '@/server/services/admin/users';
import { Credits, ReasonDialog, RolePill, Select, roleLabel } from './ui';

type U = AdminUserDetail['user'];

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode; tone?: 'danger' }[] }) {
  return (
    <div role="radiogroup" className="grid gap-1 rounded-lg border border-line bg-bg-raised p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex h-8 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium transition-colors',
            value === o.value ? (o.tone === 'danger' ? 'bg-loss-soft text-loss' : 'bg-surface-3 text-fg shadow-1') : 'text-fg-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const QUICK = [1_000, 10_000, 50_000, 100_000];

export function CreditAdjustDialog({ open, onOpenChange, user, balance }: { open: boolean; onOpenChange: (o: boolean) => void; user: U; balance: number }) {
  const qc = useQueryClient();
  const [dir, setDir] = useState<'add' | 'remove'>('add');
  const [raw, setRaw] = useState('');
  // One idempotency key per dialog session: retries after a network error never double-apply.
  const rid = useRef<string>('');
  if (open && !rid.current) rid.current = requestId();
  if (!open && rid.current) rid.current = '';

  const amount = Number(raw.replace(/[^\d]/g, '')) || 0;
  const signed = dir === 'add' ? amount : -amount;
  const next = balance + signed;
  const invalid = amount <= 0 || next < 0 || amount > 1_000_000_000;

  return (
    <ReasonDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setRaw('');
          setDir('add');
        }
      }}
      title="Adjust credits"
      description={`Manual ledger adjustment for @${user.username}.`}
      confirmLabel={dir === 'add' ? 'Add credits' : 'Remove credits'}
      tone={dir === 'remove' ? 'danger' : 'primary'}
      disabled={invalid}
      summary={
        <div className="space-y-1.5">
          <div className="flex justify-between text-fg-muted">
            <span>Current balance</span>
            <Credits value={balance} />
          </div>
          <div className="flex justify-between text-fg-muted">
            <span>Adjustment</span>
            <Credits value={signed} signed />
          </div>
          <div className="flex justify-between border-t border-line pt-1.5 font-medium text-fg">
            <span>New balance</span>
            <span className={cn('tabular inline-flex items-center gap-1', next < 0 && 'text-loss')}>
              <CreditIcon size={12} />
              {formatCredits(next)}
            </span>
          </div>
          {next < 0 ? <p className="pt-1 text-xs text-loss">Adjustments cannot make a balance negative.</p> : null}
        </div>
      }
      onConfirm={async (reason) => {
        const res = await api.post<{ duplicate: boolean; balance: number }>(`/api/admin/users/${user.id}/credits`, {
          amount: signed,
          reason,
          requestId: rid.current,
        });
        rid.current = '';
        toast.success(res.duplicate ? 'Already applied' : 'Balance adjusted', `New balance ${formatCredits(res.balance)} Credits.`);
        await qc.invalidateQueries({ queryKey: ['admin', 'user', user.id] });
        setRaw('');
      }}
    >
      <Segmented
        value={dir}
        onChange={setDir}
        options={[
          { value: 'add', label: <><Plus size={14} /> Add</> },
          { value: 'remove', label: <><Minus size={14} /> Remove</>, tone: 'danger' },
        ]}
      />
      <Field label="Amount" htmlFor="adj-amount">
        <Input
          id="adj-amount"
          inputMode="numeric"
          leading={<CreditIcon size={15} />}
          placeholder="0"
          value={amount ? amount.toLocaleString('en-US') : ''}
          onChange={(e) => setRaw(e.target.value)}
          autoFocus
          className="tabular"
        />
      </Field>
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setRaw(String(v))}
            className="tabular h-7 rounded-md border border-line bg-surface-2 px-2.5 text-xs font-medium text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            {formatCredits(v, { compact: true })}
          </button>
        ))}
        {dir === 'remove' && balance > 0 ? (
          <button
            type="button"
            onClick={() => setRaw(String(balance))}
            className="h-7 rounded-md border border-line bg-surface-2 px-2.5 text-xs font-medium text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            Full balance
          </button>
        ) : null}
      </div>
    </ReasonDialog>
  );
}

const DURATIONS = [
  { value: '24h', label: '24 hours', ms: 86_400_000 },
  { value: '3d', label: '3 days', ms: 3 * 86_400_000 },
  { value: '7d', label: '7 days', ms: 7 * 86_400_000 },
  { value: '30d', label: '30 days', ms: 30 * 86_400_000 },
  { value: 'indef', label: 'Indefinite', ms: null },
] as const;

export function StatusDialog({
  open,
  onOpenChange,
  user,
  action,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  user: U;
  action: 'SUSPEND' | 'BAN' | 'REINSTATE';
}) {
  const qc = useQueryClient();
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]['value']>('7d');
  const until = useMemo(() => {
    const d = DURATIONS.find((x) => x.value === duration)!;
    return d.ms ? new Date(Date.now() + d.ms) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, open]);

  const copy = {
    SUSPEND: {
      title: 'Suspend account',
      description: `@${user.username} will be unable to place wagers until the suspension ends. They can still sign in and view their account.`,
      confirm: 'Suspend',
    },
    BAN: {
      title: 'Ban account',
      description: `@${user.username} will be signed out everywhere and cannot sign in again until unbanned.`,
      confirm: 'Ban account',
    },
    REINSTATE: {
      title: user.status === 'BANNED' ? 'Unban account' : 'Lift suspension',
      description: `Restore full access for @${user.username}. Responsible-play restrictions are unaffected.`,
      confirm: user.status === 'BANNED' ? 'Unban' : 'Lift suspension',
    },
  }[action];

  return (
    <ReasonDialog
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.confirm}
      tone={action === 'REINSTATE' ? 'primary' : 'danger'}
      summary={
        action === 'SUSPEND' ? (
          <div className="flex justify-between text-fg-muted">
            <span>Suspended until</span>
            <span className="font-medium text-fg">{until ? formatDateTime(until) : 'Further notice'}</span>
          </div>
        ) : undefined
      }
      onConfirm={async (reason) => {
        await api.post(`/api/admin/users/${user.id}/status`, { action, reason, until: action === 'SUSPEND' ? (until?.toISOString() ?? null) : undefined });
        toast.success(action === 'SUSPEND' ? 'Account suspended' : action === 'BAN' ? 'Account banned' : 'Access restored');
        await qc.invalidateQueries({ queryKey: ['admin', 'user', user.id] });
      }}
    >
      {action === 'SUSPEND' ? (
        <Field label="Duration">
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            {DURATIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => setDuration(d.value)}
                aria-pressed={duration === d.value}
                className={cn(
                  'h-9 rounded-lg border text-[13px] font-medium transition-colors',
                  duration === d.value ? 'border-accent/60 bg-accent-soft text-fg' : 'border-line bg-surface-2 text-fg-muted hover:border-line-strong hover:text-fg',
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </Field>
      ) : null}
    </ReasonDialog>
  );
}

export function RoleDialog({ open, onOpenChange, user }: { open: boolean; onOpenChange: (o: boolean) => void; user: U }) {
  const qc = useQueryClient();
  const [role, setRole] = useState<string>(user.role);
  return (
    <ReasonDialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setRole(user.role);
      }}
      title="Change role"
      description="Super admin only. Roles grant access to staff tools; Super Admin is provisioned outside the console."
      confirmLabel="Change role"
      disabled={role === user.role}
      summary={
        <div className="flex items-center justify-between">
          <span className="text-fg-muted">Change</span>
          <span className="flex items-center gap-2">
            <RolePill role={user.role} /> <span className="text-fg-subtle">→</span> <RolePill role={role} />
          </span>
        </div>
      }
      onConfirm={async (reason) => {
        await api.post(`/api/admin/users/${user.id}/role`, { role, reason });
        toast.success('Role updated', `@${user.username} is now ${roleLabel(role)}.`);
        await qc.invalidateQueries({ queryKey: ['admin', 'user', user.id] });
      }}
    >
      <Field label="New role">
        <Select
          label="New role"
          value={role}
          onChange={setRole}
          options={[
            { value: 'USER', label: 'Player' },
            { value: 'MODERATOR', label: 'Moderator — chat moderation' },
            { value: 'ADMIN', label: 'Admin — full console' },
          ]}
        />
      </Field>
    </ReasonDialog>
  );
}
