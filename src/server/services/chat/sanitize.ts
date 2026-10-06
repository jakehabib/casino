/**
 * Chat text sanitisation. PURE — no server imports, safe to use from the
 * client (the composer mirrors these limits so the counter is honest).
 *
 * Messages are always rendered as React text nodes, never as HTML. This module
 * removes characters that are invisible, direction-changing or otherwise used
 * for spoofing/evasion, and normalises whitespace so a message is one line.
 */
export const CHAT_MAX_LENGTH = 300;

/** Max run of one repeated character kept after normalisation ("niiiiiice"). */
export const MAX_CHAR_RUN = 6;

// C0/C1 control characters (tab/newline are converted to spaces first).
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g;
// Zero-width, joiners, bidi overrides/isolates, soft hyphen, filler characters.
const INVISIBLE =
  /[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-︎﻿ﾠ￹-￻]/g;
// "Zalgo" stacks: more than two combining marks on one base character.
const MARK_STACK = /(\p{M}{2})\p{M}+/gu;
const WS = /\s+/gu;

/** Number of user-perceived characters we count against the limit (code points). */
export function chatLength(text: string): number {
  let n = 0;
  for (const _ of text) n++;
  return n;
}

/** Collapse runs of the same character longer than `max`. */
export function collapseRuns(text: string, max = MAX_CHAR_RUN): string {
  const out: string[] = [];
  let prev = '';
  let run = 0;
  for (const ch of text) {
    if (ch === prev) run++;
    else {
      prev = ch;
      run = 1;
    }
    if (run <= max) out.push(ch);
  }
  return out.join('');
}

export function sanitizeChatText(raw: string): string {
  return collapseRuns(
    String(raw ?? '')
      .normalize('NFC')
      .replace(/[\t\n\r\v\f  ]/g, ' ')
      .replace(CONTROL, '')
      .replace(INVISIBLE, '')
      .replace(MARK_STACK, '$1')
      .replace(WS, ' ')
      .trim(),
  );
}

export type ChatTextError = 'EMPTY' | 'TOO_LONG';

export function validateChatText(raw: string): { ok: true; text: string } | { ok: false; error: ChatTextError; text: string } {
  const text = sanitizeChatText(raw);
  if (!text) return { ok: false, error: 'EMPTY', text };
  if (chatLength(text) > CHAT_MAX_LENGTH) return { ok: false, error: 'TOO_LONG', text };
  return { ok: true, text };
}
