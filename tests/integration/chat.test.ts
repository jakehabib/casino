import { describe, it, expect } from 'vitest';
import { prisma } from '@/server/db';
import { redis } from '@/server/redis';
import { setSetting } from '@/server/services/settings/settings-service';
import { joinPayload, listRecent, reportMessage, sendMessage, setBlocked, getChatStatus } from '@/server/services/chat/chat-service';
import {
  banUser,
  deleteMessage,
  listReports,
  muteUser,
  resolveReports,
  suspendAccount,
  unbanUser,
  unmuteUser,
  warnUser,
} from '@/server/services/chat/moderation-service';
import { createTestUser, rid } from './helpers';

const send = (userId: string, content: string, extra: { replyToId?: string; clientId?: string } = {}) => sendMessage({ userId, content, ...extra });

describe('chat: sending', () => {
  it('persists a message and returns a hydrated payload with level/role badge data', async () => {
    const u = await createTestUser();
    await prisma.user.update({ where: { id: u.id }, data: { level: 12 } });
    const msg = await send(u.id, '  hello   table  ');
    expect(msg.content).toBe('hello table');
    expect(msg.user).toMatchObject({ id: u.id, username: u.username, level: 12, role: 'USER' });
    expect(msg.user.avatarUrl).toMatch(/^preset:/);
    const row = await prisma.chatMessage.findUniqueOrThrow({ where: { id: msg.id } });
    expect(row.content).toBe('hello table');
    const recent = await listRecent({ viewerId: null });
    expect(recent.at(-1)).toMatchObject({ id: msg.id, user: { level: 12, displayName: u.displayName } });
  });

  it('stores and returns HTML as inert text (never transformed into markup)', async () => {
    const u = await createTestUser();
    const html = '<img src=x onerror=alert(1)><script>alert("x")</script>';
    const msg = await send(u.id, html);
    expect(msg.content).toBe(html);
    const row = await prisma.chatMessage.findUniqueOrThrow({ where: { id: msg.id } });
    expect(row.content).toBe(html);
  });

  it('rejects empty and over-long messages', async () => {
    const u = await createTestUser();
    await expect(send(u.id, '   ​ ')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(send(u.id, 'ab'.repeat(151))).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('masks profanity and rejects blocked phrases', async () => {
    const u = await createTestUser();
    const m = await send(u.id, 'what the f.u.c.k');
    expect(m.content).toBe('what the *******');
    await expect(send(u.id, 'just kys')).rejects.toMatchObject({ code: 'VALIDATION', details: { reason: 'BLOCKED_CONTENT' } });
  });

  it('rate limits bursts (5 per 10s)', async () => {
    const u = await createTestUser();
    for (let i = 0; i < 5; i++) await send(u.id, `message number ${i} about blackjack`);
    await expect(send(u.id, 'one more different message')).rejects.toMatchObject({ code: 'RATE_LIMITED', details: { reason: 'RATE' } });
  });

  it('serialises concurrent sends so the burst limit is exact', async () => {
    const u = await createTestUser();
    const res = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => send(u.id, `parallel line ${i} ${rid()}`)));
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
  });

  it('rejects a repeated (normalised) message within 60s', async () => {
    const u = await createTestUser();
    await send(u.id, 'Anyone up for roulette?');
    await expect(send(u.id, 'anyone   up for ROULETTE')).rejects.toMatchObject({ code: 'RATE_LIMITED', details: { reason: 'DUPLICATE' } });
  });

  it('throttles noisy (shouting) messages to one per 30s', async () => {
    const u = await createTestUser();
    await send(u.id, 'WHAT A HAND THAT WAS');
    await expect(send(u.id, 'ANOTHER HUGE WIN RIGHT THERE')).rejects.toMatchObject({ code: 'RATE_LIMITED', details: { reason: 'NOISY' } });
    await send(u.id, 'ok calmer now');
  });

  it('enforces slow mode from system settings (staff exempt)', async () => {
    await setSetting('system', { chatSlowModeSeconds: 30 });
    try {
      const u = await createTestUser();
      const mod = await createTestUser({ role: 'MODERATOR' });
      await send(u.id, 'first in slow mode');
      await expect(send(u.id, 'second in slow mode')).rejects.toMatchObject({ code: 'RATE_LIMITED', details: { reason: 'SLOW_MODE' } });
      await send(mod.id, 'mod one');
      await send(mod.id, 'mod two');
      expect((await getChatStatus(u.id)).slowModeSeconds).toBe(30);
    } finally {
      await setSetting('system', { chatSlowModeSeconds: 0 });
    }
  });

  it('is idempotent per clientId (socket retry returns the original message)', async () => {
    const u = await createTestUser();
    const cid = `c${rid()}`;
    const a = await send(u.id, 'retry me', { clientId: cid });
    const b = await send(u.id, 'retry me', { clientId: cid });
    expect(b.id).toBe(a.id);
    expect(await prisma.chatMessage.count({ where: { userId: u.id } })).toBe(1);
  });

  it('links replies and returns a quoted preview', async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const parent = await send(a.id, 'who wants a tip on baccarat?');
    const reply = await send(b.id, 'go banker', { replyToId: parent.id });
    expect(reply.replyTo).toMatchObject({ id: parent.id, deleted: false, content: 'who wants a tip on baccarat?', user: { id: a.id } });
    const row = await prisma.chatMessage.findUniqueOrThrow({ where: { id: reply.id } });
    expect(row.replyToId).toBe(parent.id);
    await expect(send(b.id, 'reply to nothing', { replyToId: 'nope' })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('resolves @mentions to existing users only', async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const msg = await send(a.id, `nice hit @${b.username.toUpperCase()} and @nobody_here_x`);
    expect(msg.mentions).toEqual([{ id: b.id, username: b.username }]);
    const row = await prisma.chatMessage.findUniqueOrThrow({ where: { id: msg.id } });
    expect(row.mentions).toEqual([b.id]);
  });
});

describe('chat: restrictions', () => {
  it('guests cannot send; status reports GUEST', async () => {
    const s = await getChatStatus(null);
    expect(s).toMatchObject({ canSend: false, reason: 'GUEST' });
    const p = await joinPayload(null);
    expect(Array.isArray(p.messages)).toBe(true);
  });

  it('muted users are rejected with CHAT_MUTED until unmuted', async () => {
    const mod = await createTestUser({ role: 'MODERATOR' });
    const u = await createTestUser();
    const res = await muteUser({ actorId: mod.id, userId: u.id, durationSec: 600, reason: 'spam' });
    expect(new Date(res.expiresAt).getTime()).toBeGreaterThan(Date.now() + 590_000);
    await expect(send(u.id, 'can I talk?')).rejects.toMatchObject({ code: 'CHAT_MUTED' });
    expect(await getChatStatus(u.id)).toMatchObject({ canSend: false, reason: 'CHAT_MUTED' });
    await unmuteUser({ actorId: mod.id, userId: u.id });
    await send(u.id, 'thanks, back now');
    const log = await prisma.moderationLog.findMany({ where: { targetUserId: u.id }, orderBy: { createdAt: 'asc' } });
    expect(log.map((l) => l.action)).toEqual(['MUTE', 'UNMUTE']);
    expect(log[0].durationSec).toBe(600);
  });

  it('expired mutes no longer apply', async () => {
    const mod = await createTestUser({ role: 'MODERATOR' });
    const u = await createTestUser();
    await prisma.chatMute.create({ data: { userId: u.id, mutedById: mod.id, expiresAt: new Date(Date.now() - 1000) } });
    await send(u.id, 'free again');
  });

  it('chat ban blocks sending (CHAT_BANNED) until unbanned; purge removes recent messages', async () => {
    const mod = await createTestUser({ role: 'MODERATOR' });
    const u = await createTestUser();
    const m = await send(u.id, 'something rude-ish');
    await banUser({ actorId: mod.id, userId: u.id, reason: 'abuse', purge: true });
    await expect(send(u.id, 'hello?')).rejects.toMatchObject({ code: 'CHAT_BANNED' });
    expect((await prisma.chatMessage.findUniqueOrThrow({ where: { id: m.id } })).deletedAt).not.toBeNull();
    await expect(banUser({ actorId: mod.id, userId: u.id })).rejects.toMatchObject({ code: 'INVALID_ACTION' });
    await unbanUser({ actorId: mod.id, userId: u.id });
    await send(u.id, 'I will behave');
    const actions = (await prisma.moderationLog.findMany({ where: { targetUserId: u.id } })).map((l) => l.action).sort();
    expect(actions).toEqual(['CHAT_BAN', 'CHAT_UNBAN']);
  });

  it('self-excluded players can read but not send', async () => {
    const u = await createTestUser();
    await prisma.selfExclusion.create({ data: { userId: u.id, type: 'COOLDOWN_24H', startsAt: new Date(), endsAt: new Date(Date.now() + 86_400_000) } });
    await expect(send(u.id, 'hi')).rejects.toMatchObject({ code: 'COOLDOWN_ACTIVE' });
    const p = await joinPayload(u.id);
    expect(p.status).toMatchObject({ canSend: false, reason: 'COOLDOWN_ACTIVE' });
  });

  it('regular users cannot moderate; moderators cannot act on equal/higher staff', async () => {
    const u = await createTestUser();
    const v = await createTestUser();
    const mod = await createTestUser({ role: 'MODERATOR' });
    const mod2 = await createTestUser({ role: 'MODERATOR' });
    await expect(muteUser({ actorId: u.id, userId: v.id, durationSec: 600 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(muteUser({ actorId: mod.id, userId: mod2.id, durationSec: 600 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(suspendAccount({ actorId: mod.id, userId: v.id, durationSec: 86_400, reason: 'x y z' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('chat: blocks, deletes, reports, moderation', () => {
  it('a blocked user’s messages are hidden for the blocker (server-side)', async () => {
    const viewer = await createTestUser();
    const troll = await createTestUser();
    const other = await createTestUser();
    const t = await send(troll.id, `troll line ${rid()}`);
    const o = await send(other.id, `normal line ${rid()}`);
    await setBlocked(viewer.id, troll.id, true);
    const seen = (await listRecent({ viewerId: viewer.id, limit: 100 })).map((m) => m.id);
    expect(seen).toContain(o.id);
    expect(seen).not.toContain(t.id);
    // Others still see it.
    expect((await listRecent({ viewerId: other.id, limit: 100 })).map((m) => m.id)).toContain(t.id);
    expect((await joinPayload(viewer.id)).blocked).toEqual([troll.id]);
    await setBlocked(viewer.id, troll.id, false);
    expect((await listRecent({ viewerId: viewer.id, limit: 100 })).map((m) => m.id)).toContain(t.id);
  });

  it('cannot block yourself or staff', async () => {
    const u = await createTestUser();
    const mod = await createTestUser({ role: 'MODERATOR' });
    await expect(setBlocked(u.id, u.id, true)).rejects.toMatchObject({ code: 'INVALID_ACTION' });
    await expect(setBlocked(u.id, mod.id, true)).rejects.toMatchObject({ code: 'INVALID_ACTION' });
  });

  it('moderator delete hides the message, logs it and resolves its reports', async () => {
    const mod = await createTestUser({ role: 'MODERATOR' });
    const u = await createTestUser();
    const r = await createTestUser();
    const m = await send(u.id, `delete me ${rid()}`);
    await reportMessage({ reporterId: r.id, messageId: m.id, reason: 'SPAM' });
    await expect(deleteMessage({ actorId: u.id, messageId: m.id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await deleteMessage({ actorId: mod.id, messageId: m.id, reason: 'spam' });
    const row = await prisma.chatMessage.findUniqueOrThrow({ where: { id: m.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.deletedBy).toBe(mod.id);
    expect((await listRecent({ limit: 100 })).map((x) => x.id)).not.toContain(m.id);
    expect(await prisma.moderationLog.count({ where: { action: 'DELETE_MESSAGE', messageId: m.id } })).toBe(1);
    expect((await prisma.chatReport.findFirstOrThrow({ where: { messageId: m.id } })).status).toBe('RESOLVED');
    // Replies to a deleted message show it as deleted.
    await expect(send(r.id, 'replying', { replyToId: m.id })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('reports are unique per reporter/message and appear in the moderator queue', async () => {
    const mod = await createTestUser({ role: 'MODERATOR' });
    const u = await createTestUser();
    const r1 = await createTestUser();
    const r2 = await createTestUser();
    const m = await send(u.id, `reportable ${rid()}`);
    expect(await reportMessage({ reporterId: r1.id, messageId: m.id, reason: 'HARASSMENT', details: 'rude' })).toMatchObject({ duplicate: false });
    expect(await reportMessage({ reporterId: r1.id, messageId: m.id, reason: 'SPAM' })).toMatchObject({ duplicate: true });
    await reportMessage({ reporterId: r2.id, messageId: m.id, reason: 'SPAM' });
    await expect(reportMessage({ reporterId: u.id, messageId: m.id, reason: 'SPAM' })).rejects.toMatchObject({ code: 'INVALID_ACTION' });
    const q = await listReports({ actorId: mod.id, status: 'OPEN' });
    const item = q.items.find((i) => i.messageId === m.id)!;
    expect(item.reports).toHaveLength(2);
    expect(item.reports.map((x) => x.reason)).toContain('HARASSMENT: rude');
    await resolveReports({ actorId: mod.id, messageId: m.id, status: 'DISMISSED' });
    expect((await listReports({ actorId: mod.id, status: 'OPEN' })).items.find((i) => i.messageId === m.id)).toBeUndefined();
    await expect(resolveReports({ actorId: mod.id, messageId: m.id, status: 'RESOLVED' })).rejects.toMatchObject({ code: 'ACTION_UNAVAILABLE' });
    await expect(listReports({ actorId: u.id, status: 'OPEN' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('warn writes a notification and a moderation log', async () => {
    const mod = await createTestUser({ role: 'MODERATOR' });
    const u = await createTestUser();
    await warnUser({ actorId: mod.id, userId: u.id, reason: 'keep it civil' });
    expect(await prisma.notification.count({ where: { userId: u.id, type: 'MODERATION' } })).toBe(1);
    expect(await prisma.moderationLog.count({ where: { targetUserId: u.id, action: 'WARN' } })).toBe(1);
  });

  it('account suspend (ADMIN+) sets status, writes ModerationLog and AdminAuditLog', async () => {
    const admin = await createTestUser({ role: 'ADMIN' });
    const u = await createTestUser();
    await suspendAccount({ actorId: admin.id, userId: u.id, durationSec: 86_400, reason: 'chargeback abuse' });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(user.status).toBe('SUSPENDED');
    expect(user.suspendedUntil!.getTime()).toBeGreaterThan(Date.now() + 86_000_000);
    expect(await prisma.moderationLog.count({ where: { targetUserId: u.id, action: 'SUSPEND' } })).toBe(1);
    const audit = await prisma.adminAuditLog.findFirstOrThrow({ where: { targetId: u.id } });
    expect(audit).toMatchObject({ action: 'USER_SUSPEND', adminUserId: admin.id, targetType: 'USER' });
    await expect(send(u.id, 'am I suspended')).rejects.toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
  });

  it('publishes broadcasts on the chat bus', async () => {
    const sub = redis.duplicate();
    const got: string[] = [];
    await sub.subscribe('nova:chat');
    sub.on('message', (_c, raw) => got.push(JSON.parse(raw).t));
    const u = await createTestUser();
    await send(u.id, `bus test ${rid()}`);
    await new Promise((r) => setTimeout(r, 100));
    await sub.quit();
    expect(got).toContain('message');
  });
});
