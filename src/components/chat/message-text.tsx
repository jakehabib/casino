'use client';
import { Fragment, memo, useMemo, useSyncExternalStore } from 'react';
import { LINK_ALLOWLIST, tokenizeMessage } from '@/server/services/chat/message-format';
import { PlayerCardPopover } from '@/components/profile/player-card';
import { cn } from '@/lib/cn';

/**
 * Renders a chat message as React text nodes ONLY. Never uses
 * dangerouslySetInnerHTML; URLs are clickable only for allowlisted hosts and
 * always open with rel="nofollow noopener noreferrer".
 */
export const MessageText = memo(function MessageText({
  text,
  mentions,
  me,
}: {
  text: string;
  mentions: { id: string; username: string }[];
  me?: string | null;
}) {
  const tokens = useMemo(() => {
    const allow = typeof window !== 'undefined' ? [...LINK_ALLOWLIST, window.location.hostname] : LINK_ALLOWLIST;
    return tokenizeMessage(text, { mentions: mentions.map((m) => m.username), allowHosts: allow });
  }, [text, mentions]);
  return (
    <>
      {tokens.map((t, i) => {
        if (t.type === 'text') return <Fragment key={i}>{t.text}</Fragment>;
        if (t.type === 'mention') {
          const self = !!me && t.username === me.toLowerCase();
          return (
            <PlayerCardPopover key={i} username={t.username}>
              <button
                type="button"
                className={cn(
                  'rounded-[4px] font-semibold text-accent transition-colors hover:text-accent-hover',
                  self && 'bg-accent/20 px-1 text-[#b9a8ff]',
                )}
              >
                {t.text}
              </button>
            </PlayerCardPopover>
          );
        }
        if (t.type === 'link') {
          return (
            <a
              key={i}
              href={t.href}
              target="_blank"
              rel="nofollow noopener noreferrer ugc"
              className="text-info underline decoration-info/40 underline-offset-2 transition-colors hover:decoration-info"
            >
              {t.text}
            </a>
          );
        }
        return (
          <span key={i} className="text-fg-subtle" title="Links to other sites aren’t clickable in chat">
            {t.text}
          </span>
        );
      })}
    </>
  );
});

// ── Shared minute clock (one interval for every timestamp) ─────────────

let now = Date.now();
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
function subscribe(cb: () => void) {
  subs.add(cb);
  if (!timer) {
    timer = setInterval(() => {
      now = Date.now();
      subs.forEach((s) => s());
    }, 20_000);
  }
  return () => {
    subs.delete(cb);
    if (!subs.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

const clockFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
const fullFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function relativeShort(iso: string, at: number): string {
  const t = new Date(iso).getTime();
  const diff = at - t;
  if (diff < 45_000) return 'now';
  if (diff < 3_600_000) return `${Math.max(1, Math.round(diff / 60_000))}m`;
  if (diff < 6 * 3_600_000) return `${Math.round(diff / 3_600_000)}h`;
  return new Date(t).toDateString() === new Date(at).toDateString() ? clockFmt.format(t) : dayFmt.format(t);
}

export function RelTime({ iso, className }: { iso: string; className?: string }) {
  const at = useSyncExternalStore(subscribe, () => now, () => now);
  return (
    <time dateTime={iso} title={fullFmt.format(new Date(iso))} className={cn('tabular shrink-0 text-[10.5px] text-fg-faint', className)}>
      {relativeShort(iso, Math.max(at, Date.now() - 1))}
    </time>
  );
}
