import { createHash, createHmac, randomBytes } from 'node:crypto';
import { prisma, type Tx } from '@/server/db';
import { FairRng, type HmacFn } from '@/engines/fairness/rng';
import { AppError } from '@/lib/errors';

export const nodeHmac: HmacFn = (key, message) => createHmac('sha256', key).update(message).digest();

export function newServerSeed(): { seed: string; seedHash: string } {
  const seed = randomBytes(32).toString('hex');
  return { seed, seedHash: createHash('sha256').update(seed).digest('hex') };
}

export function defaultClientSeed(): string {
  return randomBytes(8).toString('hex');
}

export interface SeedDraw {
  seedId: string;
  serverSeed: string; // SECRET — never send to client
  seedHash: string;
  clientSeed: string;
  nonce: number;
  rng: FairRng;
}

async function ensureActive(tx: Tx, userId: string) {
  const existing = await tx.serverSeed.findFirst({ where: { userId, status: 'ACTIVE' } });
  if (existing) return existing;
  const { seed, seedHash } = newServerSeed();
  return tx.serverSeed.create({ data: { userId, seed, seedHash, clientSeed: defaultClientSeed() } });
}

/**
 * Atomically reserve the next nonce for the user's active seed pair and return
 * a deterministic RNG for it. Must be called inside the game's transaction.
 */
export async function drawSeed(tx: Tx, userId: string): Promise<SeedDraw> {
  const active = await ensureActive(tx, userId);
  const rows = await tx.$queryRaw<{ nonce: number }[]>`
    UPDATE "ServerSeed" SET nonce = nonce + 1 WHERE id = ${active.id} AND status = 'ACTIVE' RETURNING nonce`;
  if (rows.length !== 1) throw new AppError('CONFLICT', 'Seed rotated during request');
  const nonce = rows[0].nonce - 1;
  return {
    seedId: active.id,
    serverSeed: active.seed,
    seedHash: active.seedHash,
    clientSeed: active.clientSeed,
    nonce,
    rng: new FairRng(active.seed, active.clientSeed, nonce, nodeHmac),
  };
}

/** Public view of the user's seed state (never includes the active seed). */
export async function getSeedState(userId: string) {
  const active = await prisma.$transaction((tx) => ensureActive(tx, userId));
  const previous = await prisma.serverSeed.findMany({
    where: { userId, status: 'REVEALED' },
    orderBy: { revealedAt: 'desc' },
    take: 10,
  });
  return {
    active: { seedHash: active.seedHash, clientSeed: active.clientSeed, nonce: active.nonce, createdAt: active.createdAt },
    previous: previous.map((s) => ({
      seedHash: s.seedHash,
      serverSeed: s.seed,
      clientSeed: s.clientSeed,
      finalNonce: s.nonce,
      createdAt: s.createdAt,
      revealedAt: s.revealedAt,
    })),
  };
}

/**
 * Rotate the seed pair: reveal the current server seed, commit a new one and
 * optionally set a new client seed. Card shoes shuffled from the revealed seed
 * are retired immediately (their remaining order would otherwise be knowable).
 */
export async function rotateSeed(userId: string, newClientSeed?: string) {
  return prisma.$transaction(async (tx) => {
    // Serialise with the user's wagers.
    await tx.$queryRaw`SELECT id FROM "Wallet" WHERE "userId" = ${userId} FOR UPDATE`;
    const unfinished = await tx.blackjackGame.findFirst({
      where: { userId, status: { not: 'SETTLED' } },
      select: { id: true },
    });
    if (unfinished) throw new AppError('ROUND_IN_PROGRESS', 'Finish your blackjack hand before rotating seeds.');
    const active = await ensureActive(tx, userId);
    await tx.serverSeed.update({ where: { id: active.id }, data: { status: 'REVEALED', revealedAt: new Date() } });
    await tx.cardShoe.updateMany({
      where: { userId, status: 'ACTIVE', serverSeedId: active.id },
      data: { status: 'RETIRED', retiredAt: new Date() },
    });
    const { seed, seedHash } = newServerSeed();
    const next = await tx.serverSeed.create({
      data: { userId, seed, seedHash, clientSeed: newClientSeed?.trim() || defaultClientSeed() },
    });
    return {
      revealed: { seedHash: active.seedHash, serverSeed: active.seed, clientSeed: active.clientSeed, finalNonce: active.nonce },
      active: { seedHash: next.seedHash, clientSeed: next.clientSeed, nonce: next.nonce },
    };
  });
}

/** Look up a revealed seed by its hash (for verification links). */
export async function findRevealedSeed(userId: string, seedHash: string) {
  return prisma.serverSeed.findFirst({ where: { userId, seedHash, status: 'REVEALED' } });
}
