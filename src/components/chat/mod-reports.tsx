'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Flag, Gavel, Inbox, Timer, Trash2, X } from 'lucide-react';
import { Tabs } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { ProfileBadge } from '@/components/ui/profile-badge';
import { toast } from '@/components/ui/toast';
import { PlayerCardPopover } from '@/components/profile/player-card';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { timeAgo, formatDuration } from '@/lib/format';
import { REPORT_REASONS, type ChatMessageDTO } from '@/server/services/chat/types';
import { ModerationDialog, notifyError, useChatActions, type ModDialogSpec } from './moderation';

type Status = 'OPEN' | 'RESOLVED' | 'DISMISSED';

interface ReportItem {
  messageId: string;
  message: ChatMessageDTO;
  deletedAt: string | null;
  author: ChatMessageDTO['user'] & { mutedUntil: string | null; chatBanned: boolean; priorActions: number };
  reports: { id: string; reason: string; createdAt: string; reporter: { id: string; username: string; displayName: string } }[];
  firstReportedAt: string;
  lastReportedAt: string;
}

const REASON_LABEL = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label.split(' ')[0]]));

function reasonSummary(reports: ReportItem['reports']) {
  const counts = new Map<string, number>();
  const notes: string[] = [];
  for (const r of reports) {
    const [code, ...rest] = r.reason.split(': ');
    counts.set(code, (counts.get(code) ?? 0) + 1);
    if (rest.length) notes.push(rest.join(': '));
  }
  return { counts: [...counts.entries()].sort((a, b) => b[1] - a[1]), notes };
}

function ReportCard({ item, status, onDialog }: { item: ReportItem; status: Status; onDialog: (s: ModDialogSpec) => void }) {
  const qc = useQueryClient();
  const actions = useChatActions();
  const target = { id: item.author.id, username: item.author.username, displayName: item.author.displayName };
  const resolve = useMutation({
    mutationFn: (s: 'RESOLVED' | 'DISMISSED') => api.post('/api/chat/moderation/reports', { messageId: item.messageId, status: s }),
    onSuccess: (_d, s) => {
      toast.success(s === 'RESOLVED' ? 'Marked as resolved' : 'Reports dismissed');
      void qc.invalidateQueries({ queryKey: ['mod-reports'] });
    },
    onError: notifyError,
  });
  const { counts, notes } = reasonSummary(item.reports);
  const staffTarget = item.author.role !== 'USER';

  return (
    <article className="rounded-xl border border-line bg-surface-1 p-4" data-testid="report-item">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PlayerCardPopover username={item.author.username}>
          <button type="button" className="min-w-0 rounded-lg text-left">
            <ProfileBadge user={item.author} size="md" subtitle={`@${item.author.username}${item.author.priorActions ? ` · ${item.author.priorActions} prior action${item.author.priorActions === 1 ? '' : 's'}` : ''}`} />
          </button>
        </PlayerCardPopover>
        <div className="flex flex-wrap items-center gap-1.5">
          {item.author.chatBanned ? <Tag tone="loss">Chat banned</Tag> : null}
          {item.author.mutedUntil ? <Tag tone="warn">Muted · {formatDuration(new Date(item.author.mutedUntil).getTime() - Date.now())}</Tag> : null}
          {item.deletedAt ? <Tag>Message removed</Tag> : null}
          <span className="inline-flex h-6 items-center gap-1 rounded-md bg-loss-soft px-2 text-[11px] font-semibold text-loss">
            <Flag size={11} /> {item.reports.length}
          </span>
        </div>
      </div>

      <blockquote className={cn('mt-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[13.5px] leading-relaxed text-fg [overflow-wrap:anywhere]', item.deletedAt && 'text-fg-subtle line-through decoration-fg-faint')}>
        {item.message.content}
      </blockquote>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        {counts.map(([code, c]) => (
          <span key={code} className="inline-flex h-6 items-center rounded-md border border-line bg-surface-2 px-2 font-medium text-fg-muted">
            {REASON_LABEL[code] ?? code}
            {c > 1 ? <span className="ml-1 text-fg-subtle">×{c}</span> : null}
          </span>
        ))}
        <span className="ml-auto text-fg-subtle">
          Reported by {item.reports.slice(0, 3).map((r) => r.reporter.displayName).join(', ')}
          {item.reports.length > 3 ? ` +${item.reports.length - 3}` : ''} · {timeAgo(item.lastReportedAt)}
        </span>
      </div>
      {notes.length ? (
        <ul className="mt-2 space-y-1 text-xs text-fg-muted">
          {notes.slice(0, 3).map((n, i) => (
            <li key={i} className="truncate">“{n}”</li>
          ))}
        </ul>
      ) : null}

      {status === 'OPEN' ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
          {!item.deletedAt ? (
            <Button size="xs" variant="subtle" className="text-loss" leftIcon={<Trash2 size={13} />} onClick={() => void actions.deleteMessage(item.messageId).then(() => qc.invalidateQueries({ queryKey: ['mod-reports'] }))}>
              Delete message
            </Button>
          ) : null}
          {!staffTarget && !item.author.mutedUntil ? (
            <Button size="xs" variant="subtle" leftIcon={<Timer size={13} />} onClick={() => void actions.muteFor(target, 3600)}>
              Mute 1h
            </Button>
          ) : null}
          {!staffTarget && !item.author.chatBanned ? (
            <Button size="xs" variant="subtle" leftIcon={<Gavel size={13} />} onClick={() => onDialog({ kind: 'ban', target })}>
              Ban…
            </Button>
          ) : null}
          <span className="flex-1" />
          <Button size="xs" variant="ghost" leftIcon={<X size={13} />} loading={resolve.isPending && resolve.variables === 'DISMISSED'} onClick={() => resolve.mutate('DISMISSED')}>
            Dismiss
          </Button>
          <Button size="xs" variant="secondary" leftIcon={<Check size={13} />} loading={resolve.isPending && resolve.variables === 'RESOLVED'} onClick={() => resolve.mutate('RESOLVED')}>
            Resolve
          </Button>
        </div>
      ) : null}
    </article>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: 'loss' | 'warn' }) {
  return (
    <span className={cn('inline-flex h-6 items-center rounded-md border px-2 text-[11px] font-semibold', tone === 'loss' ? 'border-loss/30 bg-loss-soft text-loss' : tone === 'warn' ? 'border-warn/30 bg-warn/10 text-warn' : 'border-line bg-surface-3 text-fg-muted')}>
      {children}
    </span>
  );
}

/**
 * Moderator reports queue (MODERATOR+). Self-contained: embed anywhere, e.g.
 * the admin console. One card per reported message with grouped reports.
 */
export function ModReports({ className }: { className?: string }) {
  const [status, setStatus] = useState<Status>('OPEN');
  const [dialog, setDialog] = useState<ModDialogSpec | null>(null);
  const q = useQuery({
    queryKey: ['mod-reports', status],
    queryFn: () => api.get<{ items: ReportItem[]; counts: Partial<Record<Status, number>> }>(`/api/chat/moderation/reports?status=${status}`),
    refetchInterval: status === 'OPEN' ? 20_000 : false,
  });
  return (
    <div className={cn('space-y-4', className)} data-testid="mod-reports">
      <Tabs
        value={status}
        onValueChange={(v) => setStatus(v as Status)}
        items={[
          { value: 'OPEN', label: 'Open', count: q.data?.counts.OPEN ?? 0 },
          { value: 'RESOLVED', label: 'Resolved' },
          { value: 'DISMISSED', label: 'Dismissed' },
        ]}
      />
      {q.isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-[180px] rounded-xl" />
          ))}
        </div>
      ) : q.error ? (
        <ErrorState title="Couldn’t load reports" onRetry={() => void q.refetch()} />
      ) : !q.data?.items.length ? (
        <EmptyState icon={<Inbox size={18} />} title={status === 'OPEN' ? 'No open reports' : 'Nothing here yet'} body={status === 'OPEN' ? 'Chat is calm. New reports appear here automatically.' : undefined} className="rounded-xl border border-line bg-surface-1" />
      ) : (
        <div className="space-y-3">
          {q.data.items.map((it) => (
            <ReportCard key={it.messageId} item={it} status={status} onDialog={setDialog} />
          ))}
        </div>
      )}
      <ModerationDialog spec={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
