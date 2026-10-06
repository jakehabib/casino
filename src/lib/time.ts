/**
 * Timezone-aware day boundaries for responsible-play accounting. Daily limits
 * reset at local midnight in the user's chosen timezone.
 */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function partsIn(tz: string, at: Date) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p: Record<string, number> = {};
  for (const part of fmt.formatToParts(at)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return p as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Offset (ms) of `tz` relative to UTC at instant `at`. */
function tzOffsetMs(tz: string, at: Date): number {
  const p = partsIn(tz, at);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Local calendar date (YYYY-MM-DD) for `at` in `tz`. */
export function localDateKey(tz: string, at: Date = new Date()): string {
  const p = partsIn(tz, at);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** UTC midnight Date representing the local date — the DB @db.Date value. */
export function localDateAsUtcDate(tz: string, at: Date = new Date()): Date {
  return new Date(`${localDateKey(tz, at)}T00:00:00.000Z`);
}

/** The instant of the next local midnight in `tz` after `at`. */
export function nextLocalMidnight(tz: string, at: Date = new Date()): Date {
  const p = partsIn(tz, at);
  // Guess: next day 00:00 local, interpreted as UTC then corrected by offset.
  const guessUtc = Date.UTC(p.year, p.month - 1, p.day + 1, 0, 0, 0);
  let result = guessUtc - tzOffsetMs(tz, new Date(guessUtc));
  // Re-correct once for DST transitions.
  result = guessUtc - tzOffsetMs(tz, new Date(result));
  return new Date(result);
}
