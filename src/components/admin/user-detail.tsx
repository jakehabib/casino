'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Ban, Coins, Copy, PauseCircle, RotateCcw, UserCog, Receipt, Dices, Gavel, ScrollText, AlertTriangle } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatCredits, formatDateTime, formatMultiplier } from '@/lib/format';
import type { AdminUserDetail } from '@/server/services/admin/users';
import { Avatar } from '@/components/ui/avatar';
import { LevelBadge } from '@/components/ui/level-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { toast } from '@/components/ui/toast';
import { CreditIcon } from '@/components/ui/credit-icon';
import { ResponsiblePlayPanel } from './rp-panel';
import { CreditAdjustDialog, RoleDialog, StatusDialog } from './user-actions';
import { Credits, GAME_LABEL, KeyValue, LoadMore, Panel, Pill, RestrictedNote, RolePill, StatusPill, Table, TableSkeleton, Td, Th, Time, actionLabel } from './ui';

interface LedgerItem {
  id: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType: string;
  referenceId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
interface GameItem {
  id: string;
  game: string;
  gameVariant: string | null;
  referenceId: string;
  wager: number;
  payout: number;
  net: number;
  multiplier: number | null;
  resultSummary: string;
  createdAt: string;
}
type Page<T> = { items: T[]; nextCursor: string | null };

const TX_LABEL: Record<string, string> = {
  SIGNUP_GRANT: 'Signup grant',
  FREE_CREDIT_CLAIM: 'Reward',
  BET: 'Wager',
  WIN: 'Payout',
  REFUND: 'Refund',
  ADMIN_ADJUSTMENT: 'Adjustment',
};

export function AdminUserDetailView({ userId }: { userId: string }) {
  const q = useQuery({
    queryKey: ['admin', 'user', userId],
    queryFn: () => api.get<AdminUserDetail>(`/api/admin/users/${userId}`),
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  });
  const [dialog, setDialog] = useState<null | 'credits' | 'SUSPEND' | 'BAN' | 'REINSTATE' | 'role'>(null);
  const [tab, setTab] = useState('ledger');

  const back = (
    <Link href="/admin/users" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-fg-muted transition-colors hover:text-fg">
      <ArrowLeft size={14} /> All users
    </Link>
  );

  if (q.isError) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div>
        {back}
        <Panel>{notFound ? <EmptyState title="User not found" body="This account may have been deleted." /> : <ErrorState onRetry={() => q.refetch()} />}</Panel>
      </div>
    );
  }
  if (!q.data) {
    return (
      <div>
        {back}
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3.5 w-64" />
          </div>
        </div>
        <div className="mt-6 grid gap-4 @5xl:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  const d = q.data;
  const u = d.user;
  const p = d.permissions;
  const restricted = u.status !== 'ACTIVE' && !(u.status === 'SUSPENDED' && u.suspendedUntil && new Date(u.suspendedUntil) <= new Date());

  return (
    <div>
      {back}
      {/* Identity header */}
      <div className="flex flex-col gap-4 @3xl:flex-row @3xl:items-start @3xl:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar avatarUrl={u.avatarUrl} name={u.username} size={56} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight">{u.displayName}</h1>
              <LevelBadge level={u.level} size="sm" />
              <RolePill role={u.role} />
              <StatusPill status={u.status} until={u.suspendedUntil} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-fg-subtle">
              <span>@{u.username}</span>
              <span aria-hidden>·</span>
              <span className="truncate">{u.email}</span>
              <span aria-hidden>·</span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(u.id);
                  toast.info('User ID copied');
                }}
                className="inline-flex items-center gap-1 font-mono text-[11.5px] transition-colors hover:text-fg"
              >
                {u.id} <Copy size={11} />
              </button>
            </div>
          </div>
        </div>
        {p.canAct ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" leftIcon={<Coins size={14} />} onClick={() => setDialog('credits')}>
              Adjust credits
            </Button>
            {u.status === 'ACTIVE' || (u.status === 'SUSPENDED' && !restricted) ? (
              <Button size="sm" variant="secondary" leftIcon={<PauseCircle size={14} />} onClick={() => setDialog('SUSPEND')}>
                Suspend
              </Button>
            ) : null}
            {u.status !== 'ACTIVE' ? (
              <Button size="sm" variant="secondary" leftIcon={<RotateCcw size={14} />} onClick={() => setDialog('REINSTATE')}>
                {u.status === 'BANNED' ? 'Unban' : 'Lift suspension'}
              </Button>
            ) : null}
            {u.status !== 'BANNED' ? (
              <Button size="sm" variant="subtle" className="text-loss hover:text-loss" leftIcon={<Ban size={14} />} onClick={() => setDialog('BAN')}>
                Ban
              </Button>
            ) : null}
            {p.canChangeRole ? (
              <Button size="sm" variant="subtle" leftIcon={<UserCog size={14} />} onClick={() => setDialog('role')}>
                Role
              </Button>
            ) : null}
          </div>
        ) : (
          <RestrictedNote className="@3xl:max-w-xs">You can’t act on your own account or on staff with an equal or higher role.</RestrictedNote>
        )}
      </div>

      {u.status !== 'ACTIVE' && u.statusReason ? (
        <div className={cn('mt-4 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px]', u.status === 'BANNED' ? 'border-loss/25 bg-loss-soft' : 'border-warn/25 bg-warn/5')}>
          <AlertTriangle size={15} className={cn('mt-px shrink-0', u.status === 'BANNED' ? 'text-loss' : 'text-warn')} />
          <div className="text-fg-muted">
            <span className="font-medium text-fg">{u.status === 'BANNED' ? 'Banned' : 'Suspended'}:</span> {u.statusReason}
            {u.status === 'SUSPENDED' ? <> · {u.suspendedUntil ? `until ${formatDateTime(u.suspendedUntil)}` : 'until further notice'}</> : null}
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 @5xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 @2xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <Panel title="Account">
              <div className="mb-4 rounded-lg border border-line bg-surface-2 px-3.5 py-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">Balance</div>
                <div className="tabular mt-1 flex items-center gap-1.5 text-2xl font-semibold tracking-tight">
                  <CreditIcon size={20} /> {formatCredits(d.balance)}
                </div>
              </div>
              <KeyValue
                items={[
                  { label: 'Joined', value: formatDateTime(u.createdAt) },
                  { label: 'Last seen', value: <Time at={u.lastSeenAt} relative /> },
                  { label: 'Level', value: `${u.level} · ${u.tier}` },
                  { label: 'Lifetime XP', value: u.lifetimeXp.toLocaleString('en-US') },
                  { label: 'Active sessions', value: u.activeSessions },
                  { label: 'Profile', value: u.privacy.charAt(0) + u.privacy.slice(1).toLowerCase() },
                ]}
              />
            </Panel>
            <StatsPanel stats={d.stats} />
          </div>

          <Panel flush>
            <div className="border-b border-line-soft p-3">
              <Tabs
                size="sm"
                value={tab}
                onValueChange={setTab}
                items={[
                  { value: 'ledger', label: 'Ledger', icon: <Receipt size={13} /> },
                  { value: 'games', label: 'Game history', icon: <Dices size={13} /> },
                  { value: 'moderation', label: 'Moderation', icon: <Gavel size={13} />, count: d.moderation.length || undefined },
                  { value: 'audit', label: 'Admin actions', icon: <ScrollText size={13} />, count: d.audit.length || undefined },
                ]}
              />
            </div>
            {tab === 'ledger' ? <LedgerTable userId={userId} /> : null}
            {tab === 'games' ? <GamesTable userId={userId} /> : null}
            {tab === 'moderation' ? <ModerationList items={d.moderation} /> : null}
            {tab === 'audit' ? (
              <>
                <AuditList items={d.audit} />
                {d.audit.length ? (
                  <div className="border-t border-line-soft p-3 text-center">
                    <Link href={`/admin/audit?targetId=${userId}`} className="text-xs font-medium text-fg-muted hover:text-fg">
                      Open in audit log →
                    </Link>
                  </div>
                ) : null}
              </>
            ) : null}
          </Panel>
        </div>

        <div className="min-w-0">
          <ResponsiblePlayPanel rp={d.responsiblePlay} userId={userId} username={u.username} canReinstate={p.canReinstate} />
        </div>
      </div>

      <CreditAdjustDialog open={dialog === 'credits'} onOpenChange={(o) => setDialog(o ? 'credits' : null)} user={u} balance={d.balance} />
      {dialog === 'SUSPEND' || dialog === 'BAN' || dialog === 'REINSTATE' ? (
        <StatusDialog open onOpenChange={(o) => !o && setDialog(null)} user={u} action={dialog} />
      ) : null}
      {p.canChangeRole ? <RoleDialog open={dialog === 'role'} onOpenChange={(o) => setDialog(o ? 'role' : null)} user={u} /> : null}
    </div>
  );
}

function StatsPanel({ stats }: { stats: AdminUserDetail['stats'] }) {
  if (!stats) {
    return (
      <Panel title="Play stats">
        <EmptyState className="py-6" title="No rounds yet" />
      </Panel>
    );
  }
  const total = Object.values(stats.plays).reduce((a, b) => a + b, 0);
  return (
    <Panel title="Play stats" description={`${stats.gamesPlayed.toLocaleString('en-US')} rounds settled`}>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">Wagered</div>
          <Credits value={stats.totalWagered} className="mt-1" />
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">Won</div>
          <Credits value={stats.totalWon} className="mt-1" />
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">Net</div>
          <Credits value={stats.net} signed className="mt-1" />
        </div>
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">Largest win</div>
          <span className="mt-1 flex items-center gap-1.5">
            <Credits value={stats.largestWin} />
            {stats.largestWinGame ? <span className="text-xs text-fg-subtle">{GAME_LABEL[stats.largestWinGame] ?? stats.largestWinGame}</span> : null}
          </span>
        </div>
      </div>
      <div className="mt-4 space-y-2 border-t border-line-soft pt-3">
        {Object.entries(stats.plays).map(([g, c]) => (
          <div key={g} className="flex items-center gap-3 text-xs">
            <span className="w-[68px] shrink-0 text-fg-muted">{GAME_LABEL[g]}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-accent/80" style={{ width: total ? `${(c / total) * 100}%` : 0 }} />
            </div>
            <span className="tabular w-10 shrink-0 text-right text-fg-muted">{c.toLocaleString('en-US')}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function useCursorList<T>(key: unknown[], url: string) {
  return useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => api.get<Page<T>>(`${url}${url.includes('?') ? '&' : '?'}take=25${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

function LedgerTable({ userId }: { userId: string }) {
  const q = useCursorList<LedgerItem>(['admin', 'user', userId, 'ledger'], `/api/admin/users/${userId}/ledger`);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data) return <TableSkeleton rows={6} cols={5} />;
  if (!items.length) return <EmptyState title="No ledger entries" />;
  return (
    <>
      <Table minWidth={720}>
        <thead>
          <tr>
            <Th>When</Th>
            <Th>Type</Th>
            <Th>Reference</Th>
            <Th align="right">Amount</Th>
            <Th align="right">Balance after</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.id} className="hover:bg-surface-2/40">
              <Td>
                <Time at={t.createdAt} />
              </Td>
              <Td>
                <span className="flex items-center gap-1.5">
                  <span className="text-fg">{TX_LABEL[t.type] ?? t.type}</span>
                  {t.metadata && (t.metadata as { dev?: boolean }).dev ? <Pill tone="warn">dev</Pill> : null}
                </span>
              </Td>
              <Td className="max-w-[260px]">
                <div className="truncate text-xs" title={typeof t.metadata?.reason === 'string' ? t.metadata.reason : undefined}>
                  <span className="text-fg-subtle">{t.referenceType.toLowerCase().replace(/_/g, ' ')}</span>
                  {typeof t.metadata?.reason === 'string' ? <span className="ml-1.5 text-fg-muted">“{t.metadata.reason}”</span> : <span className="ml-1.5 font-mono text-[11px] text-fg-faint">{t.referenceId.slice(0, 10)}</span>}
                </div>
              </Td>
              <Td align="right">
                <Credits value={t.amount} signed icon={false} />
              </Td>
              <Td align="right" className="tabular text-fg">
                {formatCredits(t.balanceAfter)}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} />
    </>
  );
}

function GamesTable({ userId }: { userId: string }) {
  const q = useCursorList<GameItem>(['admin', 'user', userId, 'games'], `/api/admin/users/${userId}/games`);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data) return <TableSkeleton rows={6} cols={5} />;
  if (!items.length) return <EmptyState icon={<Dices size={18} />} title="No games played yet" />;
  return (
    <>
      <Table minWidth={720}>
        <thead>
          <tr>
            <Th>When</Th>
            <Th>Game</Th>
            <Th>Result</Th>
            <Th align="right">Wager</Th>
            <Th align="right">Payout</Th>
            <Th align="right">Net</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((g) => (
            <tr key={g.id} className="hover:bg-surface-2/40">
              <Td>
                <Time at={g.createdAt} />
              </Td>
              <Td className="text-fg">
                {GAME_LABEL[g.game] ?? g.game}
                {g.gameVariant ? <span className="ml-1.5 text-xs text-fg-subtle">{g.gameVariant}</span> : null}
              </Td>
              <Td className="max-w-[240px]">
                <span className="block truncate text-xs">
                  {g.resultSummary}
                  {g.multiplier ? <span className="ml-1.5 text-fg-subtle">{formatMultiplier(g.multiplier)}</span> : null}
                </span>
              </Td>
              <Td align="right" className="tabular">
                {formatCredits(g.wager)}
              </Td>
              <Td align="right" className="tabular">
                {formatCredits(g.payout)}
              </Td>
              <Td align="right">
                <Credits value={g.net} signed icon={false} />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} />
    </>
  );
}

function ModerationList({ items }: { items: AdminUserDetail['moderation'] }) {
  if (!items.length) return <EmptyState icon={<Gavel size={18} />} title="No moderation history" />;
  return (
    <ul className="divide-y divide-line-soft">
      {items.map((m) => (
        <li key={m.id} className="flex items-start justify-between gap-3 px-4 py-3 text-[13px]">
          <div className="min-w-0">
            <div className="font-medium text-fg">{actionLabel(m.action)}</div>
            <div className="truncate text-xs text-fg-subtle">
              by @{m.moderator}
              {m.reason ? ` · ${m.reason}` : ''}
              {m.durationSec ? ` · ${Math.round(m.durationSec / 60)} min` : ''}
            </div>
          </div>
          <span className="shrink-0 text-xs text-fg-subtle">
            <Time at={m.createdAt} />
          </span>
        </li>
      ))}
    </ul>
  );
}

function AuditList({ items }: { items: AdminUserDetail['audit'] }) {
  if (!items.length) return <EmptyState icon={<ScrollText size={18} />} title="No admin actions on this account" />;
  return (
    <ul className="divide-y divide-line-soft">
      {items.map((a) => (
        <li key={a.id} className="flex items-start justify-between gap-3 px-4 py-3 text-[13px]">
          <div className="min-w-0">
            <div className="font-medium text-fg">{actionLabel(a.action)}</div>
            <div className="truncate text-xs text-fg-subtle">
              by @{a.admin}
              {a.reason ? ` · “${a.reason}”` : ''}
            </div>
          </div>
          <span className="shrink-0 text-xs text-fg-subtle">
            <Time at={a.createdAt} />
          </span>
        </li>
      ))}
    </ul>
  );
}
