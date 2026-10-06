import { z } from 'zod';
import { prisma, transaction } from '@/server/db';
import { redis } from '@/server/redis';
import { devToolsEnabled } from '@/server/env';
import { AppError } from '@/lib/errors';
import { toNum } from '@/lib/money';
import { localDateAsUtcDate } from '@/lib/time';
import { PostCommit, emitToUser } from '@/server/realtime/events';
import { applyLedgerEntry, lockWallet } from '@/server/services/wallet/wallet-service';
import {
  type ForcedGame,
  clearForcedOutcome,
  peekForcedOutcome,
  setForcedOutcome,
} from '@/server/services/dev/forced-outcomes';
import { logger } from '@/server/logger';

/**
 * DEVELOPMENT-ONLY tools behind /dev and /api/dev/*. Every entry point calls
 * assertDevTools(), which reports NOT_FOUND (so the routes 404) whenever
 * devToolsEnabled() is false — and that is hard-false in production.
 */
export function assertDevTools() {
  if (!devToolsEnabled()) throw new AppError('NOT_FOUND');
}

export const CRASH_COUNTDOWN_KEY = 'dev:crash:countdownMs';
export const DEV_GRANT_MAX = 100_000_000;

const CardCode = z.string().regex(/^(A|[2-9]|T|J|Q|K)[SHDC]$/, 'Card codes look like AS, TD, 9H');

export const ForceSchemas = {
  blackjack: z.object({ cards: z.array(CardCode).min(1).max(40) }),
  baccarat: z.object({ cards: z.array(CardCode).min(4).max(6) }),
  roulette: z.object({ number: z.number().int().min(0).max(36) }),
  crash: z.object({ crashPointX100: z.number().int().min(100).max(10_000_000) }),
  slots: z.object({
    slotId: z.enum(['gilded-vault', 'overcharge', 'starforged-relics']),
    trigger: z.enum(['FREE_SPINS', 'BIG_WIN', 'LOSS']),
  }),
} satisfies Record<ForcedGame, z.ZodType>;

export const FORCED_GAMES = Object.keys(ForceSchemas) as ForcedGame[];

/** Crash is a shared multiplayer round, so its override is global. */
const scopeFor = (game: ForcedGame, userId: string) => (game === 'crash' ? 'global' : userId);

export async function getDevStatus(userId: string) {
  assertDevTools();
  const [wallet, seed, claims, rp, exclusions, pendingChanges, countdown, forcedEntries] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId }, select: { balance: true } }),
    prisma.serverSeed.findFirst({ where: { userId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } }),
    prisma.rewardClaim.findMany({
      where: { userId, type: { in: ['DAILY', 'REFILL'] } },
      orderBy: { createdAt: 'desc' },
      take: 4,
      select: { type: true, createdAt: true, amount: true },
    }),
    prisma.responsiblePlaySettings.findUnique({ where: { userId } }),
    prisma.selfExclusion.count({ where: { userId } }),
    prisma.responsiblePlayLimitChange.count({ where: { userId, status: 'PENDING' } }),
    redis.get(CRASH_COUNTDOWN_KEY).catch(() => null),
    Promise.all(FORCED_GAMES.map(async (g) => [g, await peekForcedOutcome(g, scopeFor(g, userId))] as const)),
  ]);
  return {
    enabled: true,
    balance: toNum(wallet?.balance ?? 0n),
    // DEV ONLY: the active server seed is exposed here so outcomes can be reproduced locally.
    seed: seed
      ? { id: seed.id, serverSeed: seed.seed, seedHash: seed.seedHash, clientSeed: seed.clientSeed, nonce: seed.nonce, createdAt: seed.createdAt.toISOString() }
      : null,
    rewards: claims.map((c) => ({ type: c.type, amount: toNum(c.amount), createdAt: c.createdAt.toISOString() })),
    responsiblePlay: {
      dailyWagerLimit: rp?.dailyWagerLimit == null ? null : toNum(rp.dailyWagerLimit),
      dailyLossLimit: rp?.dailyLossLimit == null ? null : toNum(rp.dailyLossLimit),
      exclusions,
      pendingChanges,
    },
    crashCountdownMs: countdown ? Number(countdown) : null,
    forced: Object.fromEntries(forcedEntries) as Record<ForcedGame, unknown>,
  };
}

export type DevStatus = Awaited<ReturnType<typeof getDevStatus>>;

export async function devGrantCredits(userId: string, amount: number, requestId: string) {
  assertDevTools();
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > DEV_GRANT_MAX) {
    throw new AppError('VALIDATION', `Grant between 1 and ${DEV_GRANT_MAX.toLocaleString('en-US')} Credits.`);
  }
  const post = new PostCommit();
  const res = await transaction(async (tx) => {
    await lockWallet(tx, userId);
    const r = await applyLedgerEntry(
      tx,
      {
        userId,
        type: 'ADMIN_ADJUSTMENT',
        amount: BigInt(amount),
        referenceType: 'DEV_TOOLS',
        referenceId: requestId,
        idempotencyKey: `dev-grant:${requestId}`,
        metadata: { dev: true, op: 'grant' },
      },
      post,
    );
    return { balance: toNum(r.balance), duplicate: r.duplicate };
  });
  await post.flush();
  logger.warn({ userId, amount }, 'DEV: credits granted');
  return res;
}

export async function devClearBalance(userId: string, requestId: string) {
  assertDevTools();
  const post = new PostCommit();
  const res = await transaction(async (tx) => {
    const key = `dev-clear:${requestId}`;
    const balance = await lockWallet(tx, userId);
    const existing = await tx.walletTransaction.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: key } } });
    if (existing || balance === 0n) return { balance: toNum(balance), duplicate: !!existing };
    const r = await applyLedgerEntry(
      tx,
      {
        userId,
        type: 'ADMIN_ADJUSTMENT',
        amount: -balance,
        referenceType: 'DEV_TOOLS',
        referenceId: requestId,
        idempotencyKey: key,
        metadata: { dev: true, op: 'clear' },
      },
      post,
    );
    return { balance: toNum(r.balance), duplicate: false };
  });
  await post.flush();
  return res;
}

export async function devResetRewards(userId: string) {
  assertDevTools();
  const { count } = await prisma.rewardClaim.deleteMany({ where: { userId, type: { in: ['DAILY', 'REFILL'] } } });
  return { deleted: count };
}

export async function devSetForced(userId: string, game: ForcedGame, value: unknown) {
  assertDevTools();
  const scope = scopeFor(game, userId);
  if (value === null) {
    await clearForcedOutcome(game, scope);
    return { game, value: null };
  }
  const parsed = ForceSchemas[game].safeParse(value);
  if (!parsed.success) {
    throw new AppError('VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid forced outcome');
  }
  if (game === 'blackjack' || game === 'baccarat') {
    // Mirror physical limits: never more copies of a card than an 8-deck shoe holds.
    const counts = new Map<string, number>();
    for (const c of (parsed.data as { cards: string[] }).cards) counts.set(c, (counts.get(c) ?? 0) + 1);
    if ([...counts.values()].some((n) => n > 8)) throw new AppError('VALIDATION', 'Too many copies of one card for an 8-deck shoe.');
  }
  await setForcedOutcome(game, scope, parsed.data);
  return { game, value: parsed.data };
}

export async function devSetCrashCountdown(ms: number | null) {
  assertDevTools();
  if (ms === null) {
    await redis.del(CRASH_COUNTDOWN_KEY);
    return { crashCountdownMs: null };
  }
  if (!Number.isInteger(ms) || ms < 500 || ms > 60_000) throw new AppError('VALIDATION', 'Countdown must be 500–60000 ms.');
  await redis.set(CRASH_COUNTDOWN_KEY, String(ms), 'EX', 6 * 3600);
  return { crashCountdownMs: ms };
}

/** Wipe the current user's responsible-play state so RP flows can be re-tested. */
export async function devResetResponsiblePlay(userId: string, now = new Date()) {
  assertDevTools();
  const res = await transaction(async (tx) => {
    await lockWallet(tx, userId);
    const settings = await tx.responsiblePlaySettings.findUnique({ where: { userId } });
    const tz = settings?.timezone ?? 'UTC';
    const [ex, ch, agg] = await Promise.all([
      tx.selfExclusion.deleteMany({ where: { userId } }),
      tx.responsiblePlayLimitChange.deleteMany({ where: { userId } }),
      tx.dailyPlayAggregate.deleteMany({ where: { userId, date: localDateAsUtcDate(tz, now) } }),
    ]);
    if (settings) {
      await tx.responsiblePlaySettings.update({ where: { userId }, data: { dailyWagerLimit: null, dailyLossLimit: null } });
    }
    return { exclusions: ex.count, limitChanges: ch.count, aggregates: agg.count };
  });
  await emitToUser(userId, 'play:status', { changed: true });
  return res;
}

/** Route guard: 404 unless dev tools are enabled AND someone is signed in (not banned). */
export function requireDevUser<U extends { id: string; status: string }>(user: U | null): U {
  if (!devToolsEnabled() || !user || user.status === 'BANNED') throw new AppError('NOT_FOUND');
  return user;
}
