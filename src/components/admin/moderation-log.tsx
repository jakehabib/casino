'use client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Gavel } from 'lucide-react';
import { api } from '@/lib/api';
import type { listModerationLog } from '@/server/services/admin/audit';
import { Avatar } from '@/components/ui/avatar';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { useMe } from '@/hooks/use-me';
import { LoadMore, Panel, Pill, TableSkeleton, Time, UserLink } from './ui';

type Page = Awaited<ReturnType<typeof listModerationLog>>;

const MOD_ACTION: Record<string, { label: string; tone: 'loss' | 'warn' | 'win' | 'neutral' | 'info' }> = {
  DELETE_MESSAGE: { label: 'Message deleted', tone: 'neutral' },
  WARN: { label: 'Warning', tone: 'warn' },
  MUTE: { label: 'Muted', tone: 'warn' },
  UNMUTE: { label: 'Unmuted', tone: 'win' },
  CHAT_BAN: { label: 'Chat ban', tone: 'loss' },
  CHAT_UNBAN: { label: 'Chat unban', tone: 'win' },
  SUSPEND: { label: 'Suspended', tone: 'loss' },
  RESOLVE_REPORT: { label: 'Report resolved', tone: 'info' },
  DISMISS_REPORT: { label: 'Report dismissed', tone: 'neutral' },
};

function duration(sec: number) {
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}

export function ModerationLogPanel() {
  const me = useMe();
  const isAdmin = me.data?.user.role === 'ADMIN' || me.data?.user.role === 'SUPER_ADMIN';
  const q = useInfiniteQuery({
    queryKey: ['admin', 'moderation-log'],
    queryFn: ({ pageParam }) => api.get<Page>(`/api/admin/moderation?take=25${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: '' as string,
    getNextPageParam: (l) => l.nextCursor ?? undefined,
    refetchInterval: 30_000,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Panel title="Recent moderation actions" description="Chat moderation log across all moderators" flush>
      {q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <TableSkeleton rows={6} cols={4} />
      ) : items.length === 0 ? (
        <EmptyState icon={<Gavel size={18} />} title="No moderation actions yet" body="Mutes, warnings, deletions and bans from chat appear here." />
      ) : (
        <>
          <ul className="divide-y divide-line-soft">
            {items.map((m) => {
              const a = MOD_ACTION[m.action] ?? { label: m.action, tone: 'neutral' as const };
              return (
                <li key={m.id} className="flex items-start gap-3 px-4 py-3">
                  <Avatar avatarUrl={m.moderator.avatarUrl} name={m.moderator.username} size={28} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                      <span className="font-medium text-fg">@{m.moderator.username}</span>
                      <Pill tone={a.tone}>{a.label}</Pill>
                      {m.target ? (
                        isAdmin ? (
                          <UserLink id={m.target.id} username={m.target.username} className="text-[13px]" />
                        ) : (
                          <span className="font-medium text-fg">@{m.target.username}</span>
                        )
                      ) : null}
                      {m.durationSec ? <span className="text-xs text-fg-subtle">for {duration(m.durationSec)}</span> : null}
                    </div>
                    {m.reason ? <p className="mt-0.5 truncate text-xs text-fg-muted">{m.reason}</p> : null}
                  </div>
                  <span className="shrink-0 text-xs text-fg-subtle">
                    <Time at={m.createdAt} relative />
                  </span>
                </li>
              );
            })}
          </ul>
          <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} />
        </>
      )}
    </Panel>
  );
}
