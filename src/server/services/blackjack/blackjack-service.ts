import { randomBytes } from 'node:crypto';
import type { BlackjackGame, BlackjackStatus, CardShoe, Prisma } from '@prisma/client';
import { transaction, type Tx } from '@/server/db';
import { AppError } from '@/lib/errors';
import { toBig, toNum } from '@/lib/money';
import { logger } from '@/server/logger';
import { PostCommit } from '@/server/realtime/events';
import { lockWallet } from '@/server/services/wallet/wallet-service';
import { placeWager, creditPayout } from '@/server/services/wagering';
import { recordRound, bumpMax } from '@/server/services/progression/stats';
import { getSetting } from '@/server/services/settings/settings-service';
import type { BlackjackConfigT } from '@/server/services/settings/schemas';
import { consumeForcedOutcome } from '@/server/services/dev/forced-outcomes';
import { RANKS, SUITS } from '@/engines/cards/cards';
import {
  BlackjackEngineError,
  CardSource,
  ShoeExhaustedError,
  actionStake,
  applyAction,
  legalActions,
  mainPayout,
  startRound,
  toTableView,
  handValue,
  type BlackjackAction,
  type BlackjackRules,
  type BlackjackState,
  type Card,
  type DealtCard,
  type DrawFn,
  type StepResult,
  type TableView,
} from '@/engines/blackjack';
import { advanceShoe, openShoe, retireShoe, shoeCards, shoeForNewRound, shoeInfo, type ShoeInfo } from './shoe-service';

/**
 * BlackjackService — server-authoritative blackjack rounds.
 *
 * Every request runs in ONE transaction:
 *   lock wallet → replay check (requestId) → validate → extra wager (if any)
 *   → pure engine step drawing from the user's shoe → version-checked persist
 *   → settlement (single payout credit + history/stats) when the round ends.
 *
 * Ledger idempotency keys:
 *   bj:<id>:bet · bj:<id>:double:<hand> · bj:<id>:split:<n> · bj:<id>:insurance
 *   bj:<id>:settle (hand returns) · bj:<id>:insurance:win (insurance return)
 */

export const REF_TYPE = 'BLACKJACK_GAME';

/** Shoe slice consumed by a round (positions are [from, to) in that shoe). */
interface Segment {
  shoeId: string;
  from: number;
  to: number;
}

/** Shape of BlackjackGame.state (server only — never sent as-is). */
interface StoredRound {
  engine: BlackjackState;
  segments: Segment[];
  /** Dev forced cards not yet dealt (server only). */
  forcedQueue: Card[];
  forced: boolean;
  seq: number;
}

export type BlackjackStatusT = BlackjackStatus;

export interface BlackjackRoundView extends TableView {
  id: string;
  status: BlackjackStatus;
  settled: boolean;
  net: number;
  forced: boolean;
  createdAt: string;
  settledAt: string | null;
}

export interface BlackjackResponse {
  game: BlackjackRoundView;
  balance: number;
  shoe: ShoeInfo;
  replayed?: boolean;
}

export interface BlackjackTableConfig {
  enabled: boolean;
  minBet: number;
  maxBet: number;
  decks: number;
  penetration: number;
  dealerHitsSoft17: boolean;
  blackjackPayout: '3:2' | '6:5';
  allowSplit: boolean;
  maxHands: number;
  doubleAfterSplit: boolean;
  resplitAces: boolean;
  hitSplitAces: boolean;
  insurance: boolean;
}

export function rulesFromConfig(cfg: BlackjackConfigT): BlackjackRules {
  return {
    decks: cfg.decks,
    dealerHitsSoft17: cfg.dealerHitsSoft17,
    blackjackPayout: cfg.blackjackPayout,
    allowSplit: cfg.allowSplit,
    maxHands: cfg.maxHands,
    doubleAfterSplit: cfg.doubleAfterSplit,
    resplitAces: cfg.resplitAces,
    hitSplitAces: cfg.hitSplitAces,
    insurance: cfg.insurance,
  };
}

function tableConfig(cfg: BlackjackConfigT): BlackjackTableConfig {
  return { ...cfg };
}

function newGameId() {
  return `c${Date.now().toString(36)}${randomBytes(9).toString('hex')}`;
}

function statusFor(s: BlackjackState): BlackjackStatus {
  if (s.phase === 'INSURANCE') return 'INSURANCE_OFFERED';
  if (s.phase === 'PLAYER') return 'PLAYER_TURN';
  // Engine finished the round; DEALER_TURN marks "awaiting settlement" until
  // the conditional SETTLED transition inside the same transaction.
  return 'DEALER_TURN';
}

const VALID_CARD = new RegExp(`^[${RANKS.join('')}][${SUITS.join('')}]$`);

function stored(game: Pick<BlackjackGame, 'state'>): StoredRound {
  return game.state as unknown as StoredRound;
}

export function toRoundView(game: Pick<BlackjackGame, 'id' | 'status' | 'state' | 'createdAt' | 'settledAt'>): BlackjackRoundView {
  const st = stored(game);
  const table = toTableView(st.engine);
  const settled = game.status === 'SETTLED';
  return {
    ...table,
    id: game.id,
    status: game.status,
    settled,
    net: settled ? table.totalPayout - table.totalWagered : 0,
    forced: st.forced,
    createdAt: game.createdAt.toISOString(),
    settledAt: game.settledAt?.toISOString() ?? null,
  };
}

async function currentBalance(tx: Tx, userId: string) {
  const w = await tx.wallet.findUniqueOrThrow({ where: { userId }, select: { balance: true } });
  return toNum(w.balance);
}

async function respond(tx: Tx, userId: string, game: BlackjackGame, extra: { replayed?: boolean } = {}): Promise<BlackjackResponse> {
  const cfg = await getSetting('game.blackjack', tx);
  return {
    game: toRoundView(game),
    balance: await currentBalance(tx, userId),
    shoe: await shoeInfo(tx, userId, cfg),
    ...extra,
  };
}

/**
 * Run a pure engine step against the round's shoe. If the shoe runs out
 * mid-round (only possible with very few decks) a continuation shoe is opened
 * from the fairness seed and the step is replayed from the same input state —
 * the engine is deterministic, so the replay is exact.
 */
async function runStep(
  tx: Tx,
  userId: string,
  cfg: BlackjackConfigT,
  firstShoe: CardShoe,
  forcedQueue: Card[],
  step: (draw: DrawFn) => StepResult,
) {
  const shoes: CardShoe[] = [firstShoe];
  for (let attempt = 0; attempt < 4; attempt++) {
    const src = new CardSource(
      shoes.map((s) => ({ cards: shoeCards(s), position: s.position })),
      forcedQueue,
    );
    try {
      const result = step(src.draw);
      return { result, shoes, consumed: src.consumed, forcedQueue: src.remainingForced() };
    } catch (err) {
      if (!(err instanceof ShoeExhaustedError)) throw err;
      logger.info({ userId, shoeId: shoes[shoes.length - 1].id }, 'blackjack shoe exhausted mid-round; opening continuation shoe');
      const last = shoes[shoes.length - 1];
      await retireShoe(tx, last.id);
      const next = await openShoe(tx, userId, cfg.decks, cfg.penetration);
      // retireShoe bumped the old row's version; keep our copy in sync.
      shoes[shoes.length - 1] = { ...last, version: last.version + 1 };
      shoes.push(next);
    }
  }
  throw new AppError('INTERNAL', 'Unable to deal from shoe');
}

/** Persist shoe positions consumed by a step and extend the round's segments. */
async function commitShoes(tx: Tx, shoes: CardShoe[], consumed: number[], segments: Segment[], newRound: boolean) {
  for (let k = 0; k < shoes.length; k++) {
    const shoe = shoes[k];
    const n = consumed[k];
    if (n > 0 || (newRound && k === 0)) await advanceShoe(tx, shoe, n, { newRound: newRound && k === 0 });
    if (n > 0) {
      const seg = segments.find((s) => s.shoeId === shoe.id);
      if (seg) seg.to = shoe.position + n;
      else segments.push({ shoeId: shoe.id, from: shoe.position, to: shoe.position + n });
    }
    // Every shoe but the last was fully dealt by a continuation step.
    if (k < shoes.length - 1) await retireShoe(tx, shoe.id);
  }
}

function handRows(s: BlackjackState) {
  return s.hands.map((h, index) => ({
    index,
    cards: h.cards,
    bet: BigInt(h.bet),
    doubled: h.doubled,
    fromSplit: h.fromSplit,
    outcome: h.outcome,
    payout: BigInt(h.payout),
  }));
}

async function syncHands(tx: Tx, gameId: string, s: BlackjackState) {
  for (const row of handRows(s)) {
    await tx.blackjackHand.upsert({
      where: { gameId_index: { gameId, index: row.index } },
      create: { gameId, ...row },
      update: row,
    });
  }
}

function gameColumns(s: BlackjackState) {
  return {
    totalWagered: BigInt(s.totalWagered),
    insuranceBet: BigInt(s.insurance.bet),
    dealerCards: s.dealer.cards,
    activeHand: s.active,
  };
}

function resultSummary(s: BlackjackState): string {
  const dealer = handValue(s.dealer.cards).total;
  const dealerTxt = s.dealerBlackjack ? 'dealer blackjack' : dealer > 21 ? 'dealer bust' : `dealer ${dealer}`;
  if (s.hands.length === 1) {
    const h = s.hands[0];
    const pv = handValue(h.cards).total;
    const label: Record<string, string> = { WIN: 'Win', LOSS: 'Loss', PUSH: 'Push', BLACKJACK: 'Blackjack', BUST: 'Bust' };
    const doubled = h.doubled ? ' (doubled)' : '';
    if (h.outcome === 'BLACKJACK') return 'Blackjack';
    return `${label[h.outcome ?? 'LOSS']}${doubled} · ${pv > 21 ? 'bust' : pv} vs ${dealerTxt}`;
  }
  const count = (o: string[]) => s.hands.filter((h) => o.includes(h.outcome ?? '')).length;
  const parts = [`${s.hands.length} hands`];
  const w = count(['WIN', 'BLACKJACK']);
  const p = count(['PUSH']);
  const l = count(['LOSS', 'BUST']);
  if (w) parts.push(`${w}W`);
  if (p) parts.push(`${p}P`);
  if (l) parts.push(`${l}L`);
  return `${parts.join(' · ')} vs ${dealerTxt}`;
}

/** Settle a finished round: conditional SETTLED transition, payouts, history, stats. */
async function settle(tx: Tx, userId: string, gameId: string, s: BlackjackState, post: PostCommit) {
  const main = mainPayout(s);
  const insWin = BigInt(s.insurance.payout);
  const total = main + insWin;
  const wager = BigInt(s.totalWagered);
  const upd = await tx.blackjackGame.updateMany({
    where: { id: gameId, status: { not: 'SETTLED' } },
    data: {
      status: 'SETTLED',
      settledAt: new Date(),
      totalPayout: total,
      insurancePayout: insWin,
      result: resultSummary(s),
    },
  });
  if (upd.count === 0) return; // already settled by an earlier request

  if (main > 0n) {
    await creditPayout(
      tx,
      { userId, game: 'BLACKJACK', amount: main, referenceType: REF_TYPE, referenceId: gameId, idempotencyKey: `bj:${gameId}:settle` },
      post,
    );
  }
  if (insWin > 0n) {
    await creditPayout(
      tx,
      { userId, game: 'BLACKJACK', amount: insWin, referenceType: REF_TYPE, referenceId: gameId, idempotencyKey: `bj:${gameId}:insurance:win`, metadata: { insurance: true } },
      post,
    );
  }

  const n = (o: string[]) => s.hands.filter((h) => o.includes(h.outcome ?? '')).length;
  const bjHand = s.hands.find((h) => h.outcome === 'BLACKJACK');
  await recordRound(tx, {
    userId,
    game: 'BLACKJACK',
    referenceId: gameId,
    wager,
    payout: total,
    multiplierX100: wager > 0n ? Number((total * 100n) / wager) : null,
    summary: resultSummary(s),
    extraStats: {
      bjHands: { increment: s.hands.length },
      bjWins: { increment: n(['WIN', 'BLACKJACK']) },
      bjLosses: { increment: n(['LOSS', 'BUST']) },
      bjPushes: { increment: n(['PUSH']) },
      bjBlackjacks: { increment: n(['BLACKJACK']) },
    },
  });
  if (bjHand) await bumpMax(tx, userId, 'bjLargestBlackjackWin', BigInt(bjHand.payout));
}

function engineError(err: unknown): never {
  if (err instanceof BlackjackEngineError) {
    throw new AppError(err.code === 'INVALID_BET' ? 'VALIDATION' : 'ACTION_UNAVAILABLE', err.message);
  }
  throw err;
}

// ───────────────────────────────────────────────────────────── public API

export async function getActive(userId: string) {
  return transaction(async (tx) => {
    const cfg = await getSetting('game.blackjack', tx);
    const game = await tx.blackjackGame.findFirst({
      where: { userId, status: { not: 'SETTLED' } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      game: game ? toRoundView(game) : null,
      config: tableConfig(cfg),
      shoe: await shoeInfo(tx, userId, cfg),
      balance: await currentBalance(tx, userId),
    };
  });
}

export async function deal(userId: string, input: { bet: number; requestId: string }): Promise<BlackjackResponse> {
  const post = new PostCommit();
  const res = await transaction(async (tx) => {
    await lockWallet(tx, userId);

    const existing = await tx.blackjackGame.findUnique({
      where: { userId_clientRequestId: { userId, clientRequestId: input.requestId } },
    });
    if (existing) return respond(tx, userId, existing, { replayed: true });

    const open = await tx.blackjackGame.findFirst({ where: { userId, status: { not: 'SETTLED' } }, select: { id: true } });
    if (open) throw new AppError('ROUND_IN_PROGRESS', 'Finish your current hand first.', { gameId: open.id });

    const cfg = await getSetting('game.blackjack', tx);
    const bet = toBig(input.bet);
    const gameId = newGameId();

    // Eligibility (limits, exclusion, min/max, balance) + BET ledger entry.
    await placeWager(
      tx,
      { userId, game: 'BLACKJACK', amount: bet, referenceType: REF_TYPE, referenceId: gameId, idempotencyKey: `bj:${gameId}:bet` },
      post,
    );

    const { shoe } = await shoeForNewRound(tx, userId, cfg);
    const seed = await tx.serverSeed.findUniqueOrThrow({ where: { id: shoe.serverSeedId }, select: { seedHash: true, clientSeed: true } });

    const forcedRaw = await consumeForcedOutcome<{ cards?: unknown }>('blackjack', userId);
    const forcedCards = Array.isArray(forcedRaw?.cards)
      ? (forcedRaw.cards as unknown[]).filter((c): c is string => typeof c === 'string' && VALID_CARD.test(c.toUpperCase())).map((c) => c.toUpperCase())
      : [];
    const forced = forcedCards.length > 0;

    const rules = rulesFromConfig(cfg);
    let step;
    try {
      step = await runStep(tx, userId, cfg, shoe, forcedCards, (draw) => startRound(rules, bet, draw));
    } catch (err) {
      engineError(err);
    }
    const segments: Segment[] = [];
    await commitShoes(tx, step.shoes, step.consumed, segments, true);
    if (segments.length === 0) segments.push({ shoeId: shoe.id, from: shoe.position, to: shoe.position });

    const s = step.result.state;
    const st: StoredRound = { engine: s, segments, forcedQueue: step.forcedQueue, forced, seq: 0 };
    const game = await tx.blackjackGame.create({
      data: {
        id: gameId,
        userId,
        clientRequestId: input.requestId,
        shoeId: shoe.id,
        status: statusFor(s),
        baseBet: bet,
        ...gameColumns(s),
        rules: rules as unknown as Prisma.InputJsonValue,
        state: st as unknown as Prisma.InputJsonValue,
        serverSeedHash: seed.seedHash,
        clientSeed: seed.clientSeed,
        nonce: shoe.nonce,
        hands: { create: handRows(s) },
        actions: {
          create: [{ seq: 0, action: 'DEAL', handIndex: 0, card: step.result.dealt as unknown as Prisma.InputJsonValue }],
        },
      },
    });

    if (s.phase === 'SETTLED') await settle(tx, userId, gameId, s, post);
    const fresh = await tx.blackjackGame.findUniqueOrThrow({ where: { id: game.id } });
    return respond(tx, userId, fresh);
  });
  await post.flush();
  return res;
}

function extraWagerKey(gameId: string, s: BlackjackState, action: BlackjackAction): string {
  switch (action) {
    case 'DOUBLE':
      return `bj:${gameId}:double:${s.active}`;
    case 'SPLIT':
      return `bj:${gameId}:split:${s.splits + 1}`;
    case 'INSURANCE':
      return `bj:${gameId}:insurance`;
    default:
      throw new Error('no wager for action');
  }
}

export async function act(
  userId: string,
  input: { gameId: string; action: BlackjackAction; requestId: string },
): Promise<BlackjackResponse> {
  const post = new PostCommit();
  const res = await transaction(async (tx) => {
    await lockWallet(tx, userId);
    const game = await tx.blackjackGame.findFirst({ where: { id: input.gameId, userId } });
    if (!game) throw new AppError('NOT_FOUND', 'Hand not found.');

    // Duplicate request → current state, nothing applied twice.
    const dup = await tx.blackjackAction.findUnique({
      where: { gameId_requestId: { gameId: game.id, requestId: input.requestId } },
      select: { id: true },
    });
    if (dup) return respond(tx, userId, game, { replayed: true });

    if (game.status === 'SETTLED') throw new AppError('ACTION_UNAVAILABLE', 'This hand is already finished.');
    const st = stored(game);
    const s0 = st.engine;
    if (!legalActions(s0).includes(input.action)) {
      throw new AppError('ACTION_UNAVAILABLE', `${input.action.toLowerCase().replace('_', ' ')} is not available right now.`);
    }

    // Extra stake (double / split / insurance) goes through eligibility, so
    // limits and self-exclusion apply. HIT / STAND never need it: an
    // accepted round can always be finished.
    const extra = actionStake(s0, input.action);
    if (extra > 0n) {
      await placeWager(
        tx,
        {
          userId,
          game: 'BLACKJACK',
          amount: extra,
          minBet: null,
          maxBet: null,
          referenceType: REF_TYPE,
          referenceId: game.id,
          idempotencyKey: extraWagerKey(game.id, s0, input.action),
          metadata: { action: input.action, hand: s0.active },
        },
        post,
      );
    }

    const cfg = await getSetting('game.blackjack', tx);
    const lastSeg = st.segments[st.segments.length - 1];
    const shoe = await tx.cardShoe.findUniqueOrThrow({ where: { id: lastSeg?.shoeId ?? game.shoeId } });

    let step;
    try {
      step = await runStep(tx, userId, cfg, shoe, st.forcedQueue, (draw) => applyAction(s0, input.action, draw));
    } catch (err) {
      engineError(err);
    }
    const segments = st.segments.map((x) => ({ ...x }));
    await commitShoes(tx, step.shoes, step.consumed, segments, false);

    const s = step.result.state;
    const seq = st.seq + 1;
    const next: StoredRound = { ...st, engine: s, segments, forcedQueue: step.forcedQueue, seq };

    const upd = await tx.blackjackGame.updateMany({
      where: { id: game.id, version: game.version, status: game.status },
      data: {
        status: statusFor(s),
        ...gameColumns(s),
        state: next as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });
    if (upd.count !== 1) throw new AppError('CONFLICT', 'This hand changed during your request. Please retry.');

    await syncHands(tx, game.id, s);
    await tx.blackjackAction.create({
      data: {
        gameId: game.id,
        seq,
        action: input.action,
        handIndex: s0.active,
        card: step.result.dealt.length ? (step.result.dealt as unknown as Prisma.InputJsonValue) : undefined,
        requestId: input.requestId,
      },
    });

    if (s.phase === 'SETTLED') await settle(tx, userId, game.id, s, post);
    const fresh = await tx.blackjackGame.findUniqueOrThrow({ where: { id: game.id } });
    return respond(tx, userId, fresh);
  });
  await post.flush();
  return res;
}

// ───────────────────────────────────────────────────────────── history detail

export interface BlackjackRoundData {
  rules: BlackjackRules;
  baseBet: number;
  dealer: { cards: Card[]; total: number; blackjack: boolean };
  hands: {
    cards: Card[];
    bet: number;
    doubled: boolean;
    fromSplit: boolean;
    total: number;
    outcome: string | null;
    payout: number;
  }[];
  insurance: { taken: boolean; bet: number; payout: number } | null;
  actions: { seq: number; action: string; hand: number; cards: { to: 'P' | 'D'; hand: number; card: Card }[] }[];
  /** All cards dealt this round, in deal order. */
  dealOrder: Card[];
  segments: Segment[];
}

export async function getRoundData(userId: string, gameId: string) {
  return transaction(async (tx) => {
    const game = await tx.blackjackGame.findFirst({
      where: { id: gameId, userId },
      include: { actions: { orderBy: { seq: 'asc' } } },
    });
    if (!game) throw new AppError('NOT_FOUND', 'Round not found.');
    if (game.status !== 'SETTLED') throw new AppError('ROUND_IN_PROGRESS', 'This hand is still in progress.');
    const st = stored(game);
    const s = st.engine;
    const shoe = await tx.cardShoe.findUnique({ where: { id: game.shoeId }, select: { decks: true } });
    const all: { id: number; card: Card }[] = [
      ...s.dealer.cards.map((card, i) => ({ id: s.dealer.ids[i], card })),
      ...s.hands.flatMap((h) => h.cards.map((card, i) => ({ id: h.ids[i], card }))),
    ].sort((a, b) => a.id - b.id);
    const data: BlackjackRoundData = {
      rules: s.rules,
      baseBet: Number(s.baseBet),
      dealer: { cards: s.dealer.cards, total: handValue(s.dealer.cards).total, blackjack: !!s.dealerBlackjack },
      hands: s.hands.map((h) => ({
        cards: h.cards,
        bet: Number(h.bet),
        doubled: h.doubled,
        fromSplit: h.fromSplit,
        total: handValue(h.cards).total,
        outcome: h.outcome,
        payout: Number(h.payout),
      })),
      insurance: s.insurance.taken ? { taken: true, bet: Number(s.insurance.bet), payout: Number(s.insurance.payout) } : null,
      actions: game.actions.map((a) => ({
        seq: a.seq,
        action: a.action,
        hand: a.handIndex,
        cards: ((a.card as unknown as DealtCard[] | null) ?? []).map((d) => ({ to: d.to, hand: d.hand, card: d.card })),
      })),
      dealOrder: all.map((x) => x.card),
      segments: st.segments,
    };
    return { game, data, decks: shoe?.decks ?? s.rules.decks, forced: st.forced };
  });
}
