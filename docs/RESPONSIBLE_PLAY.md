# Responsible play

Responsible-play controls are enforced **server-side only**, inside the wager transaction, by
`WagerEligibilityService` (`src/server/services/responsible-play/eligibility.ts`). UIs only display
state. Responsible-play data is private: it is never exposed on profiles, chat or player cards.

## Data

* `ResponsiblePlaySettings` — `dailyWagerLimit`, `dailyLossLimit` (nullable = no limit), `timezone`.
* `ResponsiblePlayLimitChange` — audit trail and scheduler for changes: `PENDING → APPLIED |
  CANCELLED | SUPERSEDED`, with `effectiveAt`.
* `SelfExclusion` — `COOLDOWN_24H | COOLDOWN_72H | LOCK_1W | EXCLUSION_1M | EXCLUSION_3M |
  EXCLUSION_6M | EXCLUSION_1Y | EXCLUSION_INDEFINITE`, `startsAt`, `endsAt` (null = indefinite),
  `status ACTIVE | EXPIRED | REINSTATEMENT_REQUESTED | REINSTATED`.
* `DailyPlayAggregate` — per user per **local** day: `wagered`, `won`, `lost`, `net`. Updated in the
  same transaction as each ledger entry, so limit checks are O(1) (no history scans).

## Accounting rules

* `wagered` increases when a wager is **accepted** (BET ledger entry) and decreases on REFUND.
* `won` increases by the **gross** amount credited (stake + winnings) on WIN entries.
* `net = won − wagered`; `lost = max(0, wagered − won)`.
* Entries are attributed to the user's local date (their RP timezone) when the ledger entry is
  written. A round accepted before midnight and settled after it counts its stake on day 1 and its
  return on day 2.
* **Daily wager limit:** a new wager is accepted only if `wagered + stake ≤ limit` (reaching the limit
  exactly is allowed).
* **Daily loss limit:** the whole stake is at risk, so a new wager is accepted only if
  `max(0, wagered − won) + stake ≤ limit`.
* Limits reset at local midnight in the user's timezone (`nextLocalMidnight`).
* Already-accepted rounds always settle (hits/stands, cash-outs, payouts are never blocked).
  Only **new** wagers (deals, doubles, splits, insurance, spins, bets) are checked.

## Changing limits

* **More restrictive** (lower, or adding a limit): applied immediately; supersedes any pending change.
* **Less restrictive** (higher, or removing): stored as `PENDING` with `effectiveAt = now + 24h`
  (`system.limitIncreaseDelayHours`). The user sees current limit, requested limit and effective time
  and may cancel at any time. Activation is **lazy and transactional**: pending changes whose time has
  come are applied the next time settings are read — restart-safe, no cron required.

## Breaks and self-exclusion

* Options: 24h, 72h, 1 week (cooldowns → `COOLDOWN_ACTIVE`), 1 month (+3m/6m/1y/indefinite) self-
  exclusion (→ `SELF_EXCLUDED`). The exact unlock timestamp is shown before confirming; confirmation
  requires typing CONFIRM / EXCLUDE.
* No cancellation or shortening after activation — not by the user, not by admins. A new request that
  would not extend the current restriction is idempotent; a longer one extends it.
* While active: no wagers of any kind in any game, no slot free spins (bonus state is preserved), no
  wagering-dependent rewards (weekly bonus, level rewards). The user can log in, view history,
  account, responsible-play page, contact support and read chat.
* Expiry is evaluated against `endsAt` on every check (lazily marked EXPIRED) — survives restarts.
* **Indefinite** exclusions: the user may request a review; only a `SUPER_ADMIN` can reinstate, and
  only after a 7-day waiting period from the request; the action is audit-logged.
