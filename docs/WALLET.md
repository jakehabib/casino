# Wallet architecture

Credits are **play money**. They cannot be purchased, withdrawn, redeemed, transferred or exchanged.
There is no payment, crypto, skin or prize integration anywhere in the codebase.

## Model

* `Wallet` — one row per user: `balance BigInt`, `version`. A cached projection.
* `WalletTransaction` — **append-only ledger**: `type`, signed `amount`, `balanceBefore`,
  `balanceAfter`, `referenceType`, `referenceId`, `idempotencyKey`, `metadata`.
  Unique `(userId, idempotencyKey)`.
* Types: `SIGNUP_GRANT`, `FREE_CREDIT_CLAIM`, `BET` (negative), `WIN` (positive, gross return),
  `REFUND`, `ADMIN_ADJUSTMENT` (either sign).

## Invariants (enforced in `src/server/services/wallet/wallet-service.ts`)

1. **Only WalletService changes balances.** Games call `placeWager / creditPayout / refundWager`
   (`src/server/services/wagering.ts`), which call `applyLedgerEntry`.
2. **Balance and ledger move together** in one DB transaction: a conditional
   `UPDATE "Wallet" SET balance = balance + $amt WHERE balance + $amt >= 0 RETURNING balance`
   followed by the ledger insert. If either fails the whole transaction rolls back.
3. **No negative balances** — guaranteed by the conditional update (not by application checks).
4. **Integers only** — `BigInt` in PostgreSQL, `bigint` in services, safe-integer `number` over the
   wire. Commission and multipliers use integer arithmetic (`floor(amount * num / den)`).
5. **Idempotency** — every movement has a deterministic key (e.g. `bj:<gameId>:settle`,
   `crash:<betId>:cashout`, `reward:DAILY:<window>`). Replaying a key returns the original entry and
   does not move money. A concurrent duplicate trips the unique constraint and rolls back.
6. **Serialisation** — wager paths begin with `lockWallet` (`SELECT … FOR UPDATE`), so eligibility
   checks (balance, daily limits) and the debit are atomic per user.
7. **Integrity check** — `verifyWalletIntegrity(userId)` asserts `sum(ledger) == balance` and that the
   latest `balanceAfter` equals the balance; inconsistencies are logged at `error`.

## Request idempotency (client → server)

Clients send a `requestId` with every balance-changing request; it is stored as `clientRequestId`
(unique per user) on the round row (`BlackjackGame`, `BaccaratGame`, `RouletteRound`, `CrashBet`,
`SlotSpin`). A retried request returns the stored result. State transitions (e.g. blackjack actions,
crash cash-outs) use conditional updates on `status`/`version`, so an action applies at most once.

## Rewards

`RewardClaim` has a unique `(userId, type, periodKey)`; the ledger key repeats the period key.
Daily (24h cooldown), Emergency Refill (balance below threshold + cooldown), Weekly bonus
(wagered ≥ minimum this ISO week), Level milestones (5/10/25/50/75/100). Wagering-dependent rewards
(weekly, level) are unavailable during a cooldown or self-exclusion.

## Realtime

`applyLedgerEntry` queues a `wallet:update { balance, delta, type }` event on the `PostCommit`
collector; it is published only after the transaction commits. The client mirrors the server
balance in `useBalance`; games may *hold* the displayed value during an animation, then `release()`.
