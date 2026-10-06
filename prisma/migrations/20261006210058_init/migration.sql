-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'BANNED');

-- CreateEnum
CREATE TYPE "ProfilePrivacy" AS ENUM ('PUBLIC', 'LIMITED', 'PRIVATE');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('SIGNUP_GRANT', 'FREE_CREDIT_CLAIM', 'BET', 'WIN', 'REFUND', 'ADMIN_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "SeedStatus" AS ENUM ('ACTIVE', 'REVEALED');

-- CreateEnum
CREATE TYPE "ShoeStatus" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "BlackjackStatus" AS ENUM ('INSURANCE_OFFERED', 'PLAYER_TURN', 'DEALER_TURN', 'SETTLED');

-- CreateEnum
CREATE TYPE "CrashRoundStatus" AS ENUM ('WAITING', 'BETTING_LOCKED', 'RUNNING', 'CRASHED', 'SETTLED');

-- CreateEnum
CREATE TYPE "CrashBetStatus" AS ENUM ('ACTIVE', 'CASHED_OUT', 'LOST', 'REFUNDED');

-- CreateEnum
CREATE TYPE "LimitType" AS ENUM ('DAILY_WAGER', 'DAILY_LOSS');

-- CreateEnum
CREATE TYPE "LimitChangeStatus" AS ENUM ('PENDING', 'APPLIED', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "SelfExclusionType" AS ENUM ('COOLDOWN_24H', 'COOLDOWN_72H', 'LOCK_1W', 'EXCLUSION_1M', 'EXCLUSION_3M', 'EXCLUSION_6M', 'EXCLUSION_1Y', 'EXCLUSION_INDEFINITE');

-- CreateEnum
CREATE TYPE "SelfExclusionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REINSTATEMENT_REQUESTED', 'REINSTATED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "avatarUrl" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "statusReason" TEXT,
    "suspendedUntil" TIMESTAMP(3),
    "privacy" "ProfilePrivacy" NOT NULL DEFAULT 'PUBLIC',
    "hideNetResult" BOOLEAN NOT NULL DEFAULT false,
    "hideTotalWagered" BOOLEAN NOT NULL DEFAULT false,
    "hideTotalWon" BOOLEAN NOT NULL DEFAULT false,
    "hideLargestWin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "xp" BIGINT NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "lifetimeXp" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "balanceBefore" BIGINT NOT NULL,
    "balanceAfter" BIGINT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerLevel" (
    "userId" TEXT NOT NULL,
    "xp" BIGINT NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "lifetimeXp" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerLevel_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "PlayerStats" (
    "userId" TEXT NOT NULL,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "totalWagered" BIGINT NOT NULL DEFAULT 0,
    "totalWon" BIGINT NOT NULL DEFAULT 0,
    "largestWin" BIGINT NOT NULL DEFAULT 0,
    "largestWinGame" TEXT,
    "playsBlackjack" INTEGER NOT NULL DEFAULT 0,
    "playsBaccarat" INTEGER NOT NULL DEFAULT 0,
    "playsRoulette" INTEGER NOT NULL DEFAULT 0,
    "playsCrash" INTEGER NOT NULL DEFAULT 0,
    "playsSlots" INTEGER NOT NULL DEFAULT 0,
    "bjHands" INTEGER NOT NULL DEFAULT 0,
    "bjWins" INTEGER NOT NULL DEFAULT 0,
    "bjLosses" INTEGER NOT NULL DEFAULT 0,
    "bjPushes" INTEGER NOT NULL DEFAULT 0,
    "bjBlackjacks" INTEGER NOT NULL DEFAULT 0,
    "bjLargestBlackjackWin" BIGINT NOT NULL DEFAULT 0,
    "bacHands" INTEGER NOT NULL DEFAULT 0,
    "bacPlayerWins" INTEGER NOT NULL DEFAULT 0,
    "bacBankerWins" INTEGER NOT NULL DEFAULT 0,
    "bacTies" INTEGER NOT NULL DEFAULT 0,
    "rouSpins" INTEGER NOT NULL DEFAULT 0,
    "rouLargestWin" BIGINT NOT NULL DEFAULT 0,
    "crashRounds" INTEGER NOT NULL DEFAULT 0,
    "crashHighestCashout" INTEGER NOT NULL DEFAULT 0,
    "crashLargestWin" BIGINT NOT NULL DEFAULT 0,
    "slotSpins" INTEGER NOT NULL DEFAULT 0,
    "slotLargestWin" BIGINT NOT NULL DEFAULT 0,
    "slotSpinsBySlot" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerStats_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "FavoriteGame" (
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteGame_pkey" PRIMARY KEY ("userId","gameId")
);

-- CreateTable
CREATE TABLE "GameHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "gameVariant" TEXT,
    "referenceId" TEXT NOT NULL,
    "wager" BIGINT NOT NULL,
    "payout" BIGINT NOT NULL,
    "net" BIGINT NOT NULL,
    "multiplier" INTEGER,
    "resultSummary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerSeed" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "seedHash" TEXT NOT NULL,
    "clientSeed" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL DEFAULT 0,
    "status" "SeedStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revealedAt" TIMESTAMP(3),

    CONSTRAINT "ServerSeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardShoe" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "game" TEXT NOT NULL,
    "decks" INTEGER NOT NULL,
    "cards" JSONB NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "cutCard" INTEGER NOT NULL,
    "serverSeedId" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "status" "ShoeStatus" NOT NULL DEFAULT 'ACTIVE',
    "roundsDealt" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CardShoe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlackjackGame" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "shoeId" TEXT NOT NULL,
    "status" "BlackjackStatus" NOT NULL,
    "baseBet" BIGINT NOT NULL,
    "totalWagered" BIGINT NOT NULL DEFAULT 0,
    "totalPayout" BIGINT NOT NULL DEFAULT 0,
    "insuranceBet" BIGINT NOT NULL DEFAULT 0,
    "insurancePayout" BIGINT NOT NULL DEFAULT 0,
    "dealerCards" JSONB NOT NULL,
    "activeHand" INTEGER NOT NULL DEFAULT 0,
    "rules" JSONB NOT NULL,
    "state" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "result" TEXT,
    "serverSeedHash" TEXT NOT NULL,
    "clientSeed" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "BlackjackGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlackjackHand" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "cards" JSONB NOT NULL,
    "bet" BIGINT NOT NULL,
    "doubled" BOOLEAN NOT NULL DEFAULT false,
    "fromSplit" BOOLEAN NOT NULL DEFAULT false,
    "outcome" TEXT,
    "payout" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "BlackjackHand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlackjackAction" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "handIndex" INTEGER NOT NULL,
    "card" JSONB,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlackjackAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaccaratGame" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "shoeId" TEXT NOT NULL,
    "shoeRound" INTEGER NOT NULL,
    "playerCards" JSONB NOT NULL,
    "bankerCards" JSONB NOT NULL,
    "playerTotal" INTEGER NOT NULL,
    "bankerTotal" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "natural" BOOLEAN NOT NULL DEFAULT false,
    "totalWagered" BIGINT NOT NULL,
    "totalPayout" BIGINT NOT NULL,
    "rules" JSONB NOT NULL,
    "serverSeedHash" TEXT NOT NULL,
    "clientSeed" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BaccaratGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaccaratBet" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "payout" BIGINT NOT NULL DEFAULT 0,
    "outcome" TEXT NOT NULL,

    CONSTRAINT "BaccaratBet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouletteRound" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "winningNumber" INTEGER NOT NULL,
    "totalWagered" BIGINT NOT NULL,
    "totalPayout" BIGINT NOT NULL,
    "serverSeedHash" TEXT NOT NULL,
    "clientSeed" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouletteRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouletteBet" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "numbers" INTEGER[],
    "amount" BIGINT NOT NULL,
    "payout" BIGINT NOT NULL DEFAULT 0,
    "won" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RouletteBet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrashRound" (
    "id" TEXT NOT NULL,
    "roundNumber" SERIAL NOT NULL,
    "status" "CrashRoundStatus" NOT NULL,
    "seedHash" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "crashPoint" INTEGER NOT NULL,
    "bettingEndsAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "crashedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrashRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrashBet" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "autoCashout" INTEGER,
    "cashoutAt" INTEGER,
    "payout" BIGINT NOT NULL DEFAULT 0,
    "status" "CrashBetStatus" NOT NULL DEFAULT 'ACTIVE',
    "clientRequestId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "CrashBet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotGame" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "bonusState" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlotGame_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotSpin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "bet" BIGINT NOT NULL,
    "betLevel" BIGINT NOT NULL,
    "payout" BIGINT NOT NULL,
    "isFreeSpin" BOOLEAN NOT NULL DEFAULT false,
    "outcome" JSONB NOT NULL,
    "serverSeedHash" TEXT NOT NULL,
    "clientSeed" TEXT NOT NULL,
    "nonce" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlotSpin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "room" TEXT NOT NULL DEFAULT 'global',
    "content" TEXT NOT NULL,
    "replyToId" TEXT,
    "mentions" TEXT[],
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMute" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mutedById" TEXT NOT NULL,
    "reason" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liftedAt" TIMESTAMP(3),

    CONSTRAINT "ChatMute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatBan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bannedById" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liftedAt" TIMESTAMP(3),

    CONSTRAINT "ChatBan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatReport" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBlock" (
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("blockerId","blockedId")
);

-- CreateTable
CREATE TABLE "ModerationLog" (
    "id" TEXT NOT NULL,
    "moderatorId" TEXT NOT NULL,
    "targetUserId" TEXT,
    "action" TEXT NOT NULL,
    "messageId" TEXT,
    "reason" TEXT,
    "durationSec" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResponsiblePlaySettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dailyWagerLimit" BIGINT,
    "dailyLossLimit" BIGINT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResponsiblePlaySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResponsiblePlayLimitChange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "limitType" "LimitType" NOT NULL,
    "oldValue" BIGINT,
    "newValue" BIGINT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "status" "LimitChangeStatus" NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ResponsiblePlayLimitChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelfExclusion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "SelfExclusionType" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "status" "SelfExclusionStatus" NOT NULL DEFAULT 'ACTIVE',
    "reinstatementRequestedAt" TIMESTAMP(3),
    "reinstatedAt" TIMESTAMP(3),
    "reinstatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SelfExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyPlayAggregate" (
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "wagered" BIGINT NOT NULL DEFAULT 0,
    "won" BIGINT NOT NULL DEFAULT 0,
    "lost" BIGINT NOT NULL DEFAULT 0,
    "net" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyPlayAggregate_pkey" PRIMARY KEY ("userId","date")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "User_lastSeenAt_idx" ON "User"("lastSeenAt");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE INDEX "WalletTransaction_userId_createdAt_idx" ON "WalletTransaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransaction_referenceType_referenceId_idx" ON "WalletTransaction"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "WalletTransaction_type_createdAt_idx" ON "WalletTransaction"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_userId_idempotencyKey_key" ON "WalletTransaction"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "GameHistory_userId_game_createdAt_idx" ON "GameHistory"("userId", "game", "createdAt");

-- CreateIndex
CREATE INDEX "GameHistory_userId_createdAt_idx" ON "GameHistory"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "GameHistory_createdAt_idx" ON "GameHistory"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GameHistory_game_referenceId_key" ON "GameHistory"("game", "referenceId");

-- CreateIndex
CREATE INDEX "ServerSeed_userId_status_idx" ON "ServerSeed"("userId", "status");

-- CreateIndex
CREATE INDEX "ServerSeed_seedHash_idx" ON "ServerSeed"("seedHash");

-- CreateIndex
CREATE INDEX "CardShoe_userId_game_status_idx" ON "CardShoe"("userId", "game", "status");

-- CreateIndex
CREATE INDEX "BlackjackGame_userId_status_idx" ON "BlackjackGame"("userId", "status");

-- CreateIndex
CREATE INDEX "BlackjackGame_userId_createdAt_idx" ON "BlackjackGame"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BlackjackGame_userId_clientRequestId_key" ON "BlackjackGame"("userId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "BlackjackHand_gameId_index_key" ON "BlackjackHand"("gameId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "BlackjackAction_gameId_seq_key" ON "BlackjackAction"("gameId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "BlackjackAction_gameId_requestId_key" ON "BlackjackAction"("gameId", "requestId");

-- CreateIndex
CREATE INDEX "BaccaratGame_userId_createdAt_idx" ON "BaccaratGame"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BaccaratGame_shoeId_shoeRound_idx" ON "BaccaratGame"("shoeId", "shoeRound");

-- CreateIndex
CREATE UNIQUE INDEX "BaccaratGame_userId_clientRequestId_key" ON "BaccaratGame"("userId", "clientRequestId");

-- CreateIndex
CREATE INDEX "BaccaratBet_gameId_idx" ON "BaccaratBet"("gameId");

-- CreateIndex
CREATE INDEX "RouletteRound_userId_createdAt_idx" ON "RouletteRound"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RouletteRound_userId_clientRequestId_key" ON "RouletteRound"("userId", "clientRequestId");

-- CreateIndex
CREATE INDEX "RouletteBet_roundId_idx" ON "RouletteBet"("roundId");

-- CreateIndex
CREATE UNIQUE INDEX "CrashRound_roundNumber_key" ON "CrashRound"("roundNumber");

-- CreateIndex
CREATE INDEX "CrashRound_status_idx" ON "CrashRound"("status");

-- CreateIndex
CREATE INDEX "CrashRound_createdAt_idx" ON "CrashRound"("createdAt");

-- CreateIndex
CREATE INDEX "CrashBet_userId_createdAt_idx" ON "CrashBet"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CrashBet_roundId_userId_slot_key" ON "CrashBet"("roundId", "userId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "CrashBet_userId_clientRequestId_key" ON "CrashBet"("userId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "SlotGame_userId_slotId_key" ON "SlotGame"("userId", "slotId");

-- CreateIndex
CREATE INDEX "SlotSpin_userId_slotId_createdAt_idx" ON "SlotSpin"("userId", "slotId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SlotSpin_userId_clientRequestId_key" ON "SlotSpin"("userId", "clientRequestId");

-- CreateIndex
CREATE INDEX "RewardClaim_userId_type_createdAt_idx" ON "RewardClaim"("userId", "type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RewardClaim_userId_type_periodKey_key" ON "RewardClaim"("userId", "type", "periodKey");

-- CreateIndex
CREATE INDEX "ChatMessage_room_createdAt_idx" ON "ChatMessage"("room", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_userId_createdAt_idx" ON "ChatMessage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMute_userId_expiresAt_idx" ON "ChatMute"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "ChatBan_userId_idx" ON "ChatBan"("userId");

-- CreateIndex
CREATE INDEX "ChatReport_status_createdAt_idx" ON "ChatReport"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatReport_messageId_reporterId_key" ON "ChatReport"("messageId", "reporterId");

-- CreateIndex
CREATE INDEX "ModerationLog_targetUserId_createdAt_idx" ON "ModerationLog"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ModerationLog_createdAt_idx" ON "ModerationLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResponsiblePlaySettings_userId_key" ON "ResponsiblePlaySettings"("userId");

-- CreateIndex
CREATE INDEX "ResponsiblePlayLimitChange_userId_status_effectiveAt_idx" ON "ResponsiblePlayLimitChange"("userId", "status", "effectiveAt");

-- CreateIndex
CREATE INDEX "SelfExclusion_userId_status_endsAt_idx" ON "SelfExclusion"("userId", "status", "endsAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_targetId_idx" ON "AdminAuditLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AdminAuditLog_adminUserId_createdAt_idx" ON "AdminAuditLog"("adminUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerLevel" ADD CONSTRAINT "PlayerLevel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerStats" ADD CONSTRAINT "PlayerStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteGame" ADD CONSTRAINT "FavoriteGame_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameHistory" ADD CONSTRAINT "GameHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerSeed" ADD CONSTRAINT "ServerSeed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardShoe" ADD CONSTRAINT "CardShoe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlackjackGame" ADD CONSTRAINT "BlackjackGame_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlackjackHand" ADD CONSTRAINT "BlackjackHand_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "BlackjackGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlackjackAction" ADD CONSTRAINT "BlackjackAction_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "BlackjackGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaccaratGame" ADD CONSTRAINT "BaccaratGame_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaccaratBet" ADD CONSTRAINT "BaccaratBet_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "BaccaratGame"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouletteRound" ADD CONSTRAINT "RouletteRound_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouletteBet" ADD CONSTRAINT "RouletteBet_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "RouletteRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrashBet" ADD CONSTRAINT "CrashBet_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "CrashRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrashBet" ADD CONSTRAINT "CrashBet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotGame" ADD CONSTRAINT "SlotGame_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotSpin" ADD CONSTRAINT "SlotSpin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardClaim" ADD CONSTRAINT "RewardClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMute" ADD CONSTRAINT "ChatMute_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatBan" ADD CONSTRAINT "ChatBan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReport" ADD CONSTRAINT "ChatReport_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReport" ADD CONSTRAINT "ChatReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBlock" ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationLog" ADD CONSTRAINT "ModerationLog_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationLog" ADD CONSTRAINT "ModerationLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponsiblePlaySettings" ADD CONSTRAINT "ResponsiblePlaySettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponsiblePlayLimitChange" ADD CONSTRAINT "ResponsiblePlayLimitChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelfExclusion" ADD CONSTRAINT "SelfExclusion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyPlayAggregate" ADD CONSTRAINT "DailyPlayAggregate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
