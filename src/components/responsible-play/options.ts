/**
 * Client-safe description of the break / exclusion options. Durations mirror
 * EXCLUSION_OPTIONS + computeEndsAt in src/server/services/responsible-play/
 * exclusions.ts (parity is asserted in tests/integration/responsible-play.test.ts).
 * The server remains the source of truth for the actual end time.
 */
export type ExclusionType =
  | 'COOLDOWN_24H'
  | 'COOLDOWN_72H'
  | 'LOCK_1W'
  | 'EXCLUSION_1M'
  | 'EXCLUSION_3M'
  | 'EXCLUSION_6M'
  | 'EXCLUSION_1Y'
  | 'EXCLUSION_INDEFINITE';

export interface ExclusionOption {
  type: ExclusionType;
  kind: 'COOLDOWN' | 'SELF_EXCLUSION';
  title: string;
  /** Short duration label for compact UI. */
  duration: string;
  blurb: string;
  durationMs?: number;
  months?: number;
  /** Shown behind the "Longer self-exclusion" disclosure. */
  extended?: boolean;
}

const HOUR = 3600_000;

export const EXCLUSION_LIST: ExclusionOption[] = [
  {
    type: 'COOLDOWN_24H',
    kind: 'COOLDOWN',
    title: 'Take a 24-hour break',
    duration: '24 hours',
    blurb: 'A short pause from all casino play.',
    durationMs: 24 * HOUR,
  },
  {
    type: 'COOLDOWN_72H',
    kind: 'COOLDOWN',
    title: 'Take a 72-hour break',
    duration: '72 hours',
    blurb: 'Three days away from wagering.',
    durationMs: 72 * HOUR,
  },
  {
    type: 'LOCK_1W',
    kind: 'COOLDOWN',
    title: 'Lock play for 1 week',
    duration: '1 week',
    blurb: 'A week-long cooldown on all games.',
    durationMs: 7 * 24 * HOUR,
  },
  {
    type: 'EXCLUSION_1M',
    kind: 'SELF_EXCLUSION',
    title: 'Self-exclude for 1 month',
    duration: '1 month',
    blurb: 'A longer, firmer step back from play.',
    months: 1,
  },
  { type: 'EXCLUSION_3M', kind: 'SELF_EXCLUSION', title: 'Self-exclude for 3 months', duration: '3 months', blurb: 'Play disabled for three months.', months: 3, extended: true },
  { type: 'EXCLUSION_6M', kind: 'SELF_EXCLUSION', title: 'Self-exclude for 6 months', duration: '6 months', blurb: 'Play disabled for six months.', months: 6, extended: true },
  { type: 'EXCLUSION_1Y', kind: 'SELF_EXCLUSION', title: 'Self-exclude for 1 year', duration: '1 year', blurb: 'Play disabled for twelve months.', months: 12, extended: true },
  {
    type: 'EXCLUSION_INDEFINITE',
    kind: 'SELF_EXCLUSION',
    title: 'Self-exclude indefinitely',
    duration: 'No end date',
    blurb: 'Play stays disabled until a support review, after a waiting period.',
    extended: true,
  },
];

export const EXCLUSION_BY_TYPE = Object.fromEntries(EXCLUSION_LIST.map((o) => [o.type, o])) as Record<ExclusionType, ExclusionOption>;

/** Same calendar arithmetic as the server (UTC months, clamped to month end). */
export function computeEndsAt(type: ExclusionType, start: Date): Date | null {
  const opt = EXCLUSION_BY_TYPE[type];
  if (opt.durationMs) return new Date(start.getTime() + opt.durationMs);
  if (opt.months) {
    const d = new Date(start.getTime());
    const day = d.getUTCDate();
    d.setUTCMonth(d.getUTCMonth() + opt.months);
    if (d.getUTCDate() < day) d.setUTCDate(0);
    return d;
  }
  return null;
}

export function confirmPhrase(type: ExclusionType): 'CONFIRM' | 'EXCLUDE' {
  return EXCLUSION_BY_TYPE[type].kind === 'SELF_EXCLUSION' ? 'EXCLUDE' : 'CONFIRM';
}

/** What a restriction does and does not affect (shown before confirming and while active). */
export const BLOCKED_FEATURES = [
  'No new wagers in any game',
  'No slot spins (including saved free spins)',
  'No Blackjack or Baccarat deals',
  'No Roulette wagers',
  'No Crash bets',
  'No wagering-dependent rewards (weekly bonus, level rewards)',
];

export const ALLOWED_FEATURES = [
  'Log in and view your account',
  'View your game history and wallet',
  'Contact support',
  'Read chat',
];

/** Common IANA zones offered in the timezone select (plus detected + current). */
export const COMMON_TIMEZONES = [
  'UTC',
  'Pacific/Honolulu',
  'America/Anchorage',
  'America/Los_Angeles',
  'America/Denver',
  'America/Phoenix',
  'America/Chicago',
  'America/New_York',
  'America/Halifax',
  'America/Sao_Paulo',
  'Atlantic/Reykjavik',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Lisbon',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Stockholm',
  'Europe/Warsaw',
  'Europe/Athens',
  'Europe/Helsinki',
  'Europe/Istanbul',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Cairo',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Perth',
  'Australia/Adelaide',
  'Australia/Sydney',
  'Pacific/Auckland',
];

/** "UTC−04:00" style offset label for a zone at an instant. */
export function offsetLabel(tz: string, at = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(at);
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    return name === 'GMT' ? 'UTC±00:00' : name.replace('GMT', 'UTC').replace('-', '−');
  } catch {
    return '';
  }
}

export function detectTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** "October 13, 2026 at 4:32 PM" in the viewer's locale (and optional zone). */
export function formatLongDateTime(d: Date | string, tz?: string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short', timeZone: tz }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

/** Live "2d 4h 12m" / "4h 12m 09s" countdown text. */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return `${d}d ${h}h ${pad(m)}m`;
  if (h > 0) return `${h}h ${pad(m)}m ${pad(sec)}s`;
  return `${m}m ${pad(sec)}s`;
}
