'use client';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronRight, ScrollText, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { listAuditLog, auditFacets } from '@/server/services/admin/audit';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { LoadMore, PageHeader, Panel, Pill, RolePill, Select, TableSkeleton, Time, UserLink, actionLabel } from './ui';

type Page = Awaited<ReturnType<typeof listAuditLog>> & { facets: Awaited<ReturnType<typeof auditFacets>> | null };
type Entry = Page['items'][number];

function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

const ACTION_TONE: Record<string, 'loss' | 'warn' | 'win' | 'accent' | 'info' | 'gold' | 'neutral'> = {
  USER_BAN: 'loss',
  USER_SUSPEND: 'warn',
  USER_UNBAN: 'win',
  USER_UNSUSPEND: 'win',
  USER_CREDIT_ADJUST: 'accent',
  USER_ROLE_CHANGE: 'gold',
  SETTINGS_UPDATE: 'info',
  RP_REINSTATEMENT: 'gold',
};

export function AuditLog() {
  const params = useSearchParams();
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [admin, setAdmin] = useState('');
  const [targetId, setTargetId] = useState(params.get('targetId') ?? '');
  const [open, setOpen] = useState<string | null>(null);
  const dAdmin = useDebounced(admin.trim());
  const dTarget = useDebounced(targetId.trim());
  const [facets, setFacets] = useState<Page['facets']>(null);

  const q = useInfiniteQuery({
    queryKey: ['admin', 'audit', action, targetType, dAdmin, dTarget],
    queryFn: ({ pageParam }) => {
      const sp = new URLSearchParams({ take: '30' });
      if (action) sp.set('action', action);
      if (targetType) sp.set('targetType', targetType);
      if (dAdmin) sp.set('admin', dAdmin);
      if (dTarget) sp.set('targetId', dTarget);
      if (pageParam) sp.set('cursor', pageParam);
      return api.get<Page>(`/api/admin/audit?${sp}`);
    },
    initialPageParam: '' as string,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const firstFacets = q.data?.pages[0]?.facets;
  useEffect(() => {
    if (firstFacets && !facets) setFacets(firstFacets);
  }, [firstFacets, facets]);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const filtered = !!(action || targetType || dAdmin || dTarget);

  return (
    <div>
      <PageHeader eyebrow="Admin" title="Audit log" description="Every staff mutation with its reason, IP and the exact before/after values. Entries are append-only." />
      <Panel flush>
        <div className="grid gap-2 border-b border-line-soft p-3 @xl:grid-cols-2 @4xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <Select
            label="Action"
            value={action}
            onChange={setAction}
            options={[{ value: '', label: 'All actions' }, ...(facets?.actions ?? []).map((a) => ({ value: a.value, label: `${actionLabel(a.value)} (${a.count})` }))]}
          />
          <Select
            label="Target type"
            value={targetType}
            onChange={setTargetType}
            options={[{ value: '', label: 'All targets' }, ...(facets?.targetTypes ?? []).map((a) => ({ value: a.value, label: `${a.value.toLowerCase().replace(/_/g, ' ')} (${a.count})` }))]}
          />
          <Input leading={<Search size={14} />} placeholder="Admin username…" value={admin} onChange={(e) => setAdmin(e.target.value)} className="h-9" aria-label="Filter by admin" />
          <Input placeholder="Target ID…" value={targetId} onChange={(e) => setTargetId(e.target.value)} className="h-9 font-mono" aria-label="Filter by target ID" />
          {filtered ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              leftIcon={<X size={13} />}
              onClick={() => {
                setAction('');
                setTargetType('');
                setAdmin('');
                setTargetId('');
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
        {q.isError ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : !q.data ? (
          <TableSkeleton rows={8} cols={5} />
        ) : items.length === 0 ? (
          <EmptyState icon={<ScrollText size={18} />} title={filtered ? 'No entries match these filters' : 'No admin actions yet'} />
        ) : (
          <>
            <ul className="divide-y divide-line-soft">
              {items.map((e) => (
                <AuditRow key={e.id} e={e} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} />
              ))}
            </ul>
            <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} />
          </>
        )}
      </Panel>
    </div>
  );
}

function AuditRow({ e, open, onToggle }: { e: Entry; open: boolean; onToggle: () => void }) {
  return (
    <li className={cn(open && 'bg-surface-2/40')}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2/50">
        <ChevronRight size={14} className={cn('shrink-0 text-fg-subtle transition-transform duration-150', open && 'rotate-90')} />
        <div className="grid min-w-0 flex-1 items-center gap-x-4 gap-y-1 @3xl:grid-cols-[160px_minmax(0,1fr)_180px_110px]">
          <div>
            <Pill tone={ACTION_TONE[e.action] ?? 'neutral'}>{actionLabel(e.action)}</Pill>
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px]">
              <span className="text-fg-subtle">{e.targetType.toLowerCase().replace(/_/g, ' ')}</span>{' '}
              <span className="font-medium text-fg">{e.targetType === 'USER' && e.targetLabel ? `@${e.targetLabel}` : (e.targetLabel ?? '—')}</span>
            </div>
            {e.reason ? <div className="truncate text-xs text-fg-muted">“{e.reason}”</div> : null}
          </div>
          <div className="flex min-w-0 items-center gap-2 text-xs text-fg-muted">
            <Avatar avatarUrl={e.admin.avatarUrl} name={e.admin.username} size={18} />
            <span className="truncate">@{e.admin.username}</span>
          </div>
          <div className="text-xs text-fg-subtle @3xl:text-right">
            <Time at={e.createdAt} />
          </div>
        </div>
      </button>
      {open ? (
        <div className="space-y-3 px-4 pb-4 pl-11">
          <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-fg-subtle">
            <span>
              Admin: <span className="text-fg-muted">@{e.admin.username}</span> <RolePill role={e.admin.role} />
            </span>
            <span>
              Target:{' '}
              {e.targetType === 'USER' && e.targetId ? <UserLink id={e.targetId} username={e.targetLabel ?? e.targetId} /> : <span className="font-mono text-fg-muted">{e.targetId ?? '—'}</span>}
            </span>
            <span>
              IP: <span className="font-mono text-fg-muted">{e.ip ?? 'unknown'}</span>
            </span>
            <span>
              Entry: <span className="font-mono text-fg-muted">{e.id}</span>
            </span>
          </div>
          {e.reason ? (
            <div className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-[13px] text-fg">
              <span className="mr-1.5 text-2xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">Reason</span>
              {e.reason}
            </div>
          ) : null}
          <JsonDiff before={e.before} after={e.after} />
        </div>
      ) : null}
    </li>
  );
}

/* ── Before/after diff ──────────────────────────────────── */

function flatten(v: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    const entries = Object.entries(v as Record<string, unknown>);
    if (!entries.length && prefix) out[prefix] = {};
    for (const [k, val] of entries) flatten(val, prefix ? `${prefix}.${k}` : k, out);
  } else if (prefix) {
    out[prefix] = v;
  } else if (v !== undefined) {
    out['(value)'] = v;
  }
  return out;
}

const fmt = (v: unknown) => (v === undefined ? '' : typeof v === 'string' ? JSON.stringify(v) : JSON.stringify(v));

export function JsonDiff({ before, after }: { before: unknown; after: unknown }) {
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => {
    const a = flatten(before ?? undefined);
    const b = flatten(after ?? undefined);
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    return keys.map((k) => ({
      k,
      a: a[k],
      b: b[k],
      kind: !(k in a) ? 'added' : !(k in b) ? 'removed' : JSON.stringify(a[k]) === JSON.stringify(b[k]) ? 'same' : 'changed',
    }));
  }, [before, after]);
  const changed = rows.filter((r) => r.kind !== 'same');
  const visible = showAll ? rows : changed;
  if (!rows.length) return <div className="text-xs text-fg-subtle">No before/after data recorded.</div>;
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="flex items-center justify-between border-b border-line bg-surface-1 px-3 py-2 text-xs">
        <span className="font-medium text-fg-muted">
          {changed.length} field{changed.length === 1 ? '' : 's'} changed
        </span>
        {rows.length > changed.length ? (
          <button type="button" onClick={() => setShowAll((s) => !s)} className="font-medium text-fg-subtle hover:text-fg">
            {showAll ? 'Hide unchanged' : `Show all ${rows.length}`}
          </button>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] font-mono text-[12px]">
          <thead>
            <tr className="text-left text-2xs uppercase tracking-[0.08em] text-fg-subtle">
              <th className="w-[30%] px-3 py-1.5 font-semibold">Field</th>
              <th className="w-[35%] px-3 py-1.5 font-semibold">Before</th>
              <th className="w-[35%] px-3 py-1.5 font-semibold">After</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <Fragment key={r.k}>
                <tr className="border-t border-line-soft align-top">
                  <td className="break-all px-3 py-1.5 text-fg-muted">{r.k}</td>
                  <td className={cn('break-all px-3 py-1.5', r.kind === 'same' ? 'text-fg-subtle' : r.kind === 'added' ? 'text-fg-faint' : 'bg-loss-soft text-loss')}>
                    {r.kind === 'added' ? '—' : fmt(r.a)}
                  </td>
                  <td className={cn('break-all px-3 py-1.5', r.kind === 'same' ? 'text-fg-subtle' : r.kind === 'removed' ? 'text-fg-faint' : 'bg-win-soft text-win')}>
                    {r.kind === 'removed' ? '—' : fmt(r.b)}
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
