import { randomBytes } from 'node:crypto';
import type { BaccaratBet, BaccaratGame, CardShoe } from '@prisma/client';
import { prisma, transaction, type Tx } from '@/server/db';
import { AppError } from '@/lib/errors';
import { toBig, toNum } from '@/lib/money';
import { logger } from '@/server/logger';
import { PostCommit } from '@/server/realtime/events';
import { placeWager, creditPayout } from '@/server/services/wagering';
import { lockWallet } from '@/server/services/wallet/wallet-service';
import { drawSeed, fairnessInfo } from '@/server/services/fairness/seed-service';
import { getSetting } from '@/server/services/settings/settings-service';
import type { BaccaratConfigT } from '@/server/services/settings/schemas';
import { recordRound } from '@/server/services/progression/stats';
import { consumeForcedOutcome } from '@/server/services/dev/forced-outcomes';
import { devToolsEnabled } from '@/server/env';
import {
  MAIN_BETS,
  dealOrderFromHands,
  newBaccaratShoe,
  playBaccarat,
  resolveBaccarat,
  settleBets,
  shoeNeedsReshuffle,
  type BaccaratOutcome,
  type BaccaratRound,
  type Bets,
  type MainBetType,
} from '@/engines/baccarat';
import type { RoundDetail } from '@/lib/round-detail';
import type {
  BaccaratBeadDto,
  BaccaratConfigDto,
  BaccaratResultDto,
  BaccaratRoundData,
  BaccaratShoeDto,
  BaccaratStateDto,
} from './types';

/**
 * Baccarat (Punto Banco) service.
 *
 * deal(): ONE transaction —
 *   lockWallet → replay check (clientRequestId) → per-bet limit validation →
 *   placeWager(total, `bac:${id}:bet`) → load / reshuffle the user's shoe →
 *   play the round from the shoe → advance shoe (conditional on version) →
 *   persist game + bets → creditPayout(`bac:${id}:settle`) → recordRound.
 *
 * Limits: each individual wager must be within [minBet, maxBet]; the TOTAL
 * stake then goes through WagerEligibilityService (self-exclusion, daily
 * wager/loss limits, balance) with table min/max disabled (already checked).
 */

const REF = 'BACCARAT_GAME';
const GAME = 'BACCARAT';

interface StoredRules {
  decks: number;
  bankerCommissionBps: number;
  tiePayout: number;
  minBet: number;
  maxBet: number;
  shoeNumber: number;
  /** [from, to) positions in the shoe consumed by this round; null if forced. */
  positions: [number, number] | null;
  forced?: boolean;
}

function newId() {
  // cuid-like, unique, sortable enough; Prisma accepts caller-supplied ids.
  return `bac${Date.now().toString(36)}${randomBytes(8).toString('hex')}`;
}

function configDto(cfg: BaccaratConfigT): BaccaratConfigDto {
  return {
    enabled: cfg.enabled,
    minBet: cfg.minBet,
    maxBet: cfg.maxBet,
    decks: cfg.decks,
    penetration: cfg.penetration,
    bankerCommissionBps: cfg.bankerCommissionBps,
    tiePayout: cfg.tiePayout,
  };
}

type GameWithBets = BaccaratGame & { bets: BaccaratBet[] };

function roundFromGame(g: BaccaratGame): BaccaratRound {
  return resolveBaccarat(dealOrderFromHands(g.playerCards as string[], g.bankerCards as string[]));
}

function bead(g: Pick<BaccaratGame, 'outcome' | 'playerTotal' | 'bankerTotal' | 'natural'>): BaccaratBeadDto {
  return { outcome: g.outcome as BaccaratOutcome, playerTotal: g.playerTotal, bankerTotal: g.bankerTotal, natural: g.natural };
}

function resultDto(g: GameWithBets, balance: bigint | null, shoe: BaccaratShoeDto | null): BaccaratResultDto {
  const round = roundFromGame(g);
  const rules = g.rules as unknown as StoredRules;
  return {
    id: g.id,
    createdAt: g.createdAt.toISOString(),
    shoeRound: g.shoeRound,
    shoeNumber: rules.shoeNumber,
    deal: round.deal,
    playerCards: round.playerCards,
    bankerCards: round.bankerCards,
    playerTotal: round.playerTotal,
    bankerTotal: round.bankerTotal,
    natural: round.natural,
    naturalSide: round.naturalSide,
    playerDrew: round.playerDrew,
    bankerDrew: round.bankerDrew,
    outcome: round.outcome,
    bets: g.bets
      .slice()
      .sort((a, b) => MAIN_BETS.indexOf(a.type as MainBetType) - MAIN_BETS.indexOf(b.type as MainBetType))
      .map((b) => ({ type: b.type as MainBetType, amount: toNum(b.amount), payout: toNum(b.payout), outcome: b.outcome as 'WIN' | 'LOSS' | 'PUSH' })),
    totalWagered: toNum(g.totalWagered),
    totalPayout: toNum(g.totalPayout),
    net: toNum(g.totalPayout - g.totalWagered),
    balance: balance === null ? null : toNum(balance),
    shoe,
    forced: rules.forced === true,
  };
}

function shoeDto(shoe: Pick<CardShoe, 'id' | 'decks' | 'cards' | 'position' | 'cutCard' | 'roundsDealt'>, shoeNumber: number, penetration: number): BaccaratShoeDto {
  const total = (shoe.cards as string[]).length;
  return {
    shoeNumber,
    decks: shoe.decks,
    totalCards: total,
    cardsDealt: shoe.position,
    cardsRemaining: total - shoe.position,
    penetration,
    cutCardReached: shoeNeedsReshuffle(shoe.position, shoe.cutCard, total),
    roundsDealt: shoe.roundsDealt,
    // Fraction of the shoe dealt relative to the cut card (0–1), for the shoe gauge.
    progress: Math.min(1, shoe.position / Math.max(1, shoe.cutCard)),
  };
}

async function shoeNumberOf(db: Tx | typeof prisma, userId: string, shoe: Pick<CardShoe, 'createdAt' | 'id'>) {
  return db.cardShoe.count({ where: { userId, game: GAME, createdAt: { lte: shoe.createdAt } } });
}

/** Load the active shoe, retiring + replacing it when the cut card was reached or config changed. */
async function ensureShoe(tx: Tx, userId: string, cfg: BaccaratConfigT) {
  const active = await tx.cardShoe.findFirst({ where: { userId, game: GAME, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } });
  if (active) {
    const total = (active.cards as string[]).length;
    const seed = await tx.serverSeed.findUnique({ where: { id: active.serverSeedId }, select: { status: true } });
    const stale = active.decks !== cfg.decks || seed?.status !== 'ACTIVE';
    if (!stale && !shoeNeedsReshuffle(active.position, active.cutCard, total)) return { shoe: active, reshuffled: false };
    await tx.cardShoe.updateMany({ where: { id: active.id, status: 'ACTIVE' }, data: { status: 'RETIRED', retiredAt: new Date() } });
  }
  const draw = await drawSeed(tx, userId);
  const { cards, cutCard } = newBaccaratShoe(cfg.decks, cfg.penetration, draw.rng);
  const shoe = await tx.cardShoe.create({
    data: { userId, game: GAME, decks: cfg.decks, cards, cutCard, serverSeedId: draw.seedId, nonce: draw.nonce },
  });
  return { shoe, reshuffled: !!active };
}

export interface DealInput {
  bets: Partial<Record<MainBetType, number>>;
  requestId: string;
}

export async function deal(userId: string, input: DealInput): Promise<BaccaratResultDto> {
  const post = new PostCommit();
  try {
    const res = await transaction(async (tx) => {
      await lockWallet(tx, userId);

      const existing = await tx.baccaratGame.findUnique({
        where: { userId_clientRequestId: { userId, clientRequestId: input.requestId } },
        include: { bets: true },
      });
      if (existing) {
        const w = await tx.wallet.findUniqueOrThrow({ where: { userId }, select: { balance: true } });
        return { game: existing, balance: w.balance, shoeId: existing.shoeId, replay: true };
      }

      const cfg = await getSetting('game.baccarat', tx);
      if (!cfg.enabled) throw new AppError('GAME_DISABLED');

      // Per-bet validation.
      const bets: Bets = {};
      let total = 0n;
      for (const type of MAIN_BETS) {
        const raw = input.bets[type];
        if (raw === undefined || raw === 0) continue;
        if (!Number.isSafeInteger(raw) || raw < 0) throw new AppError('VALIDATION', 'Invalid bet amount');
        if (raw < cfg.minBet) throw new AppError('BET_TOO_LOW', `Minimum bet is ${cfg.minBet.toLocaleString('en-US')} per wager.`, { min: cfg.minBet, type });
        if (raw > cfg.maxBet) throw new AppError('BET_TOO_HIGH', `Maximum bet is ${cfg.maxBet.toLocaleString('en-US')} per wager.`, { max: cfg.maxBet, type });
        bets[type] = toBig(raw);
        total += toBig(raw);
      }
      if (total <= 0n) throw new AppError('BET_TOO_LOW', 'Place a bet on Player, Banker or Tie.', { min: cfg.minBet });

      const id = newId();
      await placeWager(
        tx,
        {
          userId,
          game: 'BACCARAT',
          amount: total,
          minBet: null,
          maxBet: null,
          referenceType: REF,
          referenceId: id,
          idempotencyKey: `bac:${id}:bet`,
          metadata: { bets: Object.fromEntries(Object.entries(bets).map(([k, v]) => [k, toNum(v!)])) },
        },
        post,
      );

      // DEV: forced cards (no-op unless dev tools are enabled). Consumed only once a wager is accepted.
      const forced = await consumeForcedOutcome<{ cards: string[] }>('baccarat', userId);
      const { shoe } = await ensureShoe(tx, userId, cfg);
      const cards = shoe.cards as string[];
      const from = shoe.position;
      let pos = from;
      const forcedQueue = forced?.cards?.filter((c) => typeof c === 'string') ?? [];
      const isForced = forcedQueue.length > 0;
      let round: BaccaratRound;
      try {
        round = playBaccarat(() => {
          if (forcedQueue.length) return forcedQueue.shift()!.toUpperCase();
          if (pos >= cards.length) throw new Error('Shoe exhausted mid-round');
          return cards[pos++];
        });
      } catch (err) {
        logger.error({ err, userId, shoeId: shoe.id }, 'baccarat engine error');
        throw new AppError(isForced ? 'VALIDATION' : 'INTERNAL', isForced ? 'Invalid forced cards' : undefined);
      }

      const moved = await tx.cardShoe.updateMany({
        where: { id: shoe.id, version: shoe.version, status: 'ACTIVE' },
        data: { position: pos, roundsDealt: { increment: 1 }, version: { increment: 1 } },
      });
      if (moved.count !== 1) throw new AppError('CONFLICT', 'Shoe changed during deal — please try again.');

      const settled = settleBets(bets, round, { bankerCommissionBps: cfg.bankerCommissionBps, tiePayout: cfg.tiePayout });
      const seed = await tx.serverSeed.findUniqueOrThrow({ where: { id: shoe.serverSeedId }, select: { seedHash: true, clientSeed: true } });
      const shoeNumber = await shoeNumberOf(tx, userId, shoe);
      const rules: StoredRules = {
        decks: shoe.decks,
        bankerCommissionBps: cfg.bankerCommissionBps,
        tiePayout: cfg.tiePayout,
        minBet: cfg.minBet,
        maxBet: cfg.maxBet,
        shoeNumber,
        positions: pos > from ? [from, pos] : null,
        ...(isForced ? { forced: true } : {}),
      };

      const game = await tx.baccaratGame.create({
        data: {
          id,
          userId,
          clientRequestId: input.requestId,
          shoeId: shoe.id,
          shoeRound: shoe.roundsDealt + 1,
          playerCards: round.playerCards,
          bankerCards: round.bankerCards,
          playerTotal: round.playerTotal,
          bankerTotal: round.bankerTotal,
          outcome: round.outcome,
          natural: round.natural,
          totalWagered: settled.totalWagered,
          totalPayout: settled.totalPayout,
          rules: rules as unknown as object,
          serverSeedHash: seed.seedHash,
          clientSeed: seed.clientSeed,
          nonce: shoe.nonce,
          bets: { create: settled.settled.map((s) => ({ type: s.type, amount: s.amount, payout: s.payout, outcome: s.outcome })) },
        },
        include: { bets: true },
      });

      const credit = await creditPayout(
        tx,
        { userId, game: 'BACCARAT', amount: settled.totalPayout, referenceType: REF, referenceId: id, idempotencyKey: `bac:${id}:settle` },
        post,
      );

      await recordRound(tx, {
        userId,
        game: 'BACCARAT',
        referenceId: id,
        wager: settled.totalWagered,
        payout: settled.totalPayout,
        multiplierX100: settled.totalWagered > 0n ? Number((settled.totalPayout * 100n) / settled.totalWagered) : null,
        summary: summarize(round),
        extraStats: {
          bacHands: { increment: 1 },
          ...(round.outcome === 'PLAYER' ? { bacPlayerWins: { increment: 1 } } : {}),
          ...(round.outcome === 'BANKER' ? { bacBankerWins: { increment: 1 } } : {}),
          ...(round.outcome === 'TIE' ? { bacTies: { increment: 1 } } : {}),
        },
      });

      const balance = credit ? credit.balance : await tx.wallet.findUniqueOrThrow({ where: { userId }, select: { balance: true } }).then((w) => w.balance);
      return { game, balance, shoeId: shoe.id, replay: false };
    }, { timeout: 15_000 });

    await post.flush();
    const shoe = await prisma.cardShoe.findUnique({ where: { id: res.shoeId } });
    const cfg = await getSetting('game.baccarat');
    const shoeInfo = shoe ? shoeDto(shoe, await shoeNumberOf(prisma, userId, shoe), cfg.penetration) : null;
    return resultDto(res.game, res.balance, shoeInfo);
  } catch (err) {
    if (err instanceof AppError) throw err;
    // A concurrent duplicate request (same requestId) lost the unique race — return the winner.
    const winner = await prisma.baccaratGame.findUnique({
      where: { userId_clientRequestId: { userId, clientRequestId: input.requestId } },
      include: { bets: true },
    });
    if (winner) {
      const w = await prisma.wallet.findUnique({ where: { userId }, select: { balance: true } });
      return resultDto(winner, w?.balance ?? null, null);
    }
    logger.error({ err, userId }, 'baccarat deal failed');
    throw new AppError('INTERNAL');
  }
}

export function summarize(r: Pick<BaccaratRound, 'outcome' | 'playerTotal' | 'bankerTotal' | 'natural'>): string {
  const head = r.outcome === 'TIE' ? `Tie ${r.playerTotal}–${r.bankerTotal}` : `${r.outcome === 'PLAYER' ? 'Player' : 'Banker'} ${r.outcome === 'PLAYER' ? r.playerTotal : r.bankerTotal}–${r.outcome === 'PLAYER' ? r.bankerTotal : r.playerTotal}`;
  return r.natural ? `${head} · Natural` : head;
}

/** Table state for page load / refresh restore. */
export async function getState(userId: string): Promise<BaccaratStateDto> {
  const cfg = await getSetting('game.baccarat');
  const shoe = await prisma.cardShoe.findFirst({ where: { userId, game: GAME, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } });
  const [beads, last] = await Promise.all([
    shoe
      ? prisma.baccaratGame.findMany({
          where: { userId, shoeId: shoe.id },
          orderBy: { shoeRound: 'asc' },
          select: { outcome: true, playerTotal: true, bankerTotal: true, natural: true },
        })
      : Promise.resolve([]),
    prisma.baccaratGame.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, include: { bets: true } }),
  ]);
  const shoeInfo = shoe ? shoeDto(shoe, await shoeNumberOf(prisma, userId, shoe), cfg.penetration) : null;
  return {
    config: configDto(cfg),
    shoe: shoeInfo,
    beadPlate: beads.map(bead),
    lastGame: last ? resultDto(last, null, null) : null,
  };
}

export async function getRoundDetail(userId: string, id: string, opts: { allowOthers?: boolean } = {}): Promise<RoundDetail<BaccaratRoundData>> {
  const g = await prisma.baccaratGame.findUnique({ where: { id }, include: { bets: true } });
  if (!g || (g.userId !== userId && !opts.allowOthers)) throw new AppError('NOT_FOUND', 'Round not found');
  const rules = g.rules as unknown as StoredRules;
  const round = roundFromGame(g);
  const fairness = await fairnessInfo(g.userId, g.serverSeedHash, g.clientSeed, g.nonce);
  const dto = resultDto(g, null, null);
  return {
    game: 'BACCARAT',
    id: g.id,
    variant: null,
    createdAt: g.createdAt.toISOString(),
    wager: toNum(g.totalWagered),
    payout: toNum(g.totalPayout),
    net: toNum(g.totalPayout - g.totalWagered),
    summary: summarize(round),
    fairness: {
      ...fairness,
      extra: { decks: rules.decks, shoeId: g.shoeId, positions: rules.positions, shoeRound: g.shoeRound, shoeNumber: rules.shoeNumber },
    },
    forced: rules.forced === true,
    data: {
      deal: dto.deal,
      playerCards: dto.playerCards,
      bankerCards: dto.bankerCards,
      playerTotal: dto.playerTotal,
      bankerTotal: dto.bankerTotal,
      natural: dto.natural,
      naturalSide: dto.naturalSide,
      outcome: dto.outcome,
      bets: dto.bets,
      shoeRound: g.shoeRound,
      shoeNumber: rules.shoeNumber,
      rules: { bankerCommissionBps: rules.bankerCommissionBps, tiePayout: rules.tiePayout, decks: rules.decks },
    },
  };
}

/** DEV ONLY: shoe position + upcoming cards. Never reachable in production. */
export async function getDevShoe(userId: string) {
  if (!devToolsEnabled()) throw new AppError('NOT_FOUND');
  const shoe = await prisma.cardShoe.findFirst({ where: { userId, game: GAME, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } });
  if (!shoe) return { shoe: null };
  const cards = shoe.cards as string[];
  return {
    shoe: {
      id: shoe.id,
      decks: shoe.decks,
      position: shoe.position,
      cutCard: shoe.cutCard,
      remaining: cards.length - shoe.position,
      roundsDealt: shoe.roundsDealt,
      nextCards: cards.slice(shoe.position, shoe.position + 12),
    },
  };
}
