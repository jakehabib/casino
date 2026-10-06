import { type Tx } from '@/server/db';
import { applyLedgerEntry, lockWallet } from '@/server/services/wallet/wallet-service';
import { assertWagerEligible } from '@/server/services/responsible-play/eligibility';
import { bumpAggregate } from '@/server/services/responsible-play/aggregates';
import { getEffectiveSettings } from '@/server/services/responsible-play/settings';
import { awardWagerXp } from '@/server/services/progression/progression';
import type { PostCommit } from '@/server/realtime/events';
import type { GameKey } from '@/lib/games';

/**
 * Game-facing wagering facade. Games never touch balances directly: they call
 * placeWager / creditPayout / refundWager inside their settlement transaction.
 *
 * placeWager:  lock wallet → WagerEligibilityService → BET ledger entry →
 *              daily aggregate → XP
 */
export interface PlaceWagerInput {
  userId: string;
  game: GameKey;
  variant?: string;
  amount: bigint;
  minBet?: bigint | null;
  maxBet?: bigint | null;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export async function placeWager(tx: Tx, input: PlaceWagerInput, post?: PostCommit) {
  const balance = await lockWallet(tx, input.userId);
  const { timezone } = await assertWagerEligible(tx, {
    userId: input.userId,
    game: input.game,
    variant: input.variant,
    amount: input.amount,
    minBet: input.minBet,
    maxBet: input.maxBet,
    balance,
  });
  const res = await applyLedgerEntry(
    tx,
    {
      userId: input.userId,
      type: 'BET',
      amount: -input.amount,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      idempotencyKey: input.idempotencyKey,
      metadata: { game: input.game, ...(input.variant ? { variant: input.variant } : {}), ...input.metadata },
    },
    post,
  );
  if (!res.duplicate) {
    await bumpAggregate(tx, input.userId, timezone, { wagered: input.amount });
    await awardWagerXp(tx, input.userId, input.amount, post);
  }
  return res;
}

async function tzFor(tx: Tx, userId: string) {
  const s = await getEffectiveSettings(tx, userId);
  return s.timezone;
}

/** Credit a gross payout (stake + winnings). No-op for zero. Idempotent by key. */
export async function creditPayout(
  tx: Tx,
  input: {
    userId: string;
    game: GameKey;
    amount: bigint;
    referenceType: string;
    referenceId: string;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  },
  post?: PostCommit,
) {
  if (input.amount <= 0n) return null;
  const res = await applyLedgerEntry(
    tx,
    {
      userId: input.userId,
      type: 'WIN',
      amount: input.amount,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      idempotencyKey: input.idempotencyKey,
      metadata: { game: input.game, ...input.metadata },
    },
    post,
  );
  if (!res.duplicate) await bumpAggregate(tx, input.userId, await tzFor(tx, input.userId), { won: input.amount });
  return res;
}

/** Return an accepted stake (e.g. voided crash round). */
export async function refundWager(
  tx: Tx,
  input: { userId: string; amount: bigint; referenceType: string; referenceId: string; idempotencyKey: string; reason: string },
  post?: PostCommit,
) {
  if (input.amount <= 0n) return null;
  const res = await applyLedgerEntry(
    tx,
    {
      userId: input.userId,
      type: 'REFUND',
      amount: input.amount,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      idempotencyKey: input.idempotencyKey,
      metadata: { reason: input.reason },
    },
    post,
  );
  if (!res.duplicate) {
    await bumpAggregate(tx, input.userId, await tzFor(tx, input.userId), { wagered: -input.amount });
  }
  return res;
}
