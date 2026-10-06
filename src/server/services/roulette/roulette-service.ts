import { randomUUID } from 'node:crypto';
import type { RouletteBet, RouletteRound } from '@prisma/client';
import { prisma, transaction } from '@/server/db';
import { lockWallet } from '@/server/services/wallet/wallet-service';
import { placeWager, creditPayout } from '@/server/services/wagering';
import { drawSeed, fairnessInfo } from '@/server/services/fairness/seed-service';
import { recordRound, bumpMax } from '@/server/services/progression/stats';
import { getSetting } from '@/server/services/settings/settings-service';
import { consumeForcedOutcome, setForcedOutcome } from '@/server/services/dev/forced-outcomes';
import { PostCommit } from '@/server/realtime/events';
import { logger } from '@/server/logger';
import { AppError } from '@/lib/errors';
import { toNum } from '@/lib/money';
import { formatCredits } from '@/lib/format';
import type { RoundDetail } from '@/lib/round-detail';
import {
  BET_TYPES,
  PAYOUT_ODDS,
  colorOf,
  drawWinningNumber,
  isRouletteNumber,
  settle,
  spotMax,
  validateBets,
  type BetInput,
  type BetRejection,
  type BetType,
  type TableLimits,
} from '@/engines/roulette';
import type { RouletteBetResult, RouletteRoundData, RouletteSpinResult, RouletteState } from '@/engines/roulette/api-types';

const REF_TYPE = 'ROULETTE_ROUND';
const RECENT_LIMIT = 20;

type RoundWithBets = RouletteRound & { bets: RouletteBet[] };

function limitsOf(cfg: { minBet: number; maxBet: number; maxStraightBet: number; maxOutsideBet: number }): TableLimits {
  return { minBet: cfg.minBet, maxBet: cfg.maxBet, maxStraightBet: cfg.maxStraightBet, maxOutsideBet: cfg.maxOutsideBet };
}

function rejectionError(e: BetRejection): AppError {
  switch (e.code) {
    case 'NO_BETS':
      return new AppError('VALIDATION', 'Place at least one bet.');
    case 'TOO_MANY_BETS':
      return new AppError('VALIDATION', `A spin can hold at most ${e.max} bets.`);
    case 'ILLEGAL_BET':
      return new AppError('VALIDATION', 'That bet isn’t available on the layout.', { index: e.index });
    case 'INVALID_AMOUNT':
      return new AppError('VALIDATION', 'Bet amounts must be whole Credits.', { index: e.index });
    case 'BET_TOO_LOW':
      return new AppError('BET_TOO_LOW', `Each bet must be at least ${formatCredits(e.min)} Credits.`, { min: e.min, spot: e.spot });
    case 'BET_TOO_HIGH':
      return new AppError('BET_TOO_HIGH', `${e.label} bets are limited to ${formatCredits(e.max)} Credits per spot.`, {
        max: e.max,
        spot: e.spot,
      });
    case 'TABLE_MAX':
      return new AppError('BET_TOO_HIGH', `Total bets are limited to ${formatCredits(e.max)} Credits per spin.`, {
        max: e.max,
        total: toNum(e.total),
      });
  }
}

function betView(b: Pick<RouletteBet, 'type' | 'numbers' | 'amount' | 'payout' | 'won'>): RouletteBetResult {
  return { type: b.type as BetType, numbers: [...b.numbers], amount: toNum(b.amount), payout: toNum(b.payout), won: b.won };
}

function roundView(r: RoundWithBets, balance: bigint, replay = false): RouletteSpinResult {
  return {
    roundId: r.id,
    winningNumber: r.winningNumber,
    bets: r.bets.map(betView),
    totalWagered: toNum(r.totalWagered),
    totalPayout: toNum(r.totalPayout),
    balance: toNum(balance),
    createdAt: r.createdAt.toISOString(),
    ...(replay ? { replay: true } : {}),
  };
}

function summarise(winningNumber: number, betCount: number): string {
  const c = colorOf(winningNumber);
  const colour = c === 'green' ? 'Green' : c === 'red' ? 'Red' : 'Black';
  return `${winningNumber} ${colour} · ${betCount} bet${betCount === 1 ? '' : 's'}`;
}

export async function getRouletteState(userId: string): Promise<RouletteState> {
  const cfg = await getSetting('game.roulette');
  const limits = limitsOf(cfg);
  const betLimits = Object.fromEntries(
    BET_TYPES.map((t) => [t, { min: cfg.minBet, max: spotMax(t, limits), odds: PAYOUT_ODDS[t] }]),
  ) as RouletteState['betLimits'];

  const [recent, last, wallet] = await Promise.all([
    prisma.rouletteRound.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: RECENT_LIMIT,
      select: { id: true, winningNumber: true, totalWagered: true, totalPayout: true, createdAt: true },
    }),
    prisma.rouletteRound.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, include: { bets: true } }),
    prisma.wallet.findUnique({ where: { userId }, select: { balance: true } }),
  ]);

  return {
    enabled: cfg.enabled,
    limits,
    betLimits,
    recent: recent.map((r) => ({
      id: r.id,
      winningNumber: r.winningNumber,
      totalWagered: toNum(r.totalWagered),
      totalPayout: toNum(r.totalPayout),
      createdAt: r.createdAt.toISOString(),
    })),
    lastRound: last ? roundView(last, wallet?.balance ?? 0n) : null,
  };
}

export interface SpinInput {
  bets: BetInput[];
  requestId: string;
}

/**
 * Place a full bet slip and resolve the spin in ONE transaction:
 *   lock wallet → replay check (clientRequestId) → validate slip → ONE wager for
 *   the total → seed draw (first float = winning number) → settle every bet →
 *   persist → ONE payout credit → history/stats.
 */
export async function spin(userId: string, input: SpinInput): Promise<RouletteSpinResult> {
  const post = new PostCommit();
  let forcedNumber: number | null = null;
  try {
    const result = await transaction(async (tx) => {
      await lockWallet(tx, userId);

      const existing = await tx.rouletteRound.findUnique({
        where: { userId_clientRequestId: { userId, clientRequestId: input.requestId } },
        include: { bets: true },
      });
      if (existing) {
        const w = await tx.wallet.findUniqueOrThrow({ where: { userId }, select: { balance: true } });
        return roundView(existing, w.balance, true);
      }

      const cfg = await getSetting('game.roulette', tx);
      const validation = validateBets(input.bets, limitsOf(cfg));
      if (!validation.ok) throw rejectionError(validation.error);
      const { bets, total } = validation;

      // Dev-only forced result (no-op in production). Consumed before the wager
      // so the flag can be recorded on the BET ledger entry.
      const forced = await consumeForcedOutcome<{ number: number }>('roulette', userId);
      if (forced && isRouletteNumber(forced.number)) forcedNumber = forced.number;

      const roundId = randomUUID().replace(/-/g, '');
      const wager = await placeWager(
        tx,
        {
          userId,
          game: 'ROULETTE',
          amount: total,
          minBet: BigInt(cfg.minBet),
          maxBet: BigInt(cfg.maxBet),
          referenceType: REF_TYPE,
          referenceId: roundId,
          idempotencyKey: `rou:${roundId}:bet`,
          metadata: { bets: bets.length, ...(forcedNumber !== null ? { forced: true } : {}) },
        },
        post,
      );

      const seed = await drawSeed(tx, userId);
      const rngNumber = drawWinningNumber(seed.rng);
      const winningNumber = forcedNumber ?? rngNumber;
      const s = settle(bets, winningNumber);

      const round = await tx.rouletteRound.create({
        data: {
          id: roundId,
          userId,
          clientRequestId: input.requestId,
          winningNumber,
          totalWagered: s.totalWagered,
          totalPayout: s.totalPayout,
          serverSeedHash: seed.seedHash,
          clientSeed: seed.clientSeed,
          nonce: seed.nonce,
          bets: {
            create: s.bets.map((b) => ({ type: b.type, numbers: b.numbers, amount: b.amount, payout: b.payout, won: b.won })),
          },
        },
        include: { bets: true },
      });

      let balance = wager.balance;
      if (s.totalPayout > 0n) {
        const credit = await creditPayout(
          tx,
          {
            userId,
            game: 'ROULETTE',
            amount: s.totalPayout,
            referenceType: REF_TYPE,
            referenceId: roundId,
            idempotencyKey: `rou:${roundId}:settle`,
            metadata: { winningNumber },
          },
          post,
        );
        if (credit) balance = credit.balance;
      }

      await recordRound(tx, {
        userId,
        game: 'ROULETTE',
        referenceId: roundId,
        wager: s.totalWagered,
        payout: s.totalPayout,
        multiplierX100: s.totalWagered > 0n ? Number((s.totalPayout * 100n) / s.totalWagered) : null,
        summary: summarise(winningNumber, s.bets.length),
        extraStats: { rouSpins: { increment: 1 } },
      });
      if (s.totalPayout > 0n) await bumpMax(tx, userId, 'rouLargestWin', s.totalPayout);

      return roundView(round, balance);
    });
    await post.flush();
    return result;
  } catch (err) {
    // A forced (dev) outcome must not be lost when the spin is rejected.
    if (forcedNumber !== null) await setForcedOutcome('roulette', userId, { number: forcedNumber }).catch(() => undefined);
    if (!(err instanceof AppError)) logger.error({ err, userId }, 'roulette spin failed');
    throw err;
  }
}

export async function getRoundDetail(userId: string, roundId: string): Promise<RoundDetail<RouletteRoundData>> {
  const round = await prisma.rouletteRound.findUnique({ where: { id: roundId }, include: { bets: true } });
  if (!round || round.userId !== userId) throw new AppError('NOT_FOUND', 'Round not found.');
  const [fairness, betTx] = await Promise.all([
    fairnessInfo(userId, round.serverSeedHash, round.clientSeed, round.nonce),
    prisma.walletTransaction.findFirst({
      where: { userId, idempotencyKey: `rou:${round.id}:bet` },
      select: { metadata: true },
    }),
  ]);
  const forced = !!(betTx?.metadata && typeof betTx.metadata === 'object' && (betTx.metadata as Record<string, unknown>).forced);
  const bets = [...round.bets].sort((a, b) => sortKey(a) - sortKey(b)).map(betView);
  return {
    game: 'ROULETTE',
    id: round.id,
    variant: null,
    createdAt: round.createdAt.toISOString(),
    wager: toNum(round.totalWagered),
    payout: toNum(round.totalPayout),
    net: toNum(round.totalPayout - round.totalWagered),
    summary: summarise(round.winningNumber, round.bets.length),
    fairness,
    ...(forced ? { forced: true } : {}),
    data: { winningNumber: round.winningNumber, bets },
  };
}

/** Inside bets first (by type order), then outside. */
function sortKey(b: RouletteBet): number {
  const ti = (BET_TYPES as readonly string[]).indexOf(b.type);
  return ti * 100 + (b.numbers[0] ?? 0);
}
