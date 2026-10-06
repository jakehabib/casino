'use client';
import { createContext, memo, useContext, useRef, useState, type ReactNode } from 'react';
import { AtSign, Ban, Copy, CornerUpLeft, Flag, Gavel, MessageSquareWarning, MoreHorizontal, Timer, Trash2, Volume2, VolumeX } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { LevelBadge, RoleBadge } from '@/components/ui/level-badge';
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from '@/components/ui/dropdown';
import { Modal } from '@/components/ui/modal';
import { toast } from '@/components/ui/toast';
import { PlayerCardPopover } from '@/components/profile/player-card';
import { cn } from '@/lib/cn';
import { MUTE_PRESETS, type ChatMessageDTO, type ChatRole } from '@/server/services/chat/types';
import { insertMention, setReplyTo } from './chat-store';
import { useChatActions, type ModDialogSpec, type ModTarget } from './moderation';
import { MessageText, RelTime } from './message-text';

const RANK: Record<ChatRole, number> = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 };

export interface ChatViewer {
  id: string | null;
  username: string | null;
  role: ChatRole | null;
  canSend: boolean;
}

interface RowCtx {
  viewer: ChatViewer;
  muted: string[];
  openDialog: (s: ModDialogSpec) => void;
  jumpTo: (id: string) => void;
}
export const ChatRowContext = createContext<RowCtx | null>(null);

interface Action {
  key: string;
  label: string;
  icon: ReactNode;
  tone?: 'danger';
  run: () => void;
}

function useMessageActions(m: ChatMessageDTO): { main: Action[]; personal: Action[]; mod: Action[]; mutes: Action[] } {
  const ctx = useContext(ChatRowContext)!;
  const actions = useChatActions();
  const v = ctx.viewer;
  const own = !!v.id && v.id === m.user.id;
  const target: ModTarget = { id: m.user.id, username: m.user.username, displayName: m.user.displayName };
  const main: Action[] = [];
  const personal: Action[] = [];
  const mod: Action[] = [];
  const mutes: Action[] = [];
  if (v.id && v.canSend) {
    main.push({ key: 'reply', label: 'Reply', icon: <CornerUpLeft size={15} />, run: () => setReplyTo(m) });
    if (!own) main.push({ key: 'mention', label: 'Mention', icon: <AtSign size={15} />, run: () => insertMention(m.user.username) });
  }
  main.push({
    key: 'copy',
    label: 'Copy text',
    icon: <Copy size={15} />,
    run: () => void navigator.clipboard?.writeText(m.content).then(() => toast.success('Copied to clipboard'), () => undefined),
  });
  if (v.id && !own) {
    main.push({ key: 'report', label: 'Report message', icon: <Flag size={15} />, run: () => ctx.openDialog({ kind: 'report', target, messageId: m.id, preview: m.content }) });
    if (m.user.role === 'USER') {
      const hidden = ctx.muted.includes(m.user.id);
      personal.push({
        key: 'hide',
        label: hidden ? `Unmute @${m.user.username}` : `Mute @${m.user.username}`,
        icon: hidden ? <Volume2 size={15} /> : <VolumeX size={15} />,
        run: () => actions.hide(target, !hidden),
      });
      personal.push({ key: 'block', label: `Block @${m.user.username}`, icon: <Ban size={15} />, tone: 'danger', run: () => void actions.block(target, true) });
    }
  }
  const vr = v.role ? RANK[v.role] : 0;
  if (vr >= RANK.MODERATOR && (own || vr > RANK[m.user.role])) {
    mod.push({ key: 'delete', label: 'Delete message', icon: <Trash2 size={15} />, tone: 'danger', run: () => void actions.deleteMessage(m.id) });
    if (!own) {
      mod.push({ key: 'warn', label: 'Warn…', icon: <MessageSquareWarning size={15} />, run: () => ctx.openDialog({ kind: 'warn', target, messageId: m.id }) });
      for (const p of MUTE_PRESETS) mutes.push({ key: `mute-${p.seconds}`, label: `Mute ${p.short}`, icon: <Timer size={15} />, run: () => void actions.muteFor(target, p.seconds) });
      mutes.push({ key: 'mute-custom', label: 'Mute custom…', icon: <Timer size={15} />, run: () => ctx.openDialog({ kind: 'mute', target }) });
      mod.push({ key: 'ban', label: 'Ban from chat…', icon: <Gavel size={15} />, tone: 'danger', run: () => ctx.openDialog({ kind: 'ban', target }) });
    }
  }
  return { main, personal, mod, mutes };
}

function ActionMenu({ m }: { m: ChatMessageDTO }) {
  const { main, personal, mod, mutes } = useMessageActions(m);
  const rest = main.filter((a) => a.key !== 'reply' && a.key !== 'mention');
  return (
    <Dropdown
      align="end"
      className="min-w-[210px]"
      trigger={
        <button type="button" aria-label="More message actions" className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-4 hover:text-fg">
          <MoreHorizontal size={15} />
        </button>
      }
    >
      {rest.map((a) => (
        <DropdownItem key={a.key} icon={a.icon} tone={a.tone} onSelect={a.run}>
          {a.label}
        </DropdownItem>
      ))}
      {personal.length ? <DropdownSeparator /> : null}
      {personal.map((a) => (
        <DropdownItem key={a.key} icon={a.icon} tone={a.tone} onSelect={a.run}>
          {a.label}
        </DropdownItem>
      ))}
      {mod.length ? (
        <>
          <DropdownSeparator />
          <DropdownLabel>Moderation</DropdownLabel>
          {mod.slice(0, 2).map((a) => (
            <DropdownItem key={a.key} icon={a.icon} tone={a.tone} onSelect={a.run}>
              {a.label}
            </DropdownItem>
          ))}
          {mutes.length ? (
            <div className="grid grid-cols-4 gap-1 px-1.5 py-1">
              {mutes.map((a) => (
                <DropdownItem key={a.key} onSelect={a.run} className="h-7 justify-center px-0 text-[11.5px]">
                  {a.key === 'mute-custom' ? 'Custom' : a.label.replace('Mute ', '')}
                </DropdownItem>
              ))}
            </div>
          ) : null}
          {mod.slice(2).map((a) => (
            <DropdownItem key={a.key} icon={a.icon} tone={a.tone} onSelect={a.run}>
              {a.label}
            </DropdownItem>
          ))}
        </>
      ) : null}
    </Dropdown>
  );
}

/** Mobile long-press sheet with the same actions. */
function ActionSheet({ m, open, onOpenChange }: { m: ChatMessageDTO; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { main, personal, mod, mutes } = useMessageActions(m);
  const item = (a: Action) => (
    <button
      key={a.key}
      type="button"
      onClick={() => {
        onOpenChange(false);
        a.run();
      }}
      className={cn('flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] font-medium active:bg-surface-3', a.tone === 'danger' ? 'text-loss' : 'text-fg')}
    >
      <span className={a.tone === 'danger' ? 'text-loss' : 'text-fg-subtle'}>{a.icon}</span>
      {a.label}
    </button>
  );
  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" title={<span className="text-[15px]">@{m.user.username}</span>} description={<span className="line-clamp-2 [overflow-wrap:anywhere]">{m.content}</span>}>
      <div className="-mx-2 pb-2">
        {main.map(item)}
        {personal.length ? <div className="my-1.5 h-px bg-line" /> : null}
        {personal.map(item)}
        {mod.length ? (
          <>
            <div className="my-1.5 h-px bg-line" />
            <div className="px-3 pb-1 pt-1 text-2xs font-semibold uppercase tracking-wider text-fg-subtle">Moderation</div>
            {mod.slice(0, 2).map(item)}
            {mutes.length ? (
              <div className="grid grid-cols-4 gap-1.5 px-3 py-1.5">
                {mutes.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      a.run();
                    }}
                    className="h-10 rounded-lg border border-line bg-surface-2 text-[13px] font-medium text-fg-muted active:bg-surface-3"
                  >
                    {a.key === 'mute-custom' ? 'Custom' : a.label.replace('Mute ', '')}
                  </button>
                ))}
              </div>
            ) : null}
            {mod.slice(2).map(item)}
          </>
        ) : null}
      </div>
    </Modal>
  );
}

const NAME_TONE: Record<ChatRole, string> = {
  USER: 'text-fg',
  MODERATOR: 'text-info',
  ADMIN: 'text-accent',
  SUPER_ADMIN: 'text-accent',
};

export const MessageRow = memo(function MessageRow({ m, grouped, mentionsMe, highlight }: { m: ChatMessageDTO; grouped: boolean; mentionsMe: boolean; highlight?: boolean }) {
  const ctx = useContext(ChatRowContext)!;
  const [sheet, setSheet] = useState(false);
  const press = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPress = () => {
    if (press.current) clearTimeout(press.current);
    press.current = null;
  };
  const v = ctx.viewer;
  const quick = v.id && v.canSend;

  return (
    <div
      id={`chat-msg-${m.id}`}
      data-testid="chat-message"
      className={cn(
        'group relative select-text px-3 transition-colors duration-150 [contain-intrinsic-size:auto_44px] [content-visibility:auto]',
        grouped ? 'py-[3px]' : 'pb-[3px] pt-2.5',
        mentionsMe ? 'bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)]' : 'hover:bg-surface-2/70',
        highlight && 'bg-surface-3',
      )}
      onTouchStart={() => {
        cancelPress();
        press.current = setTimeout(() => {
          setSheet(true);
          navigator.vibrate?.(8);
        }, 450);
      }}
      onTouchMove={cancelPress}
      onTouchEnd={cancelPress}
      onTouchCancel={cancelPress}
      onContextMenu={(e) => {
        if (window.matchMedia('(pointer: coarse)').matches) e.preventDefault();
      }}
    >
      <div className="flex gap-2.5">
        <div className="w-7 shrink-0">
          {grouped ? (
            <RelTime iso={m.createdAt} className="block pt-[3px] text-right text-[9.5px] opacity-0 transition-opacity group-hover:opacity-100" />
          ) : (
            <PlayerCardPopover username={m.user.username}>
              <button type="button" aria-label={`${m.user.displayName}’s profile`} className="mt-0.5 block rounded-full">
                <Avatar avatarUrl={m.user.avatarUrl} name={m.user.username} size={28} />
              </button>
            </PlayerCardPopover>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {!grouped ? (
            <div className="flex h-5 min-w-0 items-center gap-1.5">
              <PlayerCardPopover username={m.user.username}>
                <button type="button" className={cn('min-w-0 truncate text-[13px] font-semibold hover:underline hover:decoration-line-strong hover:underline-offset-2', NAME_TONE[m.user.role])}>
                  {m.user.displayName}
                </button>
              </PlayerCardPopover>
              <LevelBadge level={m.user.level} size="xs" />
              <RoleBadge role={m.user.role} />
              <RelTime iso={m.createdAt} className="ml-0.5" />
            </div>
          ) : null}
          {m.replyTo ? (
            <button
              type="button"
              onClick={() => !m.replyTo!.deleted && ctx.jumpTo(m.replyTo!.id)}
              className="mt-0.5 flex max-w-full items-center gap-1.5 rounded-md border-l-2 border-line-strong bg-surface-2/70 py-0.5 pl-2 pr-2 text-left text-[11.5px] text-fg-subtle transition-colors hover:text-fg-muted"
            >
              <CornerUpLeft size={11} className="shrink-0" />
              <span className="shrink-0 font-semibold text-fg-muted">{m.replyTo.user.displayName}</span>
              <span className="truncate">{m.replyTo.deleted ? <em>message removed</em> : m.replyTo.content}</span>
            </button>
          ) : null}
          <p className="mt-px whitespace-pre-wrap text-[13.5px] leading-[1.45] text-fg/90 [overflow-wrap:anywhere]">
            <MessageText text={m.content} mentions={m.mentions} me={v.username} />
          </p>
        </div>
      </div>

      <div
        className={cn(
          'pointer-events-none absolute right-2 top-0 flex -translate-y-1/3 items-center gap-0.5 rounded-lg border border-line bg-surface-3 p-0.5 opacity-0 shadow-2 transition-opacity duration-100',
          'group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100 has-[[data-state=open]]:pointer-events-auto has-[[data-state=open]]:opacity-100',
          '[@media(pointer:coarse)]:hidden',
        )}
      >
        {quick ? (
          <>
            <button type="button" aria-label="Reply" title="Reply" onClick={() => setReplyTo(m)} className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-4 hover:text-fg">
              <CornerUpLeft size={15} />
            </button>
            {v.id !== m.user.id ? (
              <button type="button" aria-label="Mention" title="Mention" onClick={() => insertMention(m.user.username)} className="flex h-7 w-7 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-4 hover:text-fg">
                <AtSign size={15} />
              </button>
            ) : null}
          </>
        ) : null}
        <ActionMenu m={m} />
      </div>
      {sheet ? <ActionSheet m={m} open={sheet} onOpenChange={setSheet} /> : null}
    </div>
  );
});
