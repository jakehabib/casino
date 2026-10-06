/**
 * Message tokenisation for rendering + server-side mention/URL extraction.
 * PURE (no server imports) — the client renders these tokens as React text
 * nodes. Raw HTML is never produced or interpreted.
 *
 * URL policy:
 *   • only http(s) URLs (or "www." shorthand) are recognised; any other scheme
 *     (javascript:, data:, vbscript:, file: …) is plain text;
 *   • links are clickable ONLY when the host is on the allowlist; everything
 *     else renders as inert, non-clickable text;
 *   • clickable links always open with rel="nofollow noopener noreferrer".
 */
export const LINK_ALLOWLIST = [
  'youtube.com',
  'youtu.be',
  'twitch.tv',
  'x.com',
  'twitter.com',
  'github.com',
  'wikipedia.org',
  'reddit.com',
];

export type MessageToken =
  | { type: 'text'; text: string }
  | { type: 'mention'; text: string; username: string }
  | { type: 'link'; text: string; href: string }
  | { type: 'url'; text: string };

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const MENTION_RE = /(^|[^A-Za-z0-9_@])@([A-Za-z0-9_]{3,20})(?![A-Za-z0-9_])/g;
const TRAILING_PUNCT = /[.,!?;:)\]}'"…]+$/;

export function hostAllowed(host: string, allow: readonly string[]): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  return allow.some((d) => h === d || h.endsWith(`.${d}`));
}

/** Parse a candidate URL; only http/https with a real hostname survive. */
export function safeUrl(raw: string): URL | null {
  const candidate = /^www\./i.test(raw) ? `https://${raw}` : raw;
  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!u.hostname || !u.hostname.includes('.')) return null;
  if (u.username || u.password) return null; // "https://good.com@evil.com"
  return u;
}

export function findUrls(text: string): { index: number; raw: string }[] {
  const out: { index: number; raw: string }[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const raw = m[0].replace(TRAILING_PUNCT, '');
    if (raw.length > 4) out.push({ index: m.index!, raw });
  }
  return out;
}

export function countUrls(text: string): number {
  return findUrls(text).length;
}

/** Unique lowercase @handles in a message (max 5 resolved per message). */
export function extractMentionHandles(text: string, max = 5): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(MENTION_RE)) {
    seen.add(m[2].toLowerCase());
    if (seen.size >= max) break;
  }
  return [...seen];
}

function pushText(tokens: MessageToken[], text: string) {
  if (!text) return;
  const last = tokens[tokens.length - 1];
  if (last?.type === 'text') last.text += text;
  else tokens.push({ type: 'text', text });
}

function tokenizeMentions(tokens: MessageToken[], text: string, mentions: ReadonlySet<string>) {
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const handle = m[2].toLowerCase();
    if (!mentions.has(handle)) continue;
    const at = m.index! + m[1].length;
    pushText(tokens, text.slice(last, at));
    tokens.push({ type: 'mention', text: `@${m[2]}`, username: handle });
    last = at + 1 + m[2].length;
  }
  pushText(tokens, text.slice(last));
}

/**
 * Split a stored message into render tokens. `mentions` are the resolved
 * (existing-user) lowercase usernames; unresolved @handles stay plain text.
 */
export function tokenizeMessage(
  text: string,
  opts: { mentions?: Iterable<string>; allowHosts?: readonly string[] } = {},
): MessageToken[] {
  const mentions = new Set([...(opts.mentions ?? [])].map((m) => m.toLowerCase()));
  const allow = opts.allowHosts ?? LINK_ALLOWLIST;
  const tokens: MessageToken[] = [];
  let last = 0;
  for (const { index, raw } of findUrls(text)) {
    tokenizeMentions(tokens, text.slice(last, index), mentions);
    const u = safeUrl(raw);
    if (u && hostAllowed(u.hostname, allow)) tokens.push({ type: 'link', text: raw, href: u.href });
    else tokens.push({ type: 'url', text: raw });
    last = index + raw.length;
  }
  tokenizeMentions(tokens, text.slice(last), mentions);
  return tokens;
}
