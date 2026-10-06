import type { SelfExclusion } from '@prisma/client';
import { prisma, type Tx } from '@/server/db';
import { AppError, type ReasonCode, ReasonCopy } from '@/lib/errors';
import { getSetting } from '@/server/services/settings/settings-service';
import { getEffectiveSettings } from './settings';
import { getActiveExclusion, exclusionKind, EXCLUSION_OPTIONS } from './exclusions';
import { getTodayAggregate } from './aggregates';
import { nextLocalMidnight } from '@/lib/time';
import { toNum } from '@/lib/money';
import type { GameKey } from '@/lib/games';

/**
 * WagerEligibilityService — the single gate every wager in every game passes
 * through, server-side, inside the wager's DB transaction (after the wallet
 * row lock). UIs may *display* eligibility but never enforce it.
 */

export interface WagerCheckInput {
  userId: string;
  game: GameKey;
  /** Slot machine id, when game === 'SLOTS' */
  variant?: string;
  /** Total stake being added by this request. */
  amount: bigint;
  /** Per-request min/max (defaults to the game's configured limits). Pass null to skip. */
  minBet?: bigint | null;
  maxBet?: bigint | null;
  /** Current wallet balance (from lockWallet). */
  balance: bigint;
  now?: Date;
}

export type EligibilityResult =
  | { ok: true; timezone: string }
  | { ok: false; code: ReasonCode; message: string; details?: Record<string, unknown> };

async function gameConfig(tx: Tx, game: GameKey, variant?: string) {
  switch (game) {
    case 'BLACKJACK':
      return getSetting('game.blackjack', tx);
    case 'BACCARAT':
      return getSetting('game.baccarat', tx);
    case 'ROULETTE':
      return getSetting('game.roulette', tx);
    case 'CRASH':
      return getSetting('game.crash', tx);
    case 'SLOTS': {
      const s = await getSetting('game.slots', tx);
      const machineEnabled = variant ? s.machines[variant]?.enabled !== false : true;
      const levels = s.betLevels;
      return { enabled: s.enabled && machineEnabled, minBet: Math.min(...levels), maxBet: Math.max(...levels) };
    }
  }
}

function exclusionFailure(ex: SelfExclusion): EligibilityResult {
  const kind = exclusionKind(ex.type);
  const code: ReasonCode = kind === 'COOLDOWN' ? 'COOLDOWN_ACTIVE' : 'SELF_EXCLUDED';
  return {
    ok: false,
    code,
    // Locale-neutral copy: the client formats `details.endsAt` in the user's locale.
    message: ex.endsAt
      ? `Your ${EXCLUSION_OPTIONS[ex.type].label.toLowerCase()} is active. Casino play resumes when it ends.`
      : 'Your indefinite self-exclusion is active. Contact support to request a review.',
    details: { type: ex.type, label: EXCLUSION_OPTIONS[ex.type].label, endsAt: ex.endsAt?.toISOString() ?? null },
  };
}

export async function checkWagerEligibility(tx: Tx, input: WagerCheckInput): Promise<EligibilityResult> {
  const now = input.now ?? new Date();
  const fail = (code: ReasonCode, details?: Record<string, unknown>, message?: string): EligibilityResult => ({
    ok: false,
    code,
    message: message ?? ReasonCopy[code].message,
    details,
  });

  // 1. Account status
  const user = await tx.user.findUnique({
    where: { id: input.userId },
    select: { status: true, suspendedUntil: true },
  });
  if (!user) return fail('ACCOUNT_LOCKED');
  if (user.status === 'BANNED') return fail('ACCOUNT_LOCKED');
  if (user.status === 'SUSPENDED' && (!user.suspendedUntil || user.suspendedUntil > now)) {
    return fail('ACCOUNT_SUSPENDED', { until: user.suspendedUntil?.toISOString() ?? null });
  }

  // 2. Cooldowns / self-exclusion
  const ex = await getActiveExclusion(tx, input.userId, now);
  if (ex) return exclusionFailure(ex);

  // 3. Platform + game availability
  const system = await getSetting('system', tx);
  if (system.maintenanceMode) return fail('MAINTENANCE');
  const cfg = await gameConfig(tx, input.game, input.variant);
  if (!cfg.enabled) return fail('GAME_DISABLED');

  // 4. Stake bounds
  const min = input.minBet === undefined ? BigInt(cfg.minBet) : input.minBet;
  const max = input.maxBet === undefined ? BigInt(cfg.maxBet) : input.maxBet;
  if (input.amount <= 0n) return fail('BET_TOO_LOW', { min: min === null ? null : toNum(min) });
  if (min !== null && input.amount < min) return fail('BET_TOO_LOW', { min: toNum(min) });
  if (max !== null && input.amount > max) return fail('BET_TOO_HIGH', { max: toNum(max) });

  // 5. Daily limits (O(1) via DailyPlayAggregate)
  const rp = await getEffectiveSettings(tx, input.userId, now);
  if (rp.dailyWagerLimit !== null || rp.dailyLossLimit !== null) {
    const today = await getTodayAggregate(tx, input.userId, rp.timezone, now);
    const resetsAt = nextLocalMidnight(rp.timezone, now).toISOString();
    if (rp.dailyWagerLimit !== null && today.wagered + input.amount > rp.dailyWagerLimit) {
      return fail('DAILY_WAGER_LIMIT', {
        limit: toNum(rp.dailyWagerLimit),
        wageredToday: toNum(today.wagered),
        remaining: toNum(rp.dailyWagerLimit - today.wagered > 0n ? rp.dailyWagerLimit - today.wagered : 0n),
        resetsAt,
      });
    }
    // Loss limit: the whole stake is at risk, so a wager is accepted only if
    // (current net loss + stake) stays within the limit.
    if (rp.dailyLossLimit !== null) {
      const currentLoss = today.wagered - today.won > 0n ? today.wagered - today.won : 0n;
      if (currentLoss + input.amount > rp.dailyLossLimit) {
        return fail('DAILY_LOSS_LIMIT', {
          limit: toNum(rp.dailyLossLimit),
          lossToday: toNum(currentLoss),
          remaining: toNum(rp.dailyLossLimit - currentLoss > 0n ? rp.dailyLossLimit - currentLoss : 0n),
          resetsAt,
        });
      }
    }
  }

  // 6. Balance
  if (input.balance < input.amount) {
    return fail('INSUFFICIENT_BALANCE', { balance: toNum(input.balance), required: toNum(input.amount) });
  }

  return { ok: true, timezone: rp.timezone };
}

export async function assertWagerEligible(tx: Tx, input: WagerCheckInput): Promise<{ timezone: string }> {
  const res = await checkWagerEligibility(tx, input);
  if (!res.ok) throw new AppError(res.code, res.message, res.details);
  return { timezone: res.timezone };
}

/**
 * Read-only play status for UI gating (e.g. the "Play currently disabled"
 * screen). Not an enforcement point.
 */
export async function getPlayStatus(userId: string) {
  const now = new Date();
  const [user, ex, system] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { status: true, suspendedUntil: true } }),
    getActiveExclusion(prisma, userId, now),
    getSetting('system'),
  ]);
  if (user?.status === 'BANNED') return { canPlay: false, code: 'ACCOUNT_LOCKED' as const, until: null };
  if (user?.status === 'SUSPENDED' && (!user.suspendedUntil || user.suspendedUntil > now)) {
    return { canPlay: false, code: 'ACCOUNT_SUSPENDED' as const, until: user.suspendedUntil?.toISOString() ?? null };
  }
  if (ex) {
    return {
      canPlay: false,
      code: exclusionKind(ex.type) === 'COOLDOWN' ? ('COOLDOWN_ACTIVE' as const) : ('SELF_EXCLUDED' as const),
      until: ex.endsAt?.toISOString() ?? null,
      label: EXCLUSION_OPTIONS[ex.type].label,
      startedAt: ex.startsAt.toISOString(),
    };
  }
  if (system.maintenanceMode) return { canPlay: false, code: 'MAINTENANCE' as const, until: null };
  return { canPlay: true as const, code: null, until: null };
}

/**
 * For play that is NOT a new wager but still counts as "play" (e.g. slot free
 * spins awarded by an earlier paid spin). Checks account status, cooldowns /
 * self-exclusion, maintenance and game availability — but not stake, limits
 * or balance. Bonus state is preserved while blocked.
 */
export async function assertPlayAllowed(tx: Tx, input: { userId: string; game: GameKey; variant?: string; now?: Date }) {
  const res = await checkWagerEligibility(tx, {
    userId: input.userId,
    game: input.game,
    variant: input.variant,
    amount: 1n,
    minBet: null,
    maxBet: null,
    balance: 1n,
    now: input.now,
  });
  if (!res.ok && res.code !== 'DAILY_WAGER_LIMIT' && res.code !== 'DAILY_LOSS_LIMIT') {
    throw new AppError(res.code, res.message, res.details);
  }
}
