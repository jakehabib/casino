/**
 * Standardised error codes shared by server and client. The client maps these
 * to native, friendly error states — raw server errors are never shown.
 */
export const ReasonCodes = {
  // Wager eligibility (WagerEligibilityService)
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  COOLDOWN_ACTIVE: 'COOLDOWN_ACTIVE',
  SELF_EXCLUDED: 'SELF_EXCLUDED',
  DAILY_WAGER_LIMIT: 'DAILY_WAGER_LIMIT',
  DAILY_LOSS_LIMIT: 'DAILY_LOSS_LIMIT',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  GAME_DISABLED: 'GAME_DISABLED',
  BET_TOO_LOW: 'BET_TOO_LOW',
  BET_TOO_HIGH: 'BET_TOO_HIGH',
  MAINTENANCE: 'MAINTENANCE',
  // Generic
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION: 'VALIDATION',
  RATE_LIMITED: 'RATE_LIMITED',
  CONFLICT: 'CONFLICT',
  INVALID_ACTION: 'INVALID_ACTION',
  ROUND_IN_PROGRESS: 'ROUND_IN_PROGRESS',
  ROUND_CLOSED: 'ROUND_CLOSED',
  ACTION_UNAVAILABLE: 'ACTION_UNAVAILABLE',
  NOT_ELIGIBLE: 'NOT_ELIGIBLE',
  ALREADY_CLAIMED: 'ALREADY_CLAIMED',
  CHAT_MUTED: 'CHAT_MUTED',
  CHAT_BANNED: 'CHAT_BANNED',
  INTERNAL: 'INTERNAL',
} as const;

export type ReasonCode = (typeof ReasonCodes)[keyof typeof ReasonCodes];

export interface ApiErrorBody {
  error: { code: ReasonCode; message: string; details?: Record<string, unknown> };
}

/** Friendly copy for each code (titles used by native error states). */
export const ReasonCopy: Record<ReasonCode, { title: string; message: string }> = {
  ACCOUNT_LOCKED: { title: 'Account locked', message: 'This account cannot place wagers.' },
  ACCOUNT_SUSPENDED: { title: 'Account suspended', message: 'Play is unavailable while your account is suspended.' },
  COOLDOWN_ACTIVE: { title: 'Play currently disabled', message: 'You have an active break in place.' },
  SELF_EXCLUDED: { title: 'Play currently disabled', message: 'You have an active self-exclusion.' },
  DAILY_WAGER_LIMIT: { title: 'Daily wager limit reached', message: 'This wager would exceed your daily wager limit.' },
  DAILY_LOSS_LIMIT: { title: 'Daily loss limit reached', message: 'This wager could exceed your daily loss limit.' },
  INSUFFICIENT_BALANCE: { title: 'Insufficient Credits', message: 'You don’t have enough Credits for this wager.' },
  GAME_DISABLED: { title: 'Game temporarily unavailable', message: 'This game is currently unavailable.' },
  BET_TOO_LOW: { title: 'Bet below minimum', message: 'Increase your bet to meet the table minimum.' },
  BET_TOO_HIGH: { title: 'Bet above maximum', message: 'Reduce your bet to the table maximum.' },
  MAINTENANCE: { title: 'Scheduled maintenance', message: 'Games are paused for maintenance. Please check back shortly.' },
  UNAUTHENTICATED: { title: 'Sign in required', message: 'Please sign in to continue.' },
  FORBIDDEN: { title: 'Not allowed', message: 'You don’t have permission to do that.' },
  NOT_FOUND: { title: 'Not found', message: 'We couldn’t find what you were looking for.' },
  VALIDATION: { title: 'Check your input', message: 'Some of the details provided are invalid.' },
  RATE_LIMITED: { title: 'Slow down', message: 'Too many requests. Please wait a moment.' },
  CONFLICT: { title: 'Already in progress', message: 'This request was already processed.' },
  INVALID_ACTION: { title: 'Action not available', message: 'That action isn’t available right now.' },
  ROUND_IN_PROGRESS: { title: 'Round already started', message: 'Finish the current round first.' },
  ROUND_CLOSED: { title: 'Round closed', message: 'Betting for this round has closed.' },
  ACTION_UNAVAILABLE: { title: 'Action no longer available', message: 'That action is no longer available.' },
  NOT_ELIGIBLE: { title: 'Not eligible yet', message: 'You aren’t eligible for this right now.' },
  ALREADY_CLAIMED: { title: 'Already claimed', message: 'You’ve already claimed this reward.' },
  CHAT_MUTED: { title: 'You are muted', message: 'You can’t send messages right now.' },
  CHAT_BANNED: { title: 'Chat unavailable', message: 'You are banned from chat.' },
  INTERNAL: { title: 'Something went wrong', message: 'Please try again in a moment.' },
};

export class AppError extends Error {
  readonly code: ReasonCode;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ReasonCode, message?: string, details?: Record<string, unknown>, status?: number) {
    super(message ?? ReasonCopy[code]?.message ?? code);
    this.code = code;
    this.details = details;
    this.status = status ?? defaultStatus(code);
  }
}

function defaultStatus(code: ReasonCode): number {
  switch (code) {
    case 'UNAUTHENTICATED':
      return 401;
    case 'FORBIDDEN':
    case 'ACCOUNT_LOCKED':
    case 'ACCOUNT_SUSPENDED':
    case 'COOLDOWN_ACTIVE':
    case 'SELF_EXCLUDED':
    case 'CHAT_BANNED':
    case 'CHAT_MUTED':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'RATE_LIMITED':
      return 429;
    case 'CONFLICT':
    case 'ROUND_IN_PROGRESS':
    case 'ALREADY_CLAIMED':
      return 409;
    case 'INTERNAL':
      return 500;
    case 'MAINTENANCE':
    case 'GAME_DISABLED':
      return 503;
    default:
      return 400;
  }
}
