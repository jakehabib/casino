import { type Tx } from '@/server/db';
import { localDateAsUtcDate } from '@/lib/time';

/**
 * DailyPlayAggregate accounting rules (documented in docs/RESPONSIBLE_PLAY.md):
 *  • wagered += stake when a wager is ACCEPTED (BET ledger entry)
 *  • wagered −= stake when a wager is REFUNDED
 *  • won     += gross return credited (WIN ledger entry, includes stake)
 *  • net      = won − wagered       lost = max(0, wagered − won)
 *  • Amounts are attributed to the user's local day (their RP timezone) at the
 *    moment the ledger entry is written.
 */
export async function bumpAggregate(
  tx: Tx,
  userId: string,
  tz: string,
  delta: { wagered?: bigint; won?: bigint },
  at = new Date(),
) {
  const date = localDateAsUtcDate(tz, at);
  const w = delta.wagered ?? 0n;
  const n = delta.won ?? 0n;
  await tx.$executeRaw`
    INSERT INTO "DailyPlayAggregate" ("userId", date, wagered, won, lost, net, "updatedAt")
    VALUES (${userId}, ${date}, ${w}, ${n}, GREATEST(${w} - ${n}, 0), ${n} - ${w}, now())
    ON CONFLICT ("userId", date) DO UPDATE SET
      wagered = "DailyPlayAggregate".wagered + ${w},
      won     = "DailyPlayAggregate".won + ${n},
      net     = ("DailyPlayAggregate".won + ${n}) - ("DailyPlayAggregate".wagered + ${w}),
      lost    = GREATEST(("DailyPlayAggregate".wagered + ${w}) - ("DailyPlayAggregate".won + ${n}), 0),
      "updatedAt" = now()`;
}

export async function getTodayAggregate(tx: Tx, userId: string, tz: string, at = new Date()) {
  const date = localDateAsUtcDate(tz, at);
  const row = await tx.dailyPlayAggregate.findUnique({ where: { userId_date: { userId, date } } });
  return {
    wagered: row?.wagered ?? 0n,
    won: row?.won ?? 0n,
    lost: row?.lost ?? 0n,
    net: row?.net ?? 0n,
  };
}
