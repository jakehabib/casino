/**
 * Wire types for Launch (crash), shared by the server (socket + REST) and the
 * client. All timestamps are epoch milliseconds in SERVER time; multipliers
 * are integers ×100; Credits are integers.
 */
export type CrashRoundStatus = 'WAITING' | 'BETTING_LOCKED' | 'RUNNING' | 'CRASHED' | 'SETTLED';
export type CrashBetStatus = 'ACTIVE' | 'CASHED_OUT' | 'LOST' | 'REFUNDED';

export interface CrashPublicUser {
  username: string;
  displayName: string;
  level: number;
  avatarUrl: string | null;
  /** Private profiles are shown anonymised. */
  hidden?: boolean;
}

export interface CrashRoundPublic {
  id: string;
  number: number;
  status: CrashRoundStatus;
  seedHash: string;
  salt: string;
  bettingEndsAt: number;
  startedAt: number | null;
  crashedAt: number | null;
  serverTime: number;
  /** Only once the round has crashed. */
  crashPoint?: number;
  /** Only once the round has crashed. */
  seed?: string;
  /** Dev-forced / voided rounds are not verifiable. */
  forced?: boolean;
  voided?: boolean;
}

export interface CrashBetPublic {
  id: string;
  user: CrashPublicUser;
  slot: 0 | 1;
  amount: number;
  cashoutAt: number | null;
  payout: number | null;
  status: CrashBetStatus;
}

/** The viewer's own bet (includes private fields). */
export interface CrashMyBet extends CrashBetPublic {
  roundId: string;
  autoCashout: number | null;
  clientRequestId: string;
}

export interface CrashSnapshot {
  round: CrashRoundPublic | null;
  bets: CrashBetPublic[];
  /** Present when the viewer is signed in. */
  me?: CrashMyBet[];
}

export interface CrashHistoryItem {
  id: string;
  number: number;
  crashPoint: number;
}

export interface CrashStatePayload extends CrashSnapshot {
  history: CrashHistoryItem[];
  myRecent: {
    id: string;
    roundNumber: number;
    slot: 0 | 1;
    amount: number;
    cashoutAt: number | null;
    payout: number;
    status: CrashBetStatus;
    crashPoint: number | null;
    createdAt: string;
  }[];
  config: { minBet: number; maxBet: number; maxAutoCashoutX100: number; enabled: boolean };
}

export interface CrashTick {
  /** multiplier ×100 */
  m: number;
  /** server time */
  t: number;
}

export interface CrashCashoutEvent {
  roundId: string;
  betId: string;
  username: string;
  slot: 0 | 1;
  cashoutAt: number;
  payout: number;
}

export interface CrashBetEvent {
  roundId: string;
  bet: CrashBetPublic;
}

export interface CrashRoundInfo {
  id: string;
  number: number;
  crashPoint: number | null;
  seedHash: string;
  seed: string | null;
  salt: string;
  startedAt: number | null;
  crashedAt: number | null;
  players: number;
  totalWagered: number;
  totalPaid: number;
  forced: boolean;
  voided: boolean;
}

export interface CrashRoundDetailData {
  roundId: string;
  roundNumber: number;
  slot: 0 | 1;
  amount: number;
  autoCashout: number | null;
  cashoutAt: number | null;
  payout: number;
  status: CrashBetStatus;
  crashPoint: number | null;
  startedAt: number | null;
  crashedAt: number | null;
}
