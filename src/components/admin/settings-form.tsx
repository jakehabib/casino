'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Save, X, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatCredits } from '@/lib/format';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/states';
import { CreditIcon } from '@/components/ui/credit-icon';
import type { AdminSettings } from '@/server/services/admin/settings';
import { Panel, ReasonDialog, Time } from './ui';

export type SettingKey = keyof AdminSettings;

export type FieldDef =
  | { type: 'toggle'; key: string; label: string; hint?: string }
  | { type: 'int'; key: string; label: string; hint?: string; min?: number; max?: number; suffix?: string }
  | { type: 'credits'; key: string; label: string; hint?: string; min?: number; max?: number }
  | { type: 'percent'; key: string; label: string; hint?: string; min: number; max: number } // stored as 0–1 fraction
  | { type: 'bps'; key: string; label: string; hint?: string; min: number; max: number } // stored as basis points
  | { type: 'x100'; key: string; label: string; hint?: string; min: number; max: number } // stored as multiplier ×100
  | { type: 'select'; key: string; label: string; hint?: string; options: { value: string; label: string }[] }
  | { type: 'text'; key: string; label: string; hint?: string; maxLength: number; placeholder?: string }
  | { type: 'betLevels'; key: string; label: string; hint?: string }
  | { type: 'machines'; key: string; label: string; hint?: string; machines: { id: string; name: string }[] };

export interface FieldSection {
  title?: string;
  fields: FieldDef[];
}

export function useAdminSettings() {
  return useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api.get<AdminSettings>('/api/admin/settings') });
}

type Draft = Record<string, unknown>;

/** Convert a stored value to the editable representation (numbers become strings while editing). */
function toDraft(f: FieldDef, v: unknown): unknown {
  switch (f.type) {
    case 'int':
    case 'credits':
      return String(v ?? '');
    case 'percent':
      return String(Math.round((v as number) * 1000) / 10);
    case 'bps':
      return String((v as number) / 100);
    case 'x100':
      return String((v as number) / 100);
    default:
      return v;
  }
}

function fromDraft(f: FieldDef, v: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  const num = (s: unknown) => (typeof s === 'string' && s.trim() !== '' ? Number(s.replace(/,/g, '')) : NaN);
  switch (f.type) {
    case 'int':
    case 'credits': {
      const n = num(v);
      if (!Number.isInteger(n)) return { ok: false, error: 'Whole number required' };
      if (f.min !== undefined && n < f.min) return { ok: false, error: `Minimum ${f.min.toLocaleString('en-US')}` };
      if (f.max !== undefined && n > f.max) return { ok: false, error: `Maximum ${f.max.toLocaleString('en-US')}` };
      return { ok: true, value: n };
    }
    case 'percent': {
      const n = num(v);
      if (!Number.isFinite(n) || n < f.min * 100 || n > f.max * 100) return { ok: false, error: `${f.min * 100}–${f.max * 100}%` };
      return { ok: true, value: Math.round(n * 10) / 1000 };
    }
    case 'bps': {
      const n = num(v);
      if (!Number.isFinite(n) || n < f.min / 100 || n > f.max / 100) return { ok: false, error: `${f.min / 100}–${f.max / 100}%` };
      return { ok: true, value: Math.round(n * 100) };
    }
    case 'x100': {
      const n = num(v);
      if (!Number.isFinite(n) || n < f.min / 100 || n > f.max / 100) return { ok: false, error: `${f.min / 100}×–${(f.max / 100).toLocaleString('en-US')}×` };
      return { ok: true, value: Math.round(n * 100) };
    }
    case 'betLevels': {
      const arr = v as number[];
      if (!arr.length) return { ok: false, error: 'At least one level' };
      return { ok: true, value: [...arr].sort((a, b) => a - b) };
    }
    default:
      return { ok: true, value: v };
  }
}

function display(f: FieldDef, v: unknown): string {
  switch (f.type) {
    case 'toggle':
      return v ? 'On' : 'Off';
    case 'credits':
      return formatCredits(v as number);
    case 'int':
      return `${(v as number).toLocaleString('en-US')}${f.suffix ? ` ${f.suffix}` : ''}`;
    case 'percent':
      return `${Math.round((v as number) * 1000) / 10}%`;
    case 'bps':
      return `${(v as number) / 100}%`;
    case 'x100':
      return `${((v as number) / 100).toLocaleString('en-US')}×`;
    case 'select':
      return f.options.find((o) => o.value === v)?.label ?? String(v);
    case 'text':
      return (v as string) ? `“${v as string}”` : '(empty)';
    case 'betLevels':
      return (v as number[]).map((n) => formatCredits(n, { compact: true })).join(', ');
    case 'machines':
      return Object.entries(v as Record<string, { enabled: boolean }>)
        .map(([k, m]) => `${f.machines.find((x) => x.id === k)?.name ?? k}: ${m.enabled ? 'on' : 'off'}`)
        .join(' · ');
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function SettingsForm({
  settingKey,
  title,
  description,
  icon,
  sections,
  headerToggle,
  data,
  aside,
}: {
  settingKey: SettingKey;
  title: string;
  description?: string;
  icon?: ReactNode;
  sections: FieldSection[];
  /** Render a field (usually `enabled`) as the panel header switch. */
  headerToggle?: { key: string; label: string };
  data: AdminSettings[SettingKey];
  aside?: ReactNode;
}) {
  const qc = useQueryClient();
  const fields = useMemo(() => sections.flatMap((s) => s.fields), [sections]);
  const allFields: FieldDef[] = useMemo(
    () => (headerToggle ? [{ type: 'toggle', key: headerToggle.key, label: headerToggle.label } as FieldDef, ...fields] : fields),
    [fields, headerToggle],
  );
  const stored = data.value as Record<string, unknown>;
  const initial = useMemo(() => Object.fromEntries(allFields.map((f) => [f.key, toDraft(f, stored[f.key])])), [allFields, stored]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [base, setBase] = useState(initial);
  const [confirm, setConfirm] = useState(false);
  if (!same(base, initial)) {
    // Server value changed (after save / refetch): rebase the draft.
    setBase(initial);
    setDraft(initial);
  }

  const parsed = allFields.map((f) => ({ f, r: fromDraft(f, draft[f.key]) }));
  const errors = Object.fromEntries(parsed.filter((p) => !p.r.ok).map((p) => [p.f.key, (p.r as { error: string }).error]));
  const changes = parsed
    .filter((p) => p.r.ok && !same((p.r as { value: unknown }).value, stored[p.f.key]))
    .map((p) => ({ f: p.f, before: stored[p.f.key], after: (p.r as { value: unknown }).value }));
  const dirty = changes.length > 0;
  const hasErrors = Object.keys(errors).length > 0;
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));

  const save = async (reason: string) => {
    const patch = Object.fromEntries(changes.map((c) => [c.f.key, c.after]));
    await api.post('/api/admin/settings', { key: settingKey, patch, reason });
    toast.success(`${title} saved`, `${changes.length} change${changes.length === 1 ? '' : 's'} recorded in the audit log.`);
    await qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
    if (settingKey === 'system') void qc.invalidateQueries({ queryKey: ['site'] });
  };

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          {icon}
          {title}
        </span>
      }
      description={description}
      actions={
        headerToggle ? (
          <label className="flex items-center gap-2 text-xs font-medium text-fg-muted">
            <span className={cn(draft[headerToggle.key] ? 'text-win' : 'text-fg-subtle')}>{draft[headerToggle.key] ? 'Enabled' : 'Disabled'}</span>
            <Switch checked={!!draft[headerToggle.key]} onCheckedChange={(v) => set(headerToggle.key, v)} label={headerToggle.label} />
          </label>
        ) : undefined
      }
      bodyClassName="p-0"
    >
      <div className={cn('grid', aside && 'lg:grid-cols-[minmax(0,1fr)_260px]')}>
        <div className="space-y-5 p-4">
          {sections.map((s, i) => (
            <div key={i}>
              {s.title ? <div className="mb-3 text-2xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">{s.title}</div> : null}
              <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                {s.fields.map((f) => (
                  <FieldControl key={f.key} f={f} value={draft[f.key]} onChange={(v) => set(f.key, v)} error={errors[f.key]} changed={changes.some((c) => c.f.key === f.key)} />
                ))}
              </div>
            </div>
          ))}
        </div>
        {aside ? <div className="border-t border-line-soft bg-surface-2/40 p-4 lg:border-l lg:border-t-0">{aside}</div> : null}
      </div>
      <footer className="flex flex-col gap-2 border-t border-line-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-fg-subtle">
          {dirty ? (
            <span className="font-medium text-warn">
              {changes.length} unsaved change{changes.length === 1 ? '' : 's'}
            </span>
          ) : data.updatedAt ? (
            <>
              Last changed <Time at={data.updatedAt} relative />
              {data.updatedBy ? <> by @{data.updatedBy}</> : null}
            </>
          ) : (
            'Using platform defaults'
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" leftIcon={<RotateCcw size={13} />} disabled={!dirty && !hasErrors} onClick={() => setDraft(initial)}>
            Discard
          </Button>
          <Button size="sm" leftIcon={<Save size={13} />} disabled={!dirty || hasErrors} onClick={() => setConfirm(true)}>
            Save changes
          </Button>
        </div>
      </footer>
      <ReasonDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Save ${title.toLowerCase()}`}
        description="Changes apply to all players within a few seconds."
        confirmLabel="Save changes"
        summary={
          <ul className="space-y-1.5">
            {changes.map((c) => (
              <li key={c.f.key} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-fg-muted">{c.f.label}</span>
                <span className="tabular text-right">
                  <span className="text-fg-subtle line-through decoration-fg-faint">{display(c.f, c.before)}</span>
                  <span className="mx-1.5 text-fg-subtle">→</span>
                  <span className="font-medium text-fg">{display(c.f, c.after)}</span>
                </span>
              </li>
            ))}
          </ul>
        }
        onConfirm={save}
      />
    </Panel>
  );
}

const inputCls =
  'tabular h-10 w-full min-w-0 rounded-lg border bg-bg-raised px-3 text-sm text-fg outline-none transition-[border,box-shadow] placeholder:text-fg-faint focus:border-accent/70 focus:shadow-[0_0_0_3px_#7c5cff26]';

function FieldShell({ f, error, changed, children, wide }: { f: FieldDef; error?: string; changed?: boolean; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('min-w-0', wide && 'sm:col-span-2')}>
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-[13px] font-medium text-fg-muted">{f.label}</span>
        {changed ? <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-label="Modified" /> : null}
      </div>
      {children}
      {error ? <p className="mt-1 text-xs font-medium text-loss">{error}</p> : f.hint ? <p className="mt-1 text-xs text-fg-subtle">{f.hint}</p> : null}
    </div>
  );
}

function Affix({ children, before, after, error }: { children: ReactNode; before?: ReactNode; after?: ReactNode; error?: boolean }) {
  return (
    <div className={cn('relative flex items-center', error && '[&_input]:border-loss/60')}>
      {before ? <span className="pointer-events-none absolute left-3 text-fg-subtle">{before}</span> : null}
      {children}
      {after ? <span className="pointer-events-none absolute right-3 text-xs text-fg-subtle">{after}</span> : null}
    </div>
  );
}

function FieldControl({ f, value, onChange, error, changed }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void; error?: string; changed?: boolean }) {
  const border = error ? 'border-loss/60' : 'border-line hover:border-line-strong';
  switch (f.type) {
    case 'toggle':
      return (
        <div className="flex min-h-[64px] items-start justify-between gap-3 rounded-lg border border-line bg-surface-2/50 px-3 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-fg">
              {f.label}
              {changed ? <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-label="Modified" /> : null}
            </div>
            {f.hint ? <div className="mt-0.5 text-xs text-fg-subtle">{f.hint}</div> : null}
          </div>
          <Switch checked={!!value} onCheckedChange={onChange} label={f.label} />
        </div>
      );
    case 'int':
    case 'credits':
    case 'percent':
    case 'bps':
    case 'x100': {
      const after = f.type === 'percent' || f.type === 'bps' ? '%' : f.type === 'x100' ? '×' : f.type === 'int' ? f.suffix : undefined;
      return (
        <FieldShell f={f} error={error} changed={changed}>
          <Affix before={f.type === 'credits' ? <CreditIcon size={14} /> : undefined} after={after}>
            <input
              inputMode="decimal"
              value={value as string}
              onChange={(e) => onChange(e.target.value)}
              className={cn(inputCls, border, f.type === 'credits' && 'pl-9', after && 'pr-12')}
              aria-label={f.label}
              aria-invalid={!!error || undefined}
            />
          </Affix>
        </FieldShell>
      );
    }
    case 'select':
      return (
        <FieldShell f={f} error={error} changed={changed}>
          <div className="grid gap-1 rounded-lg border border-line bg-bg-raised p-1" style={{ gridTemplateColumns: `repeat(${f.options.length}, minmax(0,1fr))` }}>
            {f.options.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={value === o.value}
                onClick={() => onChange(o.value)}
                className={cn('h-8 rounded-md text-[13px] font-medium transition-colors', value === o.value ? 'bg-surface-3 text-fg shadow-1' : 'text-fg-muted hover:text-fg')}
              >
                {o.label}
              </button>
            ))}
          </div>
        </FieldShell>
      );
    case 'text':
      return (
        <FieldShell f={f} error={error} changed={changed} wide>
          <div className="relative">
            <textarea
              value={value as string}
              onChange={(e) => onChange(e.target.value.slice(0, f.maxLength))}
              rows={2}
              placeholder={f.placeholder}
              className={cn(inputCls, border, 'h-auto resize-none py-2.5 pr-14 font-sans')}
              aria-label={f.label}
            />
            <span className="tabular pointer-events-none absolute bottom-2 right-3 text-[11px] text-fg-faint">
              {(value as string).length}/{f.maxLength}
            </span>
          </div>
        </FieldShell>
      );
    case 'betLevels':
      return <BetLevelsEditor f={f} value={value as number[]} onChange={onChange} error={error} changed={changed} />;
    case 'machines': {
      const m = value as Record<string, { enabled: boolean }>;
      return (
        <FieldShell f={f} error={error} changed={changed} wide>
          <div className="grid gap-2 sm:grid-cols-3">
            {f.machines.map((mc) => {
              const on = m[mc.id]?.enabled !== false;
              return (
                <div key={mc.id} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-2/50 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-fg">{mc.name}</div>
                    <div className={cn('text-[11px]', on ? 'text-win' : 'text-fg-subtle')}>{on ? 'Live' : 'Hidden from play'}</div>
                  </div>
                  <Switch checked={on} onCheckedChange={(v) => onChange({ ...m, [mc.id]: { enabled: v } })} label={`${mc.name} enabled`} />
                </div>
              );
            })}
          </div>
        </FieldShell>
      );
    }
  }
}

function BetLevelsEditor({ f, value, onChange, error, changed }: { f: FieldDef; value: number[]; onChange: (v: unknown) => void; error?: string; changed?: boolean }) {
  const [input, setInput] = useState('');
  const add = () => {
    const n = Number(input.replace(/[^\d]/g, ''));
    if (!Number.isInteger(n) || n <= 0) return;
    if (value.includes(n)) {
      toast.info('Already in the list');
      return;
    }
    if (value.length >= 20) {
      toast.info('Up to 20 bet levels');
      return;
    }
    onChange([...value, n].sort((a, b) => a - b));
    setInput('');
  };
  return (
    <FieldShell f={f} error={error} changed={changed} wide>
      <div className="rounded-lg border border-line bg-bg-raised p-2">
        <div className="flex flex-wrap gap-1.5">
          {value.map((v) => (
            <span key={v} className="tabular inline-flex h-7 items-center gap-1 rounded-md border border-line-strong/60 bg-surface-3 pl-2 pr-1 text-xs font-medium text-fg">
              <CreditIcon size={11} />
              {formatCredits(v, { compact: true })}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(value.filter((x) => x !== v))} className="ml-0.5 rounded p-0.5 text-fg-subtle hover:bg-surface-4 hover:text-fg">
                <X size={12} />
              </button>
            </span>
          ))}
          <span className="inline-flex h-7 items-center gap-1">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add();
                }
              }}
              inputMode="numeric"
              placeholder="Add level…"
              aria-label="Add bet level"
              className="tabular h-7 w-28 rounded-md border border-dashed border-line-strong bg-transparent px-2 text-xs text-fg outline-none placeholder:text-fg-faint focus:border-accent/70"
            />
            <button type="button" onClick={add} aria-label="Add bet level" className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-3 hover:text-fg">
              <Plus size={14} />
            </button>
          </span>
        </div>
      </div>
    </FieldShell>
  );
}

export function SettingsSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-[320px] rounded-xl" />
      ))}
    </div>
  );
}

export function SettingsError({ onRetry }: { onRetry: () => void }) {
  return (
    <Panel>
      <ErrorState onRetry={onRetry} />
    </Panel>
  );
}
