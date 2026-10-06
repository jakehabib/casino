'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CornerUpLeft, Gavel, HeartHandshake, Lock, LogIn, SendHorizontal, ShieldAlert, VolumeX, X } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { LevelBadge } from '@/components/ui/level-badge';
import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/format';
import { DUR, EASE } from '@/lib/motion';
import { CHAT_MAX_LENGTH, chatLength } from '@/server/services/chat/sanitize';
import type { ChatStatus, ChatUser } from '@/server/services/chat/types';
import { clearChatError, sendChat, setDraft, setReplyTo, useChatStore } from './chat-store';
import { EmojiPicker } from './emoji-picker';

const COUNTER_FROM = CHAT_MAX_LENGTH - 60;

function useCountdown(until: number | string | null | undefined) {
  const target = until ? (typeof until === 'number' ? until : new Date(until).getTime()) : 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target || target <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [target]);
  return target ? Math.max(0, target - now) : 0;
}

function ReadOnlyNotice({ status }: { status: ChatStatus }) {
  const remaining = useCountdown(status.until);
  const base = 'flex min-h-[52px] items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-[13px]';
  if (status.reason === 'GUEST') {
    return (
      <div className={base} data-testid="chat-readonly">
        <Lock size={15} className="shrink-0 text-fg-subtle" />
        <span className="flex-1 text-fg-muted">Sign in to join the conversation.</span>
        <Link href="/login" className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover">
          <LogIn size={14} />
          Sign in to chat
        </Link>
      </div>
    );
  }
  const map = {
    CHAT_MUTED: { icon: <VolumeX size={15} className="text-warn" />, text: 'You’re muted', sub: remaining > 0 ? `You can chat again in ${formatDuration(remaining)}.` : 'Your mute is ending…' },
    CHAT_BANNED: { icon: <Gavel size={15} className="text-loss" />, text: 'You’re banned from chat', sub: 'You can still read messages and play.' },
    ACCOUNT_SUSPENDED: { icon: <ShieldAlert size={15} className="text-loss" />, text: 'Chat is read-only', sub: 'Your account is currently suspended.' },
    COOLDOWN_ACTIVE: { icon: <HeartHandshake size={15} className="text-fg-muted" />, text: 'Chat is read-only during your break', sub: remaining > 0 ? `Your break ends in ${formatDuration(remaining)}.` : undefined },
    SELF_EXCLUDED: { icon: <HeartHandshake size={15} className="text-fg-muted" />, text: 'Chat is read-only during your self-exclusion', sub: undefined },
  } as const;
  const c = map[status.reason as keyof typeof map] ?? map.CHAT_BANNED;
  return (
    <div className={base} data-testid="chat-readonly">
      <span className="shrink-0">{c.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-fg">{c.text}</span>
        {c.sub ? <span className="block text-xs text-fg-subtle">{c.sub}</span> : null}
      </span>
    </div>
  );
}

/** @mention autocomplete candidates: recent chat participants. */
function useMentionCandidates(query: string | null, selfId: string | null) {
  const messages = useChatStore((s) => s.messages);
  return useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    const seen = new Set<string>();
    const out: ChatUser[] = [];
    for (let i = messages.length - 1; i >= 0 && out.length < 6; i--) {
      const u = messages[i].user;
      if (u.id === selfId || seen.has(u.id)) continue;
      seen.add(u.id);
      if (u.username.startsWith(q) || u.displayName.toLowerCase().startsWith(q)) out.push(u);
    }
    return out;
  }, [messages, query, selfId]);
}

export function Composer({ status }: { status: ChatStatus | null }) {
  const draft = useChatStore((s) => s.draft);
  const replyTo = useChatStore((s) => s.replyTo);
  const sending = useChatStore((s) => s.sending);
  const error = useChatStore((s) => s.error);
  const cooldownUntil = useChatStore((s) => s.cooldownUntil);
  const focusTick = useChatStore((s) => s.focusTick);
  const inputRef = useRef<HTMLInputElement>(null);
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);
  const cooldown = useCountdown(cooldownUntil);

  useEffect(() => {
    if (focusTick === 0) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
    setCaret(end);
  }, [focusTick]);

  // Auto-clear transient errors once their cooldown passes.
  useEffect(() => {
    if (error?.retryAfterSec && cooldown === 0) clearChatError();
  }, [cooldown, error?.retryAfterSec]);

  const before = draft.slice(0, caret);
  const mentionMatch = /(^|\s)@([A-Za-z0-9_]{0,20})$/.exec(before);
  const query = mentionMatch && dismissedAt !== before ? mentionMatch[2] : null;
  const candidates = useMentionCandidates(query, status?.userId ?? null);
  const showMentions = candidates.length > 0;

  if (!status) return <div className="h-[52px] rounded-xl border border-line bg-surface-2" />;
  if (!status.canSend) return <ReadOnlyNotice status={status} />;

  const len = chatLength(draft);
  const over = len > CHAT_MAX_LENGTH;
  const blocked = cooldown > 0;
  const canSend = !!draft.trim() && !over && !sending && !blocked;

  const pickMention = (u: ChatUser) => {
    if (!mentionMatch) return;
    const start = caret - mentionMatch[2].length - 1;
    const next = `${draft.slice(0, start)}@${u.username} ${draft.slice(caret)}`;
    setDraft(next);
    const pos = start + u.username.length + 2;
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(pos, pos);
      setCaret(pos);
    });
    setActive(0);
  };

  const insertEmoji = (e: string) => {
    const el = inputRef.current;
    const at = el?.selectionStart ?? draft.length;
    const next = draft.slice(0, at) + e + draft.slice(el?.selectionEnd ?? at);
    setDraft(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + e.length, at + e.length);
      setCaret(at + e.length);
    });
  };

  const submit = async () => {
    if (!canSend) return;
    const ok = await sendChat();
    if (ok) {
      setCaret(0);
      inputRef.current?.focus();
    }
  };

  const errorText = error
    ? error.retryAfterSec && cooldown > 0
      ? `${error.message} (${Math.ceil(cooldown / 1000)}s)`
      : error.message
    : blocked && (status.slowModeSeconds ?? 0) > 0
      ? `Slow mode — next message in ${Math.ceil(cooldown / 1000)}s`
      : null;

  return (
    <div className="relative">
      <AnimatePresence>
        {showMentions ? (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: DUR.fast, ease: EASE.out }}
            className="absolute inset-x-0 bottom-full z-10 mb-2 overflow-hidden rounded-xl border border-line bg-surface-1 p-1 shadow-3"
            role="listbox"
            aria-label="Mention a player"
          >
            {candidates.map((u, i) => (
              <button
                key={u.id}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickMention(u)}
                onMouseEnter={() => setActive(i)}
                className={cn('flex h-9 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13px]', i === active ? 'bg-surface-3 text-fg' : 'text-fg-muted')}
              >
                <Avatar avatarUrl={u.avatarUrl} name={u.username} size={22} />
                <span className="truncate font-medium">{u.displayName}</span>
                <span className="truncate text-xs text-fg-subtle">@{u.username}</span>
                <LevelBadge level={u.level} size="xs" className="ml-auto" />
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {replyTo ? (
          <motion.div
            key="reply"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: DUR.fast, ease: EASE.out }}
            className="overflow-hidden"
          >
            <div className="mb-1.5 flex items-center gap-2 rounded-lg bg-surface-2 py-1.5 pl-2.5 pr-1 text-xs" data-testid="reply-chip">
              <CornerUpLeft size={13} className="shrink-0 text-accent" />
              <span className="shrink-0 text-fg-subtle">Replying to</span>
              <span className="shrink-0 font-semibold text-fg">{replyTo.user.displayName}</span>
              <span className="min-w-0 flex-1 truncate text-fg-subtle">{replyTo.content}</span>
              <button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(null)} className="rounded p-1 text-fg-subtle hover:bg-surface-3 hover:text-fg">
                <X size={13} />
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className={cn(
          'flex items-center gap-1 rounded-xl border bg-bg-raised py-1 pl-1 pr-1 transition-[border,box-shadow] duration-150 focus-within:border-accent/60 focus-within:shadow-[0_0_0_3px_#7c5cff1f]',
          error && !error.retryAfterSec ? 'border-loss/50' : 'border-line',
        )}
      >
        <EmojiPicker onPick={insertEmoji} />
        <input
          ref={inputRef}
          value={draft}
          data-testid="chat-input"
          aria-label="Message"
          placeholder={replyTo ? `Reply to ${replyTo.user.displayName}…` : 'Say something nice…'}
          maxLength={CHAT_MAX_LENGTH * 2}
          autoComplete="off"
          enterKeyHint="send"
          onChange={(e) => {
            setDraft(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
            setDismissedAt(null);
            setActive(0);
          }}
          onSelect={(e) => setCaret((e.target as HTMLInputElement).selectionStart ?? 0)}
          onKeyDown={(e) => {
            if (showMentions) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + candidates.length) % candidates.length);
                return;
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                pickMention(candidates[Math.min(active, candidates.length - 1)]);
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setDismissedAt(before);
                return;
              }
            }
            if (e.key === 'Escape' && replyTo) {
              e.preventDefault();
              setReplyTo(null);
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          className="h-9 min-w-0 flex-1 bg-transparent px-1 text-[15px] text-fg outline-none placeholder:text-fg-faint sm:text-[13.5px]"
        />
        {len >= COUNTER_FROM ? (
          <span className={cn('tabular shrink-0 px-1 text-[11px] font-medium', over ? 'text-loss' : len > CHAT_MAX_LENGTH - 20 ? 'text-warn' : 'text-fg-subtle')} aria-live="polite">
            {CHAT_MAX_LENGTH - len}
          </span>
        ) : null}
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
          data-testid="chat-send"
          className={cn(
            'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-[background,color,transform] duration-150 active:scale-95',
            canSend ? 'bg-accent text-white hover:bg-accent-hover' : 'bg-surface-3 text-fg-faint',
          )}
        >
          {blocked ? <span className="tabular text-[11px] font-semibold text-fg-muted">{Math.ceil(cooldown / 1000)}</span> : <SendHorizontal size={15} />}
        </button>
      </form>
      <AnimatePresence initial={false}>
        {errorText ? (
          <motion.p
            key="err"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: DUR.fast }}
            className={cn('overflow-hidden px-1 pt-1.5 text-xs font-medium', error && !error.retryAfterSec ? 'text-loss' : 'text-warn')}
            role="status"
            data-testid="chat-error"
          >
            {errorText}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
