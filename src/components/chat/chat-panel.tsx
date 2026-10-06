'use client';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowDown, Info, MessageSquare, PanelRightClose, Timer, WifiOff, X } from 'lucide-react';
import { Popover } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { usePresence, useConnectionState } from '@/hooks/use-socket';
import { useMe } from '@/hooks/use-me';
import { useUi } from '@/stores/ui-store';
import { cn } from '@/lib/cn';
import { DUR, EASE } from '@/lib/motion';
import { CHAT_MAX_LENGTH } from '@/server/services/chat/sanitize';
import type { ChatMessageDTO } from '@/server/services/chat/types';
import { isMentioned, setChatVisible, startChatFeed, useChatStore } from './chat-store';
import { ChatRowContext, MessageRow, type ChatViewer } from './message-row';
import { Composer } from './composer';
import { ModerationDialog, type ModDialogSpec } from './moderation';

const GROUP_WINDOW_MS = 3 * 60_000;
const BOTTOM_SLACK = 64;

function ChatRules() {
  return (
    <Popover
      align="end"
      className="w-[280px] p-4"
      trigger={
        <button type="button" aria-label="Chat rules" className="flex h-8 w-8 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg">
          <Info size={16} />
        </button>
      }
    >
      <div className="text-sm font-semibold text-fg">Chat rules</div>
      <ul className="mt-2 space-y-1.5 text-[13px] leading-snug text-fg-muted">
        <li>Be kind. No harassment, hate or threats.</li>
        <li>No spam, flooding or repeated messages.</li>
        <li>Credits are play money — no trading, selling or begging.</li>
        <li>Never share passwords or personal details.</li>
        <li>Links are only clickable for a few trusted sites.</li>
      </ul>
      <p className="mt-3 text-xs text-fg-subtle">Messages up to {CHAT_MAX_LENGTH} characters. Moderators may remove messages or mute players.</p>
    </Popover>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-4 px-3 py-4" aria-hidden>
      {[0.8, 0.55, 0.7, 0.4, 0.65].map((w, i) => (
        <div key={i} className="flex gap-2.5">
          <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3" style={{ width: `${w * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Live global chat. Mounted by the app shell as a collapsible desktop panel
 * (variant="panel") and inside the mobile bottom drawer (variant="drawer").
 */
export function ChatPanel({ variant = 'panel', onClose }: { variant?: 'panel' | 'drawer'; onClose?: () => void }) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const online = usePresence();
  const conn = useConnectionState();
  const setChatOpen = useUi((s) => s.setChatOpen);

  const phase = useChatStore((s) => s.phase);
  const messages = useChatStore((s) => s.messages);
  const status = useChatStore((s) => s.status);
  const muted = useChatStore((s) => s.muted);
  const blocked = useChatStore((s) => s.blocked);

  const [dialog, setDialog] = useState<ModDialogSpec | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [pending, setPending] = useState(0);
  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => startChatFeed(), []);

  // Visibility drives unread counting (hidden desktop panels on mobile never count as visible).
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setChatVisible(panelId, e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => {
      io.disconnect();
      setChatVisible(panelId, false);
    };
  }, [panelId]);

  // Inside the swipeable drawer, keep scroll/selection gestures from dragging the sheet.
  useEffect(() => {
    if (variant !== 'drawer') return;
    const el = bodyRef.current;
    if (!el) return;
    const stop = (e: PointerEvent) => e.stopPropagation();
    el.addEventListener('pointerdown', stop);
    return () => el.removeEventListener('pointerdown', stop);
  }, [variant]);

  const { data: me } = useMe();
  const viewer: ChatViewer = useMemo(
    () => ({
      id: status?.userId ?? null,
      username: status?.userId && me?.user.id === status.userId ? me.user.username : null,
      role: status?.role ?? null,
      canSend: !!status?.canSend,
    }),
    [status, me],
  );

  const visible = useMemo(() => {
    const hide = new Set([...muted, ...blocked]);
    return messages.filter((m) => !hide.has(m.user.id));
  }, [messages, muted, blocked]);

  const ctx = useMemo(
    () => ({
      viewer,
      muted,
      openDialog: setDialog,
      jumpTo: (id: string) => {
        const el = document.getElementById(`chat-msg-${id}`);
        if (!el) return;
        el.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
        setHighlight(id);
        setTimeout(() => setHighlight((h) => (h === id ? null : h)), 1400);
      },
    }),
    [viewer, muted, reduceMotion],
  );

  // ── Scroll management ────────────────────────────────
  const lastIdRef = useRef<string | null>(null);
  const scrollToBottom = useCallback(
    (smooth: boolean) => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
    },
    [reduceMotion],
  );

  useLayoutEffect(() => {
    const prevLast = lastIdRef.current;
    const last = visible[visible.length - 1];
    lastIdRef.current = last?.id ?? null;
    if (!last || last.id === prevLast) return;
    if (prevLast === null) {
      scrollToBottom(false);
      return;
    }
    const idx = visible.findIndex((m) => m.id === prevLast);
    const added = idx >= 0 ? visible.slice(idx + 1) : [last];
    const mine = added.some((m) => m.user.id === viewer.id);
    if (atBottom || mine) {
      scrollToBottom(true);
      setPending(0);
    } else {
      setPending((p) => p + added.length);
    }
  }, [visible, atBottom, viewer.id, scrollToBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_SLACK;
    if (bottom !== atBottom) setAtBottom(bottom);
    if (bottom && pending) setPending(0);
  };

  const close = () => {
    if (onClose) onClose();
    else setChatOpen(false);
  };

  const slow = status?.slowModeSeconds ?? 0;

  return (
    <div ref={rootRef} className={cn('flex h-full min-h-0 flex-col', variant === 'drawer' ? 'bg-surface-1' : 'bg-bg-raised')} data-testid={`chat-panel-${variant}`}>
      {/* Header */}
      <div className={cn('flex shrink-0 items-center gap-2 border-b border-line-soft px-3', variant === 'drawer' ? 'h-12' : 'h-14 sm:h-16')}>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface-2 text-fg-muted">
            <MessageSquare size={15} />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="text-[13.5px] font-semibold text-fg">Global</div>
            <div className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
              <span className={cn('h-1.5 w-1.5 rounded-full', conn === 'connected' ? 'bg-win' : 'bg-warn')} />
              <span className="tabular">{conn === 'connected' ? (online !== null ? `${online.toLocaleString('en-US')} online` : 'Connecting…') : 'Reconnecting…'}</span>
            </div>
          </div>
        </div>
        {slow > 0 ? (
          <span className="inline-flex h-6 items-center gap-1 rounded-md border border-line bg-surface-2 px-2 text-[11px] font-medium text-fg-muted" title={`Slow mode: one message every ${slow}s`} data-testid="slow-mode">
            <Timer size={12} />
            Slow {slow}s
          </span>
        ) : null}
        <ChatRules />
        <button
          type="button"
          onClick={close}
          aria-label={variant === 'drawer' ? 'Close chat' : 'Hide chat'}
          className="flex h-8 w-8 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg"
        >
          {variant === 'drawer' ? <X size={17} /> : <PanelRightClose size={16} />}
        </button>
      </div>

      <div ref={bodyRef} className="relative flex min-h-0 flex-1 flex-col">
        {conn !== 'connected' && phase === 'ready' ? (
          <div className="flex items-center justify-center gap-1.5 border-b border-warn/20 bg-warn/10 px-3 py-1.5 text-[11.5px] font-medium text-warn">
            <WifiOff size={12} /> Reconnecting — messages will catch up
          </div>
        ) : null}

        {/* Messages */}
        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2" role="log" aria-live="polite" aria-label="Chat messages" data-testid="chat-log">
          {phase === 'idle' || (phase === 'joining' && !messages.length) ? (
            <LoadingRows />
          ) : phase === 'error' && !messages.length ? (
            <EmptyState icon={<WifiOff size={18} />} title="Chat is reconnecting" body="We’ll load the conversation as soon as the connection is back." />
          ) : !visible.length ? (
            <EmptyState icon={<MessageSquare size={18} />} title="It’s quiet in here" body={status?.canSend ? 'Say hello — be the first to start the conversation.' : 'Messages from players will appear here.'} className="h-full" />
          ) : (
            <ChatRowContext.Provider value={ctx}>
              {/* Short conversations sit at the bottom, next to the composer. */}
              <div className="flex min-h-full flex-col justify-end">
                {visible.map((m, i) => (
                  <MessageRow key={m.id} m={m} grouped={isGrouped(visible[i - 1], m)} mentionsMe={isMentioned(m, viewer.id)} highlight={highlight === m.id} />
                ))}
              </div>
            </ChatRowContext.Provider>
          )}
        </div>

        <AnimatePresence>
          {pending > 0 && !atBottom ? (
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: DUR.fast, ease: EASE.out }}
              onClick={() => {
                scrollToBottom(true);
                setPending(0);
              }}
              className="absolute bottom-[92px] left-1/2 z-10 flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full border border-accent/40 bg-accent px-3.5 text-xs font-semibold text-white shadow-[0_8px_24px_-8px_#7c5cffaa]"
              data-testid="new-messages-pill"
            >
              <ArrowDown size={13} />
              {pending} new message{pending === 1 ? '' : 's'}
            </motion.button>
          ) : !atBottom ? (
            <motion.button
              type="button"
              aria-label="Jump to latest"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: DUR.fast }}
              onClick={() => scrollToBottom(true)}
              className="absolute bottom-[92px] right-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-line-strong bg-surface-3 text-fg-muted shadow-2 hover:text-fg"
            >
              <ArrowDown size={14} />
            </motion.button>
          ) : null}
        </AnimatePresence>

        {/* Composer */}
        <div className={cn('shrink-0 border-t border-line-soft px-3 pt-3', variant === 'drawer' ? 'pb-3' : 'pb-3')}>
          <Composer status={status} />
        </div>
      </div>

      <ModerationDialog spec={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

function isGrouped(prev: ChatMessageDTO | undefined, m: ChatMessageDTO) {
  return (
    !!prev &&
    prev.user.id === m.user.id &&
    !m.replyTo &&
    new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < GROUP_WINDOW_MS
  );
}
