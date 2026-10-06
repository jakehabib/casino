/** Wire types shared by the chat server and client. PURE. */
export const CHAT_ROOM = 'global';
export const CHAT_SOCKET_ROOM = 'chat:global';
export const CHAT_HISTORY_LIMIT = 50;

export type ChatRole = 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN';

export interface ChatUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  role: ChatRole;
}

export interface ChatMessageDTO {
  id: string;
  room: string;
  content: string;
  createdAt: string;
  user: ChatUser;
  /** Resolved mentions (existing users only). */
  mentions: { id: string; username: string }[];
  replyTo: {
    id: string;
    content: string;
    deleted: boolean;
    user: { id: string; username: string; displayName: string };
  } | null;
  /** Echo of the sender's client id (lets the sender reconcile its own send). */
  clientId?: string | null;
}

export type ChatBlockReason =
  | 'GUEST'
  | 'CHAT_BANNED'
  | 'CHAT_MUTED'
  | 'ACCOUNT_SUSPENDED'
  | 'COOLDOWN_ACTIVE'
  | 'SELF_EXCLUDED';

export interface ChatStatus {
  canSend: boolean;
  reason: ChatBlockReason | null;
  /** End of the mute / suspension / break when time-limited. */
  until: string | null;
  slowModeSeconds: number;
  /** Viewer's role (null for guests) — drives which actions the UI offers. */
  role: ChatRole | null;
  userId: string | null;
}

export interface ChatJoinPayload {
  messages: ChatMessageDTO[];
  status: ChatStatus;
  blocked: string[];
}

export const MUTE_PRESETS = [
  { label: '10 minutes', short: '10m', seconds: 600 },
  { label: '1 hour', short: '1h', seconds: 3600 },
  { label: '24 hours', short: '24h', seconds: 86_400 },
] as const;

export const REPORT_REASONS = [
  { value: 'SPAM', label: 'Spam or flooding' },
  { value: 'HARASSMENT', label: 'Harassment or abuse' },
  { value: 'HATE', label: 'Hate speech' },
  { value: 'SCAM', label: 'Scam or solicitation' },
  { value: 'OTHER', label: 'Something else' },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

export const MAX_MUTE_SECONDS = 30 * 86_400;
