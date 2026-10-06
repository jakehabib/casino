'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HeartHandshake, Clock, ShieldOff, Hourglass, Inbox, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime, formatDuration } from '@/lib/format';
import type { getResponsiblePlayOverview } from '@/server/services/admin/responsible-play';
import { StatCard } from '@/components/ui/stat-card';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/hooks/use-me';
import { ExclusionStatus, ReinstateDialog, type AdminExclusion } from './rp-panel';
import { PageHeader, Panel, Pill, RestrictedNote, Table, Td, Th, Time, UserLink } from './ui';

type Overview = Awaited<ReturnType<typeof getResponsiblePlayOverview>>;
type Row = Overview['active'][number];

export function ResponsiblePlayOverview() {
  const q = useQuery({ queryKey: ['admin', 'rp'], queryFn: () => api.get<Overview>('/api/admin/responsible-play') });
  const me = useMe();
  const isSuper = me.data?.user.role === 'SUPER_ADMIN';
  const [target, setTarget] = useState<Row | null>(null);
  const d = q.data;

  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Responsible Play"
        description="Player-set breaks, locks and self-exclusions. Staff can view these but never end or shorten them."
      />
      <RestrictedNote className="mb-4">
        <span className="font-semibold text-fg">Protected by design.</span> Cooldowns and time-limited self-exclusions cannot be overridden by anyone. An indefinite self-exclusion can be lifted only by a Super Admin, only after the player requests a review, and only once the {d ? `${Math.round(d.waitMs / 86_400_000)}-day` : '7-day'} waiting period has passed.
      </RestrictedNote>
      {q.isError ? (
        <Panel>
          <ErrorState onRetry={() => q.refetch()} />
        </Panel>
      ) : !d ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[92px] rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
            <StatCard label="Active breaks" icon={<Clock size={14} />} value={d.counts.cooldowns} sub="24h, 72h and 1-week locks" />
            <StatCard label="Self-exclusions" icon={<ShieldOff size={14} />} value={d.counts.exclusions} sub="1 month to indefinite" />
            <StatCard label="Review requests" icon={<Inbox size={14} className={d.counts.reinstatementRequests ? 'text-info' : undefined} />} value={d.counts.reinstatementRequests} sub="Indefinite exclusions" />
            <StatCard label="Pending limit increases" icon={<Hourglass size={14} />} value={d.counts.pendingLimitChanges} sub="Waiting out the delay" />
          </div>

          <Panel title="Reinstatement requests" description={isSuper ? 'Process only after completing a review with the player.' : 'Only a Super Admin can process these.'} flush>
            {d.requests.length === 0 ? (
              <EmptyState icon={<Inbox size={18} />} title="No open requests" body="Players with an indefinite self-exclusion can request a review from their Responsible Play page." />
            ) : (
              <ul className="divide-y divide-line-soft">
                {d.requests.map((r) => {
                  const eligibleAt = r.reinstatementEligibleAt ? new Date(r.reinstatementEligibleAt) : null;
                  const waiting = eligibleAt && eligibleAt > new Date();
                  return (
                    <li key={r.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar avatarUrl={r.user.avatarUrl} name={r.user.username} size={32} />
                        <div className="min-w-0 text-[13px]">
                          <UserLink id={r.user.id} username={r.user.username} />
                          <div className="truncate text-xs text-fg-subtle">
                            Excluded {formatDateTime(r.startsAt)} · requested {r.reinstatementRequestedAt ? formatDateTime(r.reinstatementRequestedAt) : '—'}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {waiting && eligibleAt ? (
                          <Pill tone="info">
                            <Hourglass size={11} /> {formatDuration(eligibleAt.getTime() - Date.now())} left
                          </Pill>
                        ) : (
                          <Pill tone="win">Eligible for review</Pill>
                        )}
                        {isSuper ? (
                          <Button size="xs" variant="secondary" leftIcon={<ShieldCheck size={12} />} disabled={!r.reinstatable} onClick={() => setTarget(r)}>
                            Process
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Active restrictions" description={`${d.active.length} player${d.active.length === 1 ? '' : 's'} currently restricted`} flush>
            {d.active.length === 0 ? (
              <EmptyState icon={<HeartHandshake size={18} />} title="No active restrictions" />
            ) : (
              <Table minWidth={720}>
                <thead>
                  <tr>
                    <Th>Player</Th>
                    <Th>Restriction</Th>
                    <Th>Activated</Th>
                    <Th>Expires</Th>
                    <Th>Status</Th>
                    <Th>Override</Th>
                  </tr>
                </thead>
                <tbody>
                  {d.active.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-2/40">
                      <Td>
                        <span className="flex items-center gap-2">
                          <Avatar avatarUrl={r.user.avatarUrl} name={r.user.username} size={24} />
                          <UserLink id={r.user.id} username={r.user.username} />
                        </span>
                      </Td>
                      <Td className="text-fg">{r.label}</Td>
                      <Td>
                        <Time at={r.startsAt} />
                      </Td>
                      <Td>{r.endsAt ? <Time at={r.endsAt} /> : <span className="text-fg-subtle">Indefinite</span>}</Td>
                      <Td>
                        <ExclusionStatus e={r as AdminExclusion} />
                      </Td>
                      <Td className="text-xs text-fg-subtle">{r.overridable ? 'Super Admin, after request' : 'Restricted: cannot be overridden'}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Panel>

          {d.reinstated.length ? (
            <Panel title="Recently reinstated" flush>
              <ul className="divide-y divide-line-soft">
                {d.reinstated.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                    <UserLink id={r.user.id} username={r.user.username} />
                    <span className="text-xs text-fg-subtle">
                      <Time at={r.reinstatedAt} />
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      )}
      <ReinstateDialog exclusion={target as AdminExclusion | null} username={target?.user.username} onOpenChange={(o) => !o && setTarget(null)} invalidate={[['admin', 'rp']]} />
    </div>
  );
}
