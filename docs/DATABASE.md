# Database

PostgreSQL 16 via Prisma 6 (`prisma/schema.prisma`). All credit amounts are `BigInt`. Migrations live
in `prisma/migrations`; `npm run db:migrate` (dev) / `npm run db:deploy` (prod); `npm run db:seed`.

## Model map

| Area | Models | Key constraints / indexes |
|---|---|---|
| Identity | `User`, `Account` (OAuth-ready), `Session`, `PasswordResetToken` | `User.username`/`email` unique; `Session.tokenHash` unique; `Account(provider, providerAccountId)` unique |
| Wallet | `Wallet`, `WalletTransaction` | `Wallet.userId` unique; ledger `(userId, idempotencyKey)` unique, `(userId, createdAt)`, `(referenceType, referenceId)` |
| Progression | `PlayerLevel`, `PlayerStats`, `FavoriteGame`, `GameHistory` | `GameHistory(game, referenceId)` unique (idempotent round recording); `(userId, game, createdAt)` |
| Fairness | `ServerSeed` | `(userId, status)`; seeds stay secret until `REVEALED` |
| Card games | `CardShoe`, `BlackjackGame`, `BlackjackHand`, `BlackjackAction`, `BaccaratGame`, `BaccaratBet` | `(userId, clientRequestId)` unique on games; `BlackjackAction(gameId, seq)` and `(gameId, requestId)` unique |
| Roulette | `RouletteRound`, `RouletteBet` | `(userId, clientRequestId)` unique |
| Crash | `CrashRound`, `CrashBet` | `roundNumber` unique; `CrashBet(roundId, userId, slot)` and `(userId, clientRequestId)` unique |
| Slots | `SlotGame` (persistent bonus state), `SlotSpin` | `SlotGame(userId, slotId)` unique; `SlotSpin(userId, clientRequestId)` unique |
| Rewards | `RewardClaim` | `(userId, type, periodKey)` unique |
| Chat | `ChatMessage`, `ChatMute`, `ChatBan`, `ChatReport`, `UserBlock`, `ModerationLog` | `ChatReport(messageId, reporterId)` unique; `(room, createdAt)` |
| Responsible play | `ResponsiblePlaySettings`, `ResponsiblePlayLimitChange`, `SelfExclusion`, `DailyPlayAggregate` | `DailyPlayAggregate(userId, date)` PK; `(userId, status, effectiveAt)` |
| Ops | `Notification`, `AdminAuditLog`, `SiteSetting` | `SiteSetting.key` PK (JSON values validated by Zod schemas) |

## Conventions

* Every round row stores the fairness triple (`serverSeedHash`, `clientSeed`, `nonce`) used to produce it.
* JSON columns hold engine state/outcomes (`BlackjackGame.state`, `SlotSpin.outcome`, `CardShoe.cards`);
  they are never returned raw to clients.
* Status changes use conditional updates (`updateMany … where status = X`) and `version` columns for
  optimistic concurrency.
* `DailyPlayAggregate.date` is the user's local calendar date (`@db.Date`).
