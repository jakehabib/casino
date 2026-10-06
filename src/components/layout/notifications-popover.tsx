'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { Popover } from '@/components/ui/popover';
import { IconButton } from '@/components/ui/button';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/cn';

interface NotificationList {
  unread: number;
  items: { id: string; type: string; title: string; body: string; link: string | null; read: boolean; createdAt: string }[];
}

export function NotificationsPopover({ unread }: { unread: number }) {
  const qc = useQueryClient();
  const { data, refetch } = useQuery({ queryKey: ['notifications'], queryFn: () => api.get<NotificationList>('/api/notifications'), enabled: false });
  const markRead = useMutation({
    mutationFn: () => api.post('/api/notifications/read'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
  return (
    <Popover
      align="end"
      className="w-[min(360px,calc(100vw-24px))] p-0"
      onOpenChange={(o) => {
        if (o) {
          void refetch().then(() => unread > 0 && markRead.mutate());
        }
      }}
      trigger={
        <IconButton label="Notifications" tone="filled" badge={unread}>
          <Bell size={17} />
        </IconButton>
      }
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-sm font-semibold">Notifications</span>
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {!data ? (
          <div className="space-y-2 p-3">
            <div className="skeleton h-14 rounded-lg" />
            <div className="skeleton h-14 rounded-lg" />
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={<Bell size={18} />} title="You’re all caught up" body="Rewards, level-ups and account notices appear here." />
        ) : (
          data.items.map((n) => {
            const inner = (
              <div className={cn('flex gap-3 border-b border-line-soft px-4 py-3 transition-colors last:border-0 hover:bg-surface-2')}>
                <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', n.read ? 'bg-transparent' : n.type === 'LEVEL_UP' || n.type === 'REWARD' ? 'bg-gold' : 'bg-accent')} />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-fg">{n.title}</div>
                  <div className="mt-0.5 text-xs leading-snug text-fg-muted">{n.body}</div>
                  <div className="mt-1 text-[11px] text-fg-faint">{timeAgo(n.createdAt)}</div>
                </div>
              </div>
            );
            return n.link ? (
              <Link key={n.id} href={n.link} className="block">
                {inner}
              </Link>
            ) : (
              <div key={n.id}>{inner}</div>
            );
          })
        )}
      </div>
    </Popover>
  );
}
