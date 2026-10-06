'use client';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Ban, Gavel, Lock, MessageSquareWarning, MoreHorizontal, ShieldAlert, Trophy, UserRound, VolumeX, Volume2, EyeOff } from 'lucide-react';
import { Popover } from '@/components/ui/popover';
import { Avatar } from '@/components/ui/avatar';
import { LevelBadge, RoleBadge } from '@/components/ui/level-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from '@/components/ui/dropdown';
import { useMe } from '@/hooks/use-me';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatCredits, formatDuration } from '@/lib/format';
import { TIER_LABEL } from '@/lib/levels';
import { MUTE_PRESETS } from '@/server/services/chat/types';
import { ModerationDialog, useChatActions, type ModDialogSpec, type ModTarget } from '@/components/chat/moderation';
import { useChatStore } from '@/components/chat/chat-store';
import { usePublicProfile, type PublicProfile } from './use-profile';

const monthYear = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' });
export const formatMonthYear = (iso: string) => monthYear.format(new Date(iso));

const ROLE_RANK = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 } as const;

function MiniStat({ label, value, hidden }: { label: string; value: ReactNode; hidden?: boolean }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <div className="truncate text-[10.5px] font-medium uppercase tracking-[0.08em] text-fg-subtle">{label}</div>
      <div className={cn('tabular mt-0.5 truncate text-[13px] font-semibold', hidden ? 'text-fg-faint' : 'text-fg')}>{hidden ? 'Hidden' : value}</div>
    </div>
  );
}

/** Presentational card body — shared by the popover and the settings privacy preview. */
export function PlayerCardView({
  profile,
  footer,
  staff,
  className,
}: {
  profile: PublicProfile;
  footer?: ReactNode;
  staff?: ReactNode;
  className?: string;
}) {
  const { user, stats, privacy } = profile;
  const winHidden = stats.hidden.includes('largestWin');
  return (
    <div className={cn('w-full overflow-hidden', className)} data-testid="player-card">
      <div className="relative flex items-center gap-3 px-4 pb-3.5 pt-4">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-surface-3/70 to-transparent" />
        <Avatar avatarUrl={user.avatarUrl} name={user.username} size={52} className="relative ring-1 ring-line-strong" />
        <div className="relative min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold tracking-tight text-fg">{user.displayName}</span>
            <RoleBadge role={user.role} />
          </div>
          <div className="truncate text-xs text-fg-subtle">@{user.username}</div>
          <div className="mt-1.5 flex items-center gap-1.5">
            <LevelBadge level={user.level} size="sm" />
            <span className="text-[11px] font-medium text-fg-muted">{TIER_LABEL[user.tier]}</span>
          </div>
        </div>
      </div>

      {privacy === 'PRIVATE' ? (
        <div className="mx-3 mb-3 flex items-center gap-2.5 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-[12.5px] text-fg-muted">
          <Lock size={14} className="shrink-0 text-fg-subtle" />
          This player keeps their stats private.
        </div>
      ) : (
        <div className="mx-3 mb-3 overflow-hidden rounded-lg border border-line bg-surface-2">
          <div className="grid grid-cols-3 divide-x divide-line">
            <MiniStat label="Games" value={formatCredits(stats.gamesPlayed ?? 0)} />
            <MiniStat label="Joined" value={stats.joinedAt ? formatMonthYear(stats.joinedAt) : '—'} />
            {privacy === 'PUBLIC' ? (
              <MiniStat label="Best win" value={stats.largestWin ? formatCredits(stats.largestWin.amount, { compact: true }) : '—'} hidden={winHidden} />
            ) : (
              <MiniStat label="Stats" value={<span className="inline-flex items-center gap-1 text-fg-subtle"><EyeOff size={12} /> Limited</span>} />
            )}
          </div>
          {privacy === 'PUBLIC' && stats.favoriteGame ? (
            <Link
              href={stats.favoriteGame.href}
              className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-[12.5px] transition-colors hover:bg-surface-3"
            >
              <span className="flex items-center gap-2 text-fg-muted">
                <Trophy size={13} className="text-fg-subtle" />
                Favourite game
              </span>
              <span className="truncate font-medium text-fg">{stats.favoriteGame.name}</span>
            </Link>
          ) : null}
        </div>
      )}

      {staff}
      {footer ? <div className="flex gap-2 border-t border-line px-3 py-3">{footer}</div> : null}
    </div>
  );
}

function StaffPanel({ profile, onDialog, viewerRole }: { profile: PublicProfile; onDialog: (s: ModDialogSpec) => void; viewerRole: keyof typeof ROLE_RANK }) {
  const actions = useChatActions();
  const m = profile.moderation;
  if (!m) return null;
  const target: ModTarget = { id: profile.user.id, username: profile.user.username, displayName: profile.user.displayName };
  const canAct = ROLE_RANK[viewerRole] > ROLE_RANK[m.role];
  const chips: ReactNode[] = [];
  if (m.accountStatus === 'SUSPENDED') chips.push(<Chip key="s" tone="loss">Suspended{m.suspendedUntil ? ` · ${formatDuration(new Date(m.suspendedUntil).getTime() - Date.now())}` : ''}</Chip>);
  if (m.chatBanned) chips.push(<Chip key="b" tone="loss">Chat banned</Chip>);
  if (m.mutedUntil) chips.push(<Chip key="m" tone="warn">Muted · {formatDuration(new Date(m.mutedUntil).getTime() - Date.now())}</Chip>);
  if (m.priorActions > 0) chips.push(<Chip key="p">{m.priorActions} prior action{m.priorActions === 1 ? '' : 's'}</Chip>);
  return (
    <div className="border-t border-line px-3 py-3" data-testid="player-card-staff">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-fg-subtle">Moderation</span>
        {!chips.length ? <span className="text-[11px] text-fg-subtle">No active sanctions</span> : null}
      </div>
      {chips.length ? <div className="mb-2.5 flex flex-wrap gap-1.5">{chips}</div> : null}
      {canAct ? (
        <div className="grid grid-cols-3 gap-1.5">
          <Button size="xs" variant="subtle" leftIcon={<MessageSquareWarning size={13} />} onClick={() => onDialog({ kind: 'warn', target })}>
            Warn
          </Button>
          {m.mutedUntil ? (
            <Button size="xs" variant="subtle" leftIcon={<Volume2 size={13} />} onClick={() => void actions.unmute(target)}>
              Unmute
            </Button>
          ) : (
            <Dropdown
              align="start"
              className="min-w-[180px]"
              trigger={
                <Button size="xs" variant="subtle" leftIcon={<VolumeX size={13} />}>
                  Mute
                </Button>
              }
            >
              <DropdownLabel>Mute in chat</DropdownLabel>
              {MUTE_PRESETS.map((p) => (
                <DropdownItem key={p.seconds} onSelect={() => void actions.muteFor(target, p.seconds)}>
                  {p.label}
                </DropdownItem>
              ))}
              <DropdownSeparator />
              <DropdownItem onSelect={() => onDialog({ kind: 'mute', target })}>Custom…</DropdownItem>
            </Dropdown>
          )}
          {m.chatBanned ? (
            <Button size="xs" variant="subtle" onClick={() => void actions.unban(target)}>
              Unban
            </Button>
          ) : (
            <Button size="xs" variant="subtle" className="text-loss" leftIcon={<Gavel size={13} />} onClick={() => onDialog({ kind: 'ban', target })}>
              Ban
            </Button>
          )}
          {ROLE_RANK[viewerRole] >= ROLE_RANK.ADMIN && m.accountStatus !== 'SUSPENDED' ? (
            <Button size="xs" variant="subtle" className="col-span-3 text-loss" leftIcon={<ShieldAlert size={13} />} onClick={() => onDialog({ kind: 'suspend', target })}>
              Suspend account
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-[11.5px] text-fg-subtle">Staff of equal or higher rank can’t be moderated from here.</p>
      )}
    </div>
  );
}

function Chip({ children, tone }: { children: ReactNode; tone?: 'loss' | 'warn' }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-[5px] border px-1.5 text-[10.5px] font-semibold',
        tone === 'loss' ? 'border-loss/30 bg-loss-soft text-loss' : tone === 'warn' ? 'border-warn/30 bg-warn/10 text-warn' : 'border-line bg-surface-3 text-fg-muted',
      )}
    >
      {children}
    </span>
  );
}

function CardSkeleton() {
  return (
    <div className="p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-[52px] w-[52px] rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
      <Skeleton className="mt-4 h-14 w-full rounded-lg" />
    </div>
  );
}

/** Data-bound player card (fetches the privacy-filtered public profile). */
export function PlayerCard({ username, onNavigate, onDialog }: { username: string; onNavigate?: () => void; onDialog?: (s: ModDialogSpec) => void }) {
  const q = usePublicProfile(username);
  const { data: me } = useMe();
  const actions = useChatActions();
  const hidden = useChatStore((s) => (q.data ? s.muted.includes(q.data.user.id) : false));
  if (q.isLoading) return <CardSkeleton />;
  if (q.error || !q.data) {
    const notFound = q.error instanceof ApiError && q.error.code === 'NOT_FOUND';
    return (
      <div className="flex items-center gap-3 p-4 text-[13px] text-fg-muted">
        <UserRound size={16} className="text-fg-subtle" />
        {notFound ? 'This player could not be found.' : 'Couldn’t load this player right now.'}
      </div>
    );
  }
  const p = q.data;
  const target: ModTarget = { id: p.user.id, username: p.user.username, displayName: p.user.displayName };
  const canBlock = !!p.viewer && !p.isSelf && p.user.role === 'USER';
  return (
    <PlayerCardView
      profile={p}
      staff={me && onDialog ? <StaffPanel profile={p} onDialog={onDialog} viewerRole={me.user.role} /> : null}
      footer={
        <>
          <Link href={p.isSelf ? '/profile' : `/u/${p.user.username}`} className="flex-1" onClick={onNavigate}>
            <Button size="sm" variant="secondary" block>
              {p.isSelf ? 'Your profile' : 'View profile'}
            </Button>
          </Link>
          {canBlock ? (
            <Dropdown
              align="end"
              className="min-w-[200px]"
              trigger={
                <Button size="sm" variant="subtle" aria-label="More player actions" className="w-9 px-0">
                  <MoreHorizontal size={16} />
                </Button>
              }
            >
              <DropdownItem icon={hidden ? <Volume2 size={15} /> : <VolumeX size={15} />} onSelect={() => actions.hide(target, !hidden)}>
                {hidden ? 'Unmute for this session' : 'Mute for this session'}
              </DropdownItem>
              <DropdownItem tone={p.viewer?.blocked ? 'default' : 'danger'} icon={<Ban size={15} />} onSelect={() => void actions.block(target, !p.viewer?.blocked)}>
                {p.viewer?.blocked ? 'Unblock player' : 'Block player'}
              </DropdownItem>
            </Dropdown>
          ) : null}
        </>
      }
    />
  );
}

/**
 * PlayerCardPopover — wrap any trigger (username, avatar, table row) to open
 * a compact player card. Reused by chat and the crash players table.
 */
export function PlayerCardPopover({
  username,
  children,
  side = 'bottom',
  align = 'start',
}: {
  username: string;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<ModDialogSpec | null>(null);
  return (
    <>
      <Popover open={open} onOpenChange={setOpen} side={side} align={align} className="w-[300px] max-w-[calc(100vw-24px)] p-0" trigger={children}>
        {open ? (
          <PlayerCard
            username={username}
            onNavigate={() => setOpen(false)}
            onDialog={(s) => {
              setOpen(false);
              setDialog(s);
            }}
          />
        ) : null}
      </Popover>
      <ModerationDialog spec={dialog} onClose={() => setDialog(null)} />
    </>
  );
}
