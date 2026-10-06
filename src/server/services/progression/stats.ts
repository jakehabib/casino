import { Prisma } from '@prisma/client';
import { type Tx } from '@/server/db';
import type { GameKey } from '@/lib/games';

const PLAY_FIELD: Record<GameKey, keyof Prisma.PlayerStatsUpdateInput> = {
  BLACKJACK: 'playsBlackjack',
  BACCARAT: 'playsBaccarat',
  ROULETTE: 'playsRoulette',
  CRASH: 'playsCrash',
  SLOTS: 'playsSlots',
};

export async function ensureStats(tx: Tx, userId: string) {
  await tx.playerStats.upsert({ where: { userId }, create: { userId }, update: {} });
}

/**
 * Record a completed round in the general stats + unified history. Called once
 * per round at settlement, guarded by GameHistory's unique (game, referenceId).
 */
export async function recordRound(
  tx: Tx,
  r: {
    userId: string;
    game: GameKey;
    variant?: string;
    referenceId: string;
    wager: bigint;
    payout: bigint;
    multiplierX100?: number | null;
    summary: string;
    extraStats?: Prisma.PlayerStatsUpdateInput;
  },
) {
  const inserted = await tx.gameHistory.createMany({
    data: [
      {
        userId: r.userId,
        game: r.game,
        gameVariant: r.variant,
        referenceId: r.referenceId,
        wager: r.wager,
        payout: r.payout,
        net: r.payout - r.wager,
        multiplier: r.multiplierX100 ?? null,
        resultSummary: r.summary,
      },
    ],
    skipDuplicates: true,
  });
  if (inserted.count === 0) return false; // already recorded — idempotent

  await ensureStats(tx, r.userId);
  const data: Prisma.PlayerStatsUpdateInput = {
    gamesPlayed: { increment: 1 },
    totalWagered: { increment: r.wager },
    totalWon: { increment: r.payout },
    [PLAY_FIELD[r.game]]: { increment: 1 },
    ...(r.extraStats ?? {}),
  };
  await tx.playerStats.update({ where: { userId: r.userId }, data });
  // Largest win is measured as gross payout of a single round.
  if (r.payout > 0n) {
    await tx.$executeRaw`
      UPDATE "PlayerStats" SET "largestWin" = ${r.payout}, "largestWinGame" = ${r.variant ?? r.game}
      WHERE "userId" = ${r.userId} AND "largestWin" < ${r.payout}`;
  }
  return true;
}

/** Atomic "max" update on a BigInt stats column. */
export async function bumpMax(tx: Tx, userId: string, column: 'bjLargestBlackjackWin' | 'rouLargestWin' | 'crashLargestWin' | 'slotLargestWin', value: bigint) {
  await ensureStats(tx, userId);
  await tx.$executeRawUnsafe(
    `UPDATE "PlayerStats" SET "${column}" = $1 WHERE "userId" = $2 AND "${column}" < $1`,
    value,
    userId,
  );
}

export async function bumpMaxInt(tx: Tx, userId: string, column: 'crashHighestCashout', value: number) {
  await ensureStats(tx, userId);
  await tx.$executeRawUnsafe(
    `UPDATE "PlayerStats" SET "${column}" = $1 WHERE "userId" = $2 AND "${column}" < $1`,
    value,
    userId,
  );
}
