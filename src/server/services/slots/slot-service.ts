import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma, transaction, type Tx } from '@/server/db';
import { AppError } from '@/lib/errors';
import { toNum } from '@/lib/money';
import { logger } from '@/server/logger';
import { PostCommit } from '@/server/realtime/events';
import { lockWallet } from '@/server/services/wallet/wallet-service';
import { placeWager, creditPayout } from '@/server/services/wagering';
import { assertPlayAllowed } from '@/server/services/responsible-play/eligibility';
import { drawSeed, fairnessInfo } from '@/server/services/fairness/seed-service';
import { recordRound, bumpMax } from '@/server/services/progression/stats';
import { getSetting } from '@/server/services/settings/settings-service';
import { consumeForcedOutcome, peekForcedOutcome } from '@/server/services/dev/forced-outcomes';
import { getSlotDefinition } from '@/engines/slots/definitions';
import { parseBonusState, spin } from '@/engines/slots/engine';
import { searchOutcome, type ForcedSlotTrigger } from '@/engines/slots/forced';
import { toPublicDefinition, type PublicSlotDefinition } from '@/engines/slots/public';
import type { BonusState, SlotDefinition, SpinOutcome } from '@/engines/slots/types';
import type { RoundDetail } from '@/lib/round-detail';

/**
 * Slot service — paid spins, free spins, persistence, settlement.
 *
 * One transaction per spin:
 *   lockWallet → replay check (SlotSpin.clientRequestId) → load SlotGame
 *   → paid: validate bet level + placeWager(`slot:${spinId}:bet`)
 *     free: assertPlayAllowed (cooldown/exclusion block free spins; state kept)
 *   → drawSeed → SlotEngine.spin (or a dev forced outcome)
 *   → SlotGame.bonusState (conditional on version) → SlotSpin row
 *   → creditPayout(`slot:${spinId}:win`) → recordRound when the ROUND ends.
 *
 * ROUND = a paid spin plus all free spins it triggers. GameHistory/PlayerStats
 * get one row per round (referenceId = the paid spin's id): immediately for a
 * spin without a bonus, or when the last free spin settles, with the
 * aggregated payout. Credits are paid per spin as each spin settles.
 */

export interface ForcedSlotOutcome {
  slotId: string;
  trigger: ForcedSlotTrigger;
}

/** SlotGame.bonusState JSON */
interface StoredBonus {
  engine: BonusState;
  /** id of the paid spin that triggered the bonus (GameHistory referenceId) */
  roundId: string;
  /** stake charged by the trigger spin */
  wager: number;
}

/** SlotSpin.outcome JSON */
interface StoredSpin {
  outcome: SpinOutcome;
  roundId: string;
  bonusStateBefore: BonusState | null;
  forced?: boolean;
}

export interface PublicBonus {
  remaining: number;
  total: number;
  played: number;
  multiplier: number;
  cascadeLevel: number;
  betLevel: number;
  bonusWin: number;
  roundWin: number;
  relics: number;
  relicTier: number;
}

export interface PublicSpin {
  id: string;
  slotId: string;
  roundId: string;
  createdAt: string;
  /** Credits charged (0 for free spins) */
  bet: number;
  betLevel: number;
  payout: number;
  isFreeSpin: boolean;
  forced: boolean;
  outcome: SpinOutcome;
}

export interface SlotStateResponse {
  definition: PublicSlotDefinition;
  betLevels: number[];
  enabled: boolean;
  bonus: PublicBonus | null;
  lastSpin: PublicSpin | null;
}

export interface SlotSpinResponse {
  spin: PublicSpin;
  balance: number;
  bonus: PublicBonus | null;
  replay: boolean;
}

export interface SlotRoundData {
  slotId: string;
  betLevel: number;
  complete: boolean;
  spins: {
    id: string;
    isFreeSpin: boolean;
    nonce: number;
    serverSeedHash: string;
    /** Revealed server seed of this spin's seed pair (null until rotated). */
    serverSeed: string | null;
    clientSeed: string;
    bonusStateBefore: BonusState | null;
    payout: number;
    outcome: SpinOutcome;
  }[];
}

function requireDef(slotId: string): SlotDefinition {
  const def = getSlotDefinition(slotId);
  if (!def) throw new AppError('NOT_FOUND', 'Unknown slot machine');
  return def;
}

function parseStored(def: SlotDefinition, raw: Prisma.JsonValue | null): StoredBonus | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  try {
    const engine = parseBonusState(def, r.engine);
    if (!engine || typeof r.roundId !== 'string' || typeof r.wager !== 'number') return null;
    return { engine, roundId: r.roundId, wager: r.wager };
  } catch (err) {
    logger.error({ err, slotId: def.id }, 'slots: corrupt bonus state ignored');
    return null;
  }
}

const toPublicBonus = (s: StoredBonus | null): PublicBonus | null =>
  s
    ? {
        remaining: s.engine.remaining,
        total: s.engine.total,
        played: s.engine.played,
        multiplier: s.engine.multiplier,
        cascadeLevel: s.engine.cascadeLevel,
        betLevel: s.engine.betLevel,
        bonusWin: s.engine.bonusWin,
        roundWin: s.engine.roundWin,
        relics: s.engine.relics,
        relicTier: s.engine.relicTier,
      }
    : null;

type SpinRow = Prisma.SlotSpinGetPayload<object>;

function toPublicSpin(row: SpinRow): PublicSpin {
  const stored = row.outcome as unknown as StoredSpin;
  return {
    id: row.id,
    slotId: row.slotId,
    roundId: stored.roundId,
    createdAt: row.createdAt.toISOString(),
    bet: toNum(row.bet),
    betLevel: toNum(row.betLevel),
    payout: toNum(row.payout),
    isFreeSpin: row.isFreeSpin,
    forced: !!stored.forced,
    outcome: stored.outcome,
  };
}

const newSpinId = () => `sp${randomBytes(11).toString('hex')}`;

function roundSummary(def: SlotDefinition, wager: bigint, payout: bigint, freeSpins: number): string {
  const x = wager > 0n ? Number((payout * 100n) / wager) / 100 : 0;
  const win = payout > 0n ? `${x.toFixed(2)}× win` : 'No win';
  return freeSpins > 0 ? `${def.name} · ${freeSpins} free spins · ${win}` : `${def.name} · ${win}`;
}

async function bumpSpinsBySlot(tx: Tx, userId: string, slotId: string, n: number) {
  await tx.$executeRaw`
    UPDATE "PlayerStats"
       SET "slotSpinsBySlot" = jsonb_set(
             COALESCE("slotSpinsBySlot", '{}'::jsonb),
             ARRAY[${slotId}]::text[],
             to_jsonb(COALESCE(("slotSpinsBySlot"->>${slotId})::int, 0) + ${n}::int))
     WHERE "userId" = ${userId}`;
}

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────

export async function getSlotState(userId: string | null, slotId: string): Promise<SlotStateResponse> {
  const def = requireDef(slotId);
  const cfg = await getSetting('game.slots');
  const enabled = cfg.enabled && cfg.machines[slotId]?.enabled !== false;
  let bonus: PublicBonus | null = null;
  let lastSpin: PublicSpin | null = null;
  if (userId) {
    const [game, last] = await Promise.all([
      prisma.slotGame.findUnique({ where: { userId_slotId: { userId, slotId } } }),
      prisma.slotSpin.findFirst({ where: { userId, slotId }, orderBy: { createdAt: 'desc' } }),
    ]);
    bonus = toPublicBonus(parseStored(def, game?.bonusState ?? null));
    lastSpin = last ? toPublicSpin(last) : null;
  }
  return { definition: toPublicDefinition(def), betLevels: cfg.betLevels, enabled, bonus, lastSpin };
}

// ─────────────────────────────────────────────────────────────
// Spin
// ─────────────────────────────────────────────────────────────

export async function spinSlot(
  userId: string,
  slotId: string,
  input: { betLevel: number; requestId: string; mode?: 'paid' | 'free' },
): Promise<SlotSpinResponse> {
  const def = requireDef(slotId);
  const post = new PostCommit();

  const res = await transaction(async (tx) => {
    await lockWallet(tx, userId);

    // Idempotent replay: the same requestId always returns the original spin.
    const existing = await tx.slotSpin.findUnique({ where: { userId_clientRequestId: { userId, clientRequestId: input.requestId } } });
    if (existing) {
      const game = await tx.slotGame.findUnique({ where: { userId_slotId: { userId, slotId: existing.slotId } } });
      const w = await tx.wallet.findUniqueOrThrow({ where: { userId }, select: { balance: true } });
      const exDef = getSlotDefinition(existing.slotId) ?? def;
      return { spin: toPublicSpin(existing), balance: toNum(w.balance), bonus: toPublicBonus(parseStored(exDef, game?.bonusState ?? null)), replay: true };
    }

    const game = await tx.slotGame.upsert({
      where: { userId_slotId: { userId, slotId } },
      create: { userId, slotId },
      update: {},
    });
    const stored = parseStored(def, game.bonusState);
    const spinId = newSpinId();
    const isFree = stored !== null;
    let betLevel: number;
    let charged = 0n;

    if (!stored && input.mode === 'free') {
      // The client expected a free spin but the bonus already ended (e.g. finished
      // in another tab). Never silently convert that click into a paid spin.
      throw new AppError('CONFLICT', 'Your free spins have already finished.', { bonusEnded: true });
    }

    if (stored) {
      // Free spin: no wager, but cooldown / self-exclusion / maintenance /
      // disabled machine still block play. The bonus state is untouched.
      await assertPlayAllowed(tx, { userId, game: 'SLOTS', variant: slotId });
      betLevel = stored.engine.betLevel;
    } else {
      const cfg = await getSetting('game.slots', tx);
      if (!cfg.betLevels.includes(input.betLevel)) {
        throw new AppError('VALIDATION', 'Choose one of the available bet levels.', { betLevels: cfg.betLevels });
      }
      betLevel = input.betLevel;
      charged = BigInt(betLevel);
      await placeWager(
        tx,
        {
          userId,
          game: 'SLOTS',
          variant: slotId,
          amount: charged,
          referenceType: 'SLOT_SPIN',
          referenceId: spinId,
          idempotencyKey: `slot:${spinId}:bet`,
          metadata: { slotId },
        },
        post,
      );
    }

    const draw = await drawSeed(tx, userId);
    const bonusBefore = stored?.engine ?? null;

    let outcome: SpinOutcome | null = null;
    let forced = false;
    const peek = await peekForcedOutcome<ForcedSlotOutcome>('slots', userId);
    if (peek && peek.slotId === slotId) {
      const f = await consumeForcedOutcome<ForcedSlotOutcome>('slots', userId);
      if (f) {
        outcome = searchOutcome(def, { betLevel, bonusState: bonusBefore }, f.trigger, draw.nonce + 1);
        forced = outcome !== null;
        if (!outcome) logger.warn({ slotId, trigger: f.trigger }, 'DEV: forced slot outcome not found, using RNG');
      }
    }
    if (!outcome) {
      try {
        outcome = spin(def, { betLevel, bonusState: bonusBefore }, draw.rng);
      } catch (err) {
        logger.error({ err, slotId, userId }, 'slots: engine error');
        throw new AppError('INTERNAL');
      }
    }

    const roundId = stored?.roundId ?? spinId;
    const nextStored: StoredBonus | null = outcome.bonusStateAfter
      ? { engine: outcome.bonusStateAfter, roundId, wager: stored?.wager ?? betLevel }
      : null;

    const upd = await tx.slotGame.updateMany({
      where: { id: game.id, version: game.version },
      data: { bonusState: nextStored ? (nextStored as unknown as Prisma.InputJsonValue) : Prisma.DbNull, version: { increment: 1 } },
    });
    if (upd.count !== 1) throw new AppError('CONFLICT', 'Spin already in progress');

    const storedSpin: StoredSpin = { outcome, roundId, bonusStateBefore: bonusBefore, ...(forced ? { forced: true } : {}) };
    const row = await tx.slotSpin.create({
      data: {
        id: spinId,
        userId,
        slotId,
        clientRequestId: input.requestId,
        bet: charged,
        betLevel: BigInt(betLevel),
        payout: BigInt(outcome.totalWin),
        isFreeSpin: isFree,
        outcome: storedSpin as unknown as Prisma.InputJsonValue,
        serverSeedHash: draw.seedHash,
        clientSeed: draw.clientSeed,
        nonce: draw.nonce,
      },
    });

    if (outcome.totalWin > 0) {
      await creditPayout(
        tx,
        {
          userId,
          game: 'SLOTS',
          amount: BigInt(outcome.totalWin),
          referenceType: 'SLOT_SPIN',
          referenceId: spinId,
          idempotencyKey: `slot:${spinId}:win`,
          metadata: { slotId, freeSpin: isFree, roundId },
        },
        post,
      );
    }

    // Round settlement (stats + unified history) once the round is complete.
    if (!outcome.bonusStateAfter) {
      const wager = BigInt(stored ? stored.wager : betLevel);
      const payout = BigInt(stored ? (outcome.freeSpins?.roundWin ?? outcome.totalWin) : outcome.totalWin);
      const freeSpinsPlayed = stored ? (outcome.freeSpins?.played ?? 0) : 0;
      const spins = 1 + freeSpinsPlayed;
      const recorded = await recordRound(tx, {
        userId,
        game: 'SLOTS',
        variant: slotId,
        referenceId: roundId,
        wager,
        payout,
        multiplierX100: wager > 0n ? Number((payout * 100n) / wager) : null,
        summary: roundSummary(def, wager, payout, freeSpinsPlayed),
        extraStats: { slotSpins: { increment: spins } },
      });
      if (recorded) {
        await bumpSpinsBySlot(tx, userId, slotId, spins);
        if (payout > 0n) await bumpMax(tx, userId, 'slotLargestWin', payout);
      }
    }

    const w = await tx.wallet.findUniqueOrThrow({ where: { userId }, select: { balance: true } });
    return { spin: toPublicSpin(row), balance: toNum(w.balance), bonus: toPublicBonus(nextStored), replay: false };
  });

  await post.flush();
  return res;
}

// ─────────────────────────────────────────────────────────────
// Round detail (history modal + fairness verifier)
// ─────────────────────────────────────────────────────────────

export async function getSlotRoundDetail(userId: string, id: string): Promise<RoundDetail<SlotRoundData>> {
  const hit = await prisma.slotSpin.findFirst({ where: { id, userId } });
  if (!hit) throw new AppError('NOT_FOUND', 'Round not found');
  const roundId = (hit.outcome as unknown as StoredSpin).roundId ?? hit.id;
  const spins = await prisma.slotSpin.findMany({
    where: { userId, slotId: hit.slotId, outcome: { path: ['roundId'], equals: roundId } },
    orderBy: [{ createdAt: 'asc' }, { nonce: 'asc' }],
  });
  const trigger = spins.find((s) => s.id === roundId) ?? spins[0] ?? hit;
  const def = requireDef(trigger.slotId);
  const tStored = trigger.outcome as unknown as StoredSpin;
  const last = spins[spins.length - 1] ?? trigger;
  const complete = !(last.outcome as unknown as StoredSpin).outcome.bonusStateAfter;
  const wager = trigger.bet;
  const payout = spins.reduce((a, s) => a + s.payout, 0n);
  const freeSpins = spins.filter((s) => s.isFreeSpin).length;
  const fairness = await fairnessInfo(userId, trigger.serverSeedHash, trigger.clientSeed, trigger.nonce);
  // A seed rotation mid-bonus splits a round across seed pairs: reveal each one that is revealed.
  const hashes = [...new Set(spins.map((s) => s.serverSeedHash))];
  const revealed = new Map(
    (await prisma.serverSeed.findMany({ where: { userId, seedHash: { in: hashes }, status: 'REVEALED' }, select: { seedHash: true, seed: true } })).map(
      (x) => [x.seedHash, x.seed] as const,
    ),
  );
  return {
    game: 'SLOTS',
    id: roundId,
    variant: trigger.slotId,
    createdAt: trigger.createdAt.toISOString(),
    wager: toNum(wager),
    payout: toNum(payout),
    net: toNum(payout - wager),
    summary: roundSummary(def, wager, payout, freeSpins) + (complete ? '' : ' · bonus in progress'),
    fairness: {
      ...fairness,
      extra: { slotId: trigger.slotId, betLevel: toNum(trigger.betLevel), bonusStateBefore: tStored.bonusStateBefore ?? null },
    },
    forced: spins.some((s) => (s.outcome as unknown as StoredSpin).forced),
    data: {
      slotId: trigger.slotId,
      betLevel: toNum(trigger.betLevel),
      complete,
      spins: spins.map((s) => {
        const st = s.outcome as unknown as StoredSpin;
        return {
          id: s.id,
          isFreeSpin: s.isFreeSpin,
          nonce: s.nonce,
          serverSeedHash: s.serverSeedHash,
          serverSeed: revealed.get(s.serverSeedHash) ?? null,
          clientSeed: s.clientSeed,
          bonusStateBefore: st.bonusStateBefore ?? null,
          payout: toNum(s.payout),
          outcome: st.outcome,
        };
      }),
    },
  };
}
