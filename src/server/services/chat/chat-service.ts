import type { Prisma, Role } from '@prisma/client';
import { prisma, transaction, isUniqueViolation, type Tx } from '@/server/db';
import { redis } from '@/server/redis';
import { AppError } from '@/lib/errors';
import { logger } from '@/server/logger';
import { emitToUser } from '@/server/realtime/events';
import { getSetting } from '@/server/services/settings/settings-service';
import { getActiveExclusion, exclusionKind } from '@/server/services/responsible-play/exclusions';
import { hasRole } from '@/server/auth/tokens';
import { CHAT_MAX_LENGTH, validateChatText } from './sanitize';
import { moderateText } from './blocked-words';
import { countUrls, extractMentionHandles } from './message-format';
import {
  DUPLICATE_WINDOW_MS,
  MAX_LINKS,
  NOISY_WINDOW_MS,
  RATE_LIMIT_COUNT,
  RATE_LIMIT_WINDOW_MS,
  isNoisy,
  spamFingerprint,
} from './spam';
import { publishChat } from './bus';
import {
  CHAT_HISTORY_LIMIT,
  CHAT_ROOM,
  type ChatJoinPayload,
  type ChatMessageDTO,
  type ChatRole,
  type ChatStatus,
  type ReportReason,
} from './types';

type Db = Tx | typeof prisma;

const USER_SELECT = { id: true, username: true, displayName: true, avatarUrl: true, level: true, role: true } as const;

const MESSAGE_INCLUDE = {
  user: { select: USER_SELECT },
  replyTo: {
    select: {
      id: true,
      content: true,
      deletedAt: true,
      user: { select: { id: true, username: true, displayName: true } },
    },
  },
} satisfies Prisma.ChatMessageInclude;

type MessageRow = Prisma.ChatMessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>;

const QUOTE_LEN = 120;

function quote(text: string) {
  const chars = [...text];
  return chars.length > QUOTE_LEN ? `${chars.slice(0, QUOTE_LEN - 1).join('')}…` : text;
}

async function hydrate(db: Db, rows: MessageRow[], clientIds?: Map<string, string>): Promise<ChatMessageDTO[]> {
  const ids = [...new Set(rows.flatMap((r) => r.mentions))];
  const users = ids.length ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, username: true } }) : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => ({
    id: r.id,
    room: r.room,
    content: r.content,
    createdAt: r.createdAt.toISOString(),
    user: { ...r.user, role: r.user.role as ChatRole },
    mentions: r.mentions.map((id) => byId.get(id)).filter((u): u is { id: string; username: string } => !!u),
    replyTo: r.replyTo
      ? {
          id: r.replyTo.id,
          content: r.replyTo.deletedAt ? '' : quote(r.replyTo.content),
          deleted: !!r.replyTo.deletedAt,
          user: r.replyTo.user,
        }
      : null,
    clientId: clientIds?.get(r.id) ?? null,
  }));
}

// ── Status ────────────────────────────────────────────────

export async function getActiveMute(db: Db, userId: string, now = new Date()) {
  return db.chatMute.findFirst({
    where: { userId, liftedAt: null, expiresAt: { gt: now } },
    orderBy: { expiresAt: 'desc' },
  });
}

export async function getActiveBan(db: Db, userId: string) {
  return db.chatBan.findFirst({ where: { userId, liftedAt: null }, orderBy: { createdAt: 'desc' } });
}

/**
 * Whether a user may send. Order matters: account-level states first, then
 * chat sanctions, then responsible-play breaks (self-excluded players can
 * still READ chat but it is read-only for them — a deliberate, safer choice
 * that removes social pull back into play during a break).
 */
export async function getChatStatus(userId: string | null, db: Db = prisma, now = new Date()): Promise<ChatStatus> {
  const system = await getSetting('system', db as Tx);
  const base = { slowModeSeconds: system.chatSlowModeSeconds, userId };
  if (!userId) return { ...base, canSend: false, reason: 'GUEST', until: null, role: null };
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, status: true, suspendedUntil: true } });
  if (!user) return { ...base, canSend: false, reason: 'GUEST', until: null, role: null, userId: null };
  const role = user.role as ChatRole;
  if (user.status === 'BANNED') return { ...base, canSend: false, reason: 'CHAT_BANNED', until: null, role };
  if (user.status === 'SUSPENDED' && (!user.suspendedUntil || user.suspendedUntil > now)) {
    return { ...base, canSend: false, reason: 'ACCOUNT_SUSPENDED', until: user.suspendedUntil?.toISOString() ?? null, role };
  }
  const [ban, mute, ex] = await Promise.all([getActiveBan(db, userId), getActiveMute(db, userId, now), getActiveExclusion(db, userId, now)]);
  if (ban) return { ...base, canSend: false, reason: 'CHAT_BANNED', until: null, role };
  if (mute) return { ...base, canSend: false, reason: 'CHAT_MUTED', until: mute.expiresAt.toISOString(), role };
  if (ex) {
    return {
      ...base,
      canSend: false,
      reason: exclusionKind(ex.type) === 'COOLDOWN' ? 'COOLDOWN_ACTIVE' : 'SELF_EXCLUDED',
      until: ex.endsAt?.toISOString() ?? null,
      role,
    };
  }
  // Staff are exempt from slow mode.
  return { ...base, canSend: true, reason: null, until: null, role, slowModeSeconds: hasRole(role as Role, 'MODERATOR') ? 0 : base.slowModeSeconds };
}

function statusError(s: ChatStatus): AppError {
  const details = { reason: s.reason, until: s.until };
  switch (s.reason) {
    case 'GUEST':
      return new AppError('UNAUTHENTICATED', 'Sign in to chat.', details);
    case 'CHAT_BANNED':
      return new AppError('CHAT_BANNED', 'You are banned from chat.', details);
    case 'CHAT_MUTED':
      return new AppError('CHAT_MUTED', 'You are muted.', details);
    case 'ACCOUNT_SUSPENDED':
      return new AppError('ACCOUNT_SUSPENDED', 'Chat is read-only while your account is suspended.', details);
    case 'COOLDOWN_ACTIVE':
      return new AppError('COOLDOWN_ACTIVE', 'Chat is read-only during your break.', details);
    default:
      return new AppError('SELF_EXCLUDED', 'Chat is read-only during your self-exclusion.', details);
  }
}

// ── Blocks ────────────────────────────────────────────────

export async function getBlockedIds(userId: string): Promise<string[]> {
  const rows = await prisma.userBlock.findMany({ where: { blockerId: userId }, select: { blockedId: true } });
  return rows.map((r) => r.blockedId);
}

export async function listBlocks(userId: string) {
  const rows = await prisma.userBlock.findMany({
    where: { blockerId: userId },
    orderBy: { createdAt: 'desc' },
    include: { blocked: { select: USER_SELECT } },
  });
  return rows.map((r) => ({ ...r.blocked, role: r.blocked.role as ChatRole, blockedAt: r.createdAt.toISOString() }));
}

export async function setBlocked(blockerId: string, blockedId: string, blocked: boolean) {
  if (blockerId === blockedId) throw new AppError('INVALID_ACTION', 'You can’t block yourself.');
  const target = await prisma.user.findUnique({ where: { id: blockedId }, select: { id: true, role: true } });
  if (!target) throw new AppError('NOT_FOUND', 'Player not found.');
  if (blocked) {
    if (hasRole(target.role, 'MODERATOR')) throw new AppError('INVALID_ACTION', 'Staff accounts can’t be blocked.');
    await prisma.userBlock.createMany({ data: [{ blockerId, blockedId }], skipDuplicates: true });
  } else {
    await prisma.userBlock.deleteMany({ where: { blockerId, blockedId } });
  }
  const ids = await getBlockedIds(blockerId);
  await Promise.all([publishChat({ t: 'blocks', userId: blockerId }), emitToUser(blockerId, 'chat:blocks', { blocked: ids })]);
  return { blocked: ids };
}

// ── Reading ───────────────────────────────────────────────

/** Recent messages (oldest → newest), excluding deleted ones and authors the viewer blocked. */
export async function listRecent(opts: { viewerId?: string | null; limit?: number; room?: string } = {}): Promise<ChatMessageDTO[]> {
  const blocked = opts.viewerId ? await getBlockedIds(opts.viewerId) : [];
  const rows = await prisma.chatMessage.findMany({
    where: { room: opts.room ?? CHAT_ROOM, deletedAt: null, ...(blocked.length ? { userId: { notIn: blocked } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(opts.limit ?? CHAT_HISTORY_LIMIT, 100),
    include: MESSAGE_INCLUDE,
  });
  return hydrate(prisma, rows.reverse());
}

export async function joinPayload(viewerId: string | null): Promise<ChatJoinPayload> {
  const [messages, status, blocked] = await Promise.all([
    listRecent({ viewerId }),
    getChatStatus(viewerId),
    viewerId ? getBlockedIds(viewerId) : Promise.resolve([]),
  ]);
  return { messages, status, blocked };
}

// ── Sending ───────────────────────────────────────────────

export interface SendInput {
  userId: string;
  content: string;
  replyToId?: string | null;
  clientId?: string | null;
  room?: string;
  now?: Date;
}

function limited(message: string, retryAfterMs: number, reason: string) {
  return new AppError('RATE_LIMITED', message, { reason, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) });
}

const cidKey = (userId: string, clientId: string) => `chat:cid:${userId}:${clientId}`;

export async function sendMessage(input: SendInput): Promise<ChatMessageDTO> {
  const room = input.room ?? CHAT_ROOM;
  const clientId = input.clientId && /^[A-Za-z0-9_-]{6,64}$/.test(input.clientId) ? input.clientId : null;

  const v = validateChatText(input.content);
  if (!v.ok) {
    throw new AppError(
      'VALIDATION',
      v.error === 'EMPTY' ? 'Type a message first.' : `Messages can be up to ${CHAT_MAX_LENGTH} characters.`,
      { reason: v.error },
    );
  }
  const mod = moderateText(v.text);
  if (mod.action === 'reject') throw new AppError('VALIDATION', 'That message isn’t allowed in chat.', { reason: 'BLOCKED_CONTENT' });
  const text = mod.text;
  if (countUrls(text) > MAX_LINKS) throw new AppError('VALIDATION', `Messages can contain at most ${MAX_LINKS} links.`, { reason: 'TOO_MANY_LINKS' });

  const result = await transaction(async (tx) => {
    // Serialise a user's sends so burst/slow-mode/duplicate checks are exact.
    await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtext(${`chat:${input.userId}`}))) l`;
    const now = input.now ?? new Date();

    if (clientId) {
      const prior = await redis.get(cidKey(input.userId, clientId)).catch(() => null);
      if (prior) {
        const row = await tx.chatMessage.findUnique({ where: { id: prior }, include: MESSAGE_INCLUDE });
        if (row) return { row, mentionIds: [] as string[], replay: true };
      }
    }

    const status = await getChatStatus(input.userId, tx, now);
    if (!status.canSend) throw statusError(status);
    const isStaff = status.role ? hasRole(status.role as Role, 'MODERATOR') : false;

    const recent = await tx.chatMessage.findMany({
      where: { userId: input.userId, createdAt: { gt: new Date(now.getTime() - Math.max(DUPLICATE_WINDOW_MS, NOISY_WINDOW_MS)) } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { content: true, createdAt: true },
    });
    const age = (d: Date) => now.getTime() - d.getTime();

    if (status.slowModeSeconds > 0 && recent[0] && age(recent[0].createdAt) < status.slowModeSeconds * 1000) {
      throw limited(`Slow mode is on — one message every ${status.slowModeSeconds}s.`, status.slowModeSeconds * 1000 - age(recent[0].createdAt), 'SLOW_MODE');
    }
    if (!isStaff) {
      const burst = recent.filter((r) => age(r.createdAt) < RATE_LIMIT_WINDOW_MS);
      if (burst.length >= RATE_LIMIT_COUNT) {
        throw limited('You’re sending messages too quickly.', RATE_LIMIT_WINDOW_MS - age(burst[burst.length - 1].createdAt), 'RATE');
      }
      const fp = spamFingerprint(text);
      if (fp && recent.some((r) => age(r.createdAt) < DUPLICATE_WINDOW_MS && spamFingerprint(r.content) === fp)) {
        throw new AppError('RATE_LIMITED', 'You just sent that — try saying something new.', { reason: 'DUPLICATE' });
      }
      if (isNoisy(text)) {
        const lastNoisy = recent.find((r) => age(r.createdAt) < NOISY_WINDOW_MS && isNoisy(r.content));
        if (lastNoisy) {
          throw limited('Easy on the caps and repeats — try again shortly.', NOISY_WINDOW_MS - age(lastNoisy.createdAt), 'NOISY');
        }
      }
    }

    let replyToId: string | null = null;
    if (input.replyToId) {
      const parent = await tx.chatMessage.findUnique({ where: { id: input.replyToId }, select: { id: true, room: true, deletedAt: true } });
      if (!parent || parent.room !== room || parent.deletedAt) throw new AppError('VALIDATION', 'That message is no longer available.', { reason: 'REPLY_MISSING' });
      replyToId = parent.id;
    }

    const handles = extractMentionHandles(text);
    const mentioned = handles.length
      ? await tx.user.findMany({ where: { username: { in: handles }, status: { not: 'BANNED' } }, select: { id: true } })
      : [];
    const mentionIds = mentioned.map((m) => m.id);

    const row = await tx.chatMessage.create({
      data: { userId: input.userId, room, content: text, replyToId, mentions: mentionIds },
      include: MESSAGE_INCLUDE,
    });
    if (clientId) await redis.set(cidKey(input.userId, clientId), row.id, 'EX', 300).catch(() => undefined);
    return { row, mentionIds, replay: false };
  });

  const [dto] = await hydrate(prisma, [result.row], clientId ? new Map([[result.row.id, clientId]]) : undefined);
  if (result.replay) return dto;

  await publishChat({ t: 'message', room, authorId: input.userId, data: dto });

  const targets = result.mentionIds.filter((id) => id !== input.userId);
  if (targets.length) {
    const blockers = new Set(
      (await prisma.userBlock.findMany({ where: { blockerId: { in: targets }, blockedId: input.userId }, select: { blockerId: true } })).map((b) => b.blockerId),
    );
    await Promise.all(
      targets
        .filter((id) => !blockers.has(id))
        .map((id) =>
          emitToUser(id, 'chat:mention', {
            messageId: dto.id,
            from: { username: dto.user.username, displayName: dto.user.displayName },
            content: quote(dto.content),
          }),
        ),
    );
  }
  return dto;
}

// ── Reports ───────────────────────────────────────────────

export async function reportMessage(input: { reporterId: string; messageId: string; reason: ReportReason; details?: string | null }) {
  const msg = await prisma.chatMessage.findUnique({ where: { id: input.messageId }, select: { id: true, userId: true, deletedAt: true } });
  if (!msg || msg.deletedAt) throw new AppError('NOT_FOUND', 'That message is no longer available.');
  if (msg.userId === input.reporterId) throw new AppError('INVALID_ACTION', 'You can’t report your own message.');
  const details = input.details ? validateChatText(input.details).text.slice(0, 200) : '';
  const reason = details ? `${input.reason}: ${details}` : input.reason;
  try {
    await prisma.chatReport.create({ data: { messageId: msg.id, reporterId: input.reporterId, reason } });
  } catch (err) {
    // One report per reporter per message — a repeat is a no-op.
    if (!isUniqueViolation(err)) throw err;
    return { ok: true, duplicate: true };
  }
  return { ok: true, duplicate: false };
}

export { MESSAGE_INCLUDE, USER_SELECT, hydrate };
export type { MessageRow };

export function logChatError(err: unknown, ctx: Record<string, unknown>) {
  if (!(err instanceof AppError)) logger.error({ err, ...ctx }, 'chat operation failed');
}
