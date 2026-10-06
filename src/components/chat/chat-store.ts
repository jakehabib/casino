'use client';
import { create } from 'zustand';
import { useEffect } from 'react';
import { getSocket, emitAck } from '@/lib/socket-client';
import { api, requestId } from '@/lib/api';
import { playSound } from '@/audio/audio-manager';
import { toast } from '@/components/ui/toast';
import type { ChatJoinPayload, ChatMessageDTO, ChatStatus } from '@/server/services/chat/types';

/**
 * Client chat state. One shared feed per tab: it joins the room once, keeps
 * the message list across panel open/close (desktop panel and mobile drawer
 * share it) and counts unread messages while no chat surface is visible.
 */
const MAX_MESSAGES = 200;
const MUTED_KEY = 'nova.chat.muted.v1';

export interface ChatError {
  code: string;
  message: string;
  retryAfterSec?: number;
  until?: string | null;
}

interface ChatState {
  phase: 'idle' | 'joining' | 'ready' | 'error';
  messages: ChatMessageDTO[];
  status: ChatStatus | null;
  blocked: string[];
  /** Session-only personal mute ("hide for now"). */
  muted: string[];
  unread: number;
  unreadMention: boolean;
  visible: Set<string>;
  replyTo: ChatMessageDTO | null;
  draft: string;
  sending: boolean;
  error: ChatError | null;
  /** Local slow-mode / rate countdown end (ms epoch). */
  cooldownUntil: number;
  /** Mention-insert requests from message actions → composer focuses. */
  focusTick: number;
}

export const useChatStore = create<ChatState>(() => ({
  phase: 'idle',
  messages: [],
  status: null,
  blocked: [],
  muted: readMuted(),
  unread: 0,
  unreadMention: false,
  visible: new Set(),
  replyTo: null,
  draft: '',
  sending: false,
  error: null,
  cooldownUntil: 0,
  focusTick: 0,
}));

const set = useChatStore.setState;
const get = useChatStore.getState;

function readMuted(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(sessionStorage.getItem(MUTED_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export const isMentioned = (m: ChatMessageDTO, userId: string | null | undefined) => !!userId && m.mentions.some((x) => x.id === userId);

function upsert(list: ChatMessageDTO[], m: ChatMessageDTO): ChatMessageDTO[] {
  const i = list.findIndex((x) => x.id === m.id);
  if (i >= 0) {
    const next = list.slice();
    next[i] = { ...m, clientId: m.clientId ?? list[i].clientId };
    return next;
  }
  const next = [...list, m];
  // Server order is authoritative; keep chronological if events arrive out of order.
  if (list.length && list[list.length - 1].createdAt > m.createdAt) next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next;
}

let started = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

async function join() {
  if (retryTimer) clearTimeout(retryTimer);
  set({ phase: get().phase === 'ready' ? 'ready' : 'joining' });
  try {
    const p = await emitAck<ChatJoinPayload>('chat:join', {});
    const blocked = new Set(p.blocked);
    set((s) => ({
      phase: 'ready',
      status: p.status,
      blocked: p.blocked,
      messages: p.messages.filter((m) => !blocked.has(m.user.id)),
      // Identity may have changed (login/logout): drop stale composer context.
      replyTo: s.status?.userId === p.status.userId ? s.replyTo : null,
      error: s.status?.userId === p.status.userId ? s.error : null,
    }));
  } catch {
    set({ phase: get().messages.length ? 'ready' : 'error' });
    retryTimer = setTimeout(() => void join(), 4000);
  }
}

/** Start the shared feed (idempotent). Called by the panel and the unread hook. */
export function startChatFeed() {
  if (started || typeof window === 'undefined') return;
  started = true;
  const s = getSocket();
  s.on('connect', () => void join());
  if (s.connected) void join();

  s.on('chat:message', (m: ChatMessageDTO) => {
    const st = get();
    if (st.blocked.includes(m.user.id)) return;
    const mine = m.user.id === st.status?.userId;
    const hidden = st.muted.includes(m.user.id);
    const isNew = !st.messages.some((x) => x.id === m.id);
    set({ messages: upsert(st.messages, m) });
    if (isNew && !mine && !hidden && st.visible.size === 0) {
      set((x) => ({ unread: x.unread + 1, unreadMention: x.unreadMention || isMentioned(m, st.status?.userId) }));
    }
  });
  s.on('chat:deleted', ({ ids }: { ids: string[] }) => {
    const gone = new Set(ids);
    set((st) => ({
      messages: st.messages
        .filter((m) => !gone.has(m.id))
        .map((m) => (m.replyTo && gone.has(m.replyTo.id) ? { ...m, replyTo: { ...m.replyTo, deleted: true, content: '' } } : m)),
      replyTo: st.replyTo && gone.has(st.replyTo.id) ? null : st.replyTo,
    }));
  });
  s.on('chat:status', (status: ChatStatus) => set((st) => ({ status: { ...status, userId: status.userId ?? st.status?.userId ?? null } })));
  s.on('chat:blocks', ({ blocked }: { blocked: string[] }) => applyBlocked(blocked));
  s.on('chat:mention', (p: { from: { id: string; username: string; displayName: string }; content: string }) => {
    if (get().muted.includes(p.from.id) || get().blocked.includes(p.from.id)) return;
    playSound('message');
    if (get().visible.size === 0) toast.info(`${p.from.displayName} mentioned you`, p.content);
  });
  s.on('chat:warn', (p: { reason: string }) => {
    toast.error('Warning from a moderator', `${p.reason}. Please keep chat friendly.`);
  });
}

function applyBlocked(blocked: string[]) {
  const b = new Set(blocked);
  set((st) => ({ blocked, messages: st.messages.filter((m) => !b.has(m.user.id)) }));
}

// ── Visibility / unread ───────────────────────────────────

export function setChatVisible(id: string, visible: boolean) {
  set((st) => {
    const v = new Set(st.visible);
    if (visible) v.add(id);
    else v.delete(id);
    return v.size > 0 ? { visible: v, unread: 0, unreadMention: false } : { visible: v };
  });
}

/**
 * Unread badge for the chat toggle. Wire into the top bar / mobile nav:
 *   const { count, mention } = useChatUnread();
 */
export function useChatUnread() {
  useEffect(() => startChatFeed(), []);
  const count = useChatStore((s) => s.unread);
  const mention = useChatStore((s) => s.unreadMention);
  return { count, mention };
}

// ── Actions ───────────────────────────────────────────────

export function setDraft(draft: string) {
  const e = get().error;
  // Typing dismisses one-off errors; timed ones (rate/slow mode) clear themselves.
  set({ draft, error: e && !e.retryAfterSec ? null : e });
}

export function setReplyTo(m: ChatMessageDTO | null) {
  set((s) => ({ replyTo: m, focusTick: s.focusTick + 1 }));
}

export function insertMention(username: string) {
  set((s) => {
    const d = s.draft.trimEnd();
    const token = `@${username} `;
    return { draft: d ? `${d} ${token}` : token, focusTick: s.focusTick + 1 };
  });
}

export function clearChatError() {
  set({ error: null });
}

export async function sendChat(): Promise<boolean> {
  const st = get();
  if (st.sending || !st.draft.trim()) return false;
  set({ sending: true, error: null });
  const clientId = requestId();
  try {
    const m = await emitAck<ChatMessageDTO>('chat:send', { content: st.draft, replyToId: st.replyTo?.id ?? null, clientId });
    const slow = get().status?.slowModeSeconds ?? 0;
    set((s) => ({
      messages: upsert(s.messages, m),
      draft: '',
      replyTo: null,
      sending: false,
      cooldownUntil: slow > 0 ? Date.now() + slow * 1000 : s.cooldownUntil,
    }));
    return true;
  } catch (e) {
    const err = e as Error & { code?: string; details?: { retryAfterSec?: number; until?: string | null; reason?: string } };
    const retry = err.details?.retryAfterSec;
    set({
      sending: false,
      error: { code: err.code ?? 'INTERNAL', message: err.message, retryAfterSec: retry, until: err.details?.until ?? null },
      cooldownUntil: retry ? Date.now() + retry * 1000 : get().cooldownUntil,
    });
    if (err.code === 'CHAT_MUTED' || err.code === 'CHAT_BANNED' || err.code === 'COOLDOWN_ACTIVE' || err.code === 'SELF_EXCLUDED' || err.code === 'ACCOUNT_SUSPENDED') {
      void join(); // refresh status → composer switches to its read-only state
    }
    return false;
  }
}

export async function deleteChatMessage(messageId: string) {
  await emitAck('chat:delete', { messageId });
}

export async function setUserBlocked(userId: string, blocked: boolean) {
  const res = await api.post<{ blocked: string[] }>('/api/chat/blocks', { userId, blocked });
  applyBlocked(res.blocked);
  return res.blocked;
}

export function setUserMuted(userId: string, muted: boolean) {
  set((s) => {
    const next = muted ? [...new Set([...s.muted, userId])] : s.muted.filter((x) => x !== userId);
    try {
      sessionStorage.setItem(MUTED_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    return { muted: next };
  });
}

export function rejoinChat() {
  void join();
}
