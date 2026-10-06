/**
 * Blocked-word architecture. PURE (no server imports).
 *
 * The list below is the configurable source of truth. Each term is normalised
 * the same way as incoming text, so a single entry also catches common evasion:
 *   • case + accents + full-width forms (NFKD)        "ＦÜck"   → fuck
 *   • leetspeak substitutions                          "sh1t", "$hit", "a$$"
 *   • separators between letters                       "f.u.c.k", "s h i t"
 *   • stretched letters                                "fuuuuck"
 *
 * Matches must start at a word boundary (and end at one unless the term is a
 * `stem`), which avoids the classic "Scunthorpe" false positives ("class",
 * "assassin", "Dickens" with stem=false…).
 *
 *   action 'mask'   → matched characters are replaced with '*'; message is sent.
 *   action 'reject' → message is refused (harassment, scams, solicitation).
 */
export interface BlockedTerm {
  term: string;
  action: 'mask' | 'reject';
  /** Match words that merely start with the term (fuck → fucking). */
  stem?: boolean;
}

export const BLOCKED_TERMS: BlockedTerm[] = [
  // Profanity — masked.
  { term: 'fuck', action: 'mask', stem: true },
  { term: 'motherfucker', action: 'mask', stem: true },
  { term: 'shit', action: 'mask', stem: true },
  { term: 'bullshit', action: 'mask', stem: true },
  { term: 'cunt', action: 'mask', stem: true },
  { term: 'bitch', action: 'mask', stem: true },
  { term: 'asshole', action: 'mask', stem: true },
  { term: 'ass', action: 'mask' },
  { term: 'bastard', action: 'mask', stem: true },
  { term: 'dick', action: 'mask' },
  { term: 'dickhead', action: 'mask', stem: true },
  { term: 'pussy', action: 'mask' },
  { term: 'wanker', action: 'mask', stem: true },
  { term: 'twat', action: 'mask', stem: true },
  { term: 'prick', action: 'mask' },
  { term: 'whore', action: 'mask', stem: true },
  { term: 'slut', action: 'mask', stem: true },
  { term: 'retard', action: 'mask', stem: true },
  // Harassment / self-harm encouragement — rejected.
  { term: 'kys', action: 'reject' },
  { term: 'kill yourself', action: 'reject', stem: true },
  { term: 'go die', action: 'reject' },
  { term: 'neck yourself', action: 'reject', stem: true },
  // Scams & solicitation — rejected (play-money only; nothing is for sale).
  { term: 'send me your password', action: 'reject', stem: true },
  { term: 'give me your password', action: 'reject', stem: true },
  { term: 'free credits at', action: 'reject', stem: true },
  { term: 'buy credits', action: 'reject', stem: true },
  { term: 'sell credits', action: 'reject', stem: true },
  { term: 'cashout credits', action: 'reject', stem: true },
];

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '9': 'g',
  '@': 'a',
  '$': 's',
  '!': 'i',
  '+': 't',
  '€': 'e',
  '£': 'l',
};

const LETTERLIKE = /[\p{L}\p{N}]/u;

/** Fold one code point to its matching form ('' when it is a separator). */
export function foldChar(ch: string): string {
  if (ch in LEET) return LEET[ch];
  const base = ch.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
  if (!base) return '';
  return LETTERLIKE.test(base) ? base : '';
}

interface StreamItem {
  c: string;
  start: number; // UTF-16 index in the original text
  end: number;
  wordStart: boolean;
  wordEnd: boolean;
}

function isWordChar(ch: string | undefined) {
  return ch !== undefined && foldChar(ch) !== '';
}

/**
 * Letters-only stream with back-references to the original text. Separators
 * are dropped, so "f.u.c.k" becomes "fuck" — and because each letter keeps its
 * own word-boundary flags, spaced-out evasion still satisfies the boundary
 * rules while "class" (no boundary before "ass") does not.
 */
function buildStream(text: string): StreamItem[] {
  const cps: { ch: string; i: number }[] = [];
  for (let i = 0; i < text.length; ) {
    const ch = String.fromCodePoint(text.codePointAt(i)!);
    cps.push({ ch, i });
    i += ch.length;
  }
  const stream: StreamItem[] = [];
  for (let k = 0; k < cps.length; k++) {
    const { ch, i } = cps[k];
    const f = foldChar(ch);
    if (!f) continue;
    stream.push({ c: f, start: i, end: i + ch.length, wordStart: !isWordChar(cps[k - 1]?.ch), wordEnd: !isWordChar(cps[k + 1]?.ch) });
  }
  return stream;
}

/** Normalise a term into its matching key (same folding as incoming text). */
export function normaliseTerm(term: string): string {
  return buildStream(term)
    .map((s) => s.c)
    .join('');
}

/**
 * Run-tolerant pattern: every letter may be stretched ("fuuuck"), but a
 * doubled letter in the term must stay doubled ("ass" never matches "as").
 */
function termPattern(key: string): RegExp {
  let src = '';
  const chars = [...key];
  for (let i = 0; i < chars.length; ) {
    let j = i;
    while (j < chars.length && chars[j] === chars[i]) j++;
    const n = j - i;
    const c = chars[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // The final run is lazy; the matcher then extends it within the same word
    // only, so "sh1t then" never swallows the "t" of the next word.
    const last = j >= chars.length;
    src += n === 1 ? `${c}+${last ? '?' : ''}` : `${c}{${n},}${last ? '?' : ''}`;
    i = j;
  }
  return new RegExp(src, 'gu');
}

const COMPILED = new WeakMap<BlockedTerm[], { re: RegExp; t: BlockedTerm }[]>();
function compile(terms: BlockedTerm[]) {
  let c = COMPILED.get(terms);
  if (!c) {
    c = terms
      .map((t) => ({ key: normaliseTerm(t.term), t }))
      .filter((x) => x.key.length > 0)
      .map(({ key, t }) => ({ re: termPattern(key), t }));
    COMPILED.set(terms, c);
  }
  return c;
}

export interface ModerationResult {
  action: 'allow' | 'mask' | 'reject';
  text: string;
  matches: string[];
}

export function moderateText(text: string, terms: BlockedTerm[] = BLOCKED_TERMS): ModerationResult {
  const stream = buildStream(text);
  // Folded letters can be several code units (ligatures: "ﬁ" → "fi"), so map
  // every code unit of the letters string back to its stream item.
  let letters = '';
  const owner: number[] = [];
  stream.forEach((s, k) => {
    letters += s.c;
    for (let u = 0; u < s.c.length; u++) owner.push(k);
  });

  const spans: [number, number][] = [];
  const matches = new Set<string>();
  let reject = false;
  for (const { re, t } of compile(terms)) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(letters))) {
      re.lastIndex = m.index + 1;
      const a = owner[m.index];
      let b = owner[m.index + m[0].length - 1];
      while (b + 1 < stream.length && stream[b + 1].c === stream[b].c && !stream[b + 1].wordStart) b++;
      const first = stream[a];
      const last = stream[b];
      if (!first.wordStart) continue;
      if (!t.stem && !last.wordEnd) continue;
      matches.add(t.term);
      if (t.action === 'reject') reject = true;
      else spans.push([first.start, last.end]);
    }
  }
  if (reject) return { action: 'reject', text, matches: [...matches] };
  if (!spans.length) return { action: 'allow', text, matches: [] };
  const chars = text.split('');
  for (const [s, e] of spans) {
    for (let i = s; i < e; i++) if (!/\s/.test(chars[i])) chars[i] = '*';
  }
  return { action: 'mask', text: chars.join(''), matches: [...matches] };
}
