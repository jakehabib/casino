/**
 * Spam heuristics. PURE (no server imports). The chat service applies the
 * policy (windows, limits) using these classifiers.
 */

/** Window in which an identical (normalised) message from the same user is refused. */
export const DUPLICATE_WINDOW_MS = 60_000;
/** Burst limit: at most RATE_LIMIT_COUNT messages per RATE_LIMIT_WINDOW_MS. */
export const RATE_LIMIT_COUNT = 5;
export const RATE_LIMIT_WINDOW_MS = 10_000;
/** "Noisy" messages (shouting / heavy repetition) are throttled to one per window. */
export const NOISY_WINDOW_MS = 30_000;
/** Maximum URLs in one message. */
export const MAX_LINKS = 2;

/**
 * Fingerprint used for duplicate detection: case/accents/leet folded, all
 * separators removed and letter runs collapsed — "Hello!!", "h e l l o" and
 * "HELLOOOO" all collide.
 */
export function spamFingerprint(text: string): string {
  let out = '';
  let prev = '';
  for (const ch of text) {
    const f = ch.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
    if (!f || !/^[\p{L}\p{N}]+$/u.test(f) || f === prev) continue;
    out += f;
    prev = f;
  }
  return out;
}

/** True when a message is mostly capitals (with enough letters to judge). */
export function isShouting(text: string): boolean {
  let letters = 0;
  let upper = 0;
  for (const ch of text) {
    if (/\p{L}/u.test(ch)) {
      letters++;
      if (ch !== ch.toLowerCase() && ch === ch.toUpperCase()) upper++;
    }
  }
  return letters >= 10 && upper / letters >= 0.7;
}

/**
 * Excessive repetition: a single character repeated 5+ times (after the
 * sanitiser has already capped runs at 6), or one word repeated 4+ times in a row,
 * or a message that is mostly one repeating short pattern ("hahahahahahaha").
 */
export function isRepetitive(text: string): boolean {
  if (/(.)\1{4,}/u.test(text.replace(/\s/g, ''))) return true;
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  let run = 1;
  for (let i = 1; i < words.length; i++) {
    run = words[i] === words[i - 1] ? run + 1 : 1;
    if (run >= 4) return true;
  }
  const compact = text.toLowerCase().replace(/\s/g, '');
  if (compact.length >= 16) {
    for (let p = 1; p <= 4; p++) {
      const unit = compact.slice(0, p);
      if (unit.repeat(Math.ceil(compact.length / p)).slice(0, compact.length) === compact) return true;
    }
  }
  return false;
}

export function isNoisy(text: string): boolean {
  return isShouting(text) || isRepetitive(text);
}
