import { z } from 'zod';

/**
 * Admin-configurable settings. Each key is stored as JSON in SiteSetting and
 * parsed with these schemas (falling back to defaults per-field).
 */
export const BlackjackConfig = z.object({
  enabled: z.boolean().default(true),
  minBet: z.number().int().positive().default(100),
  maxBet: z.number().int().positive().default(250_000),
  decks: z.number().int().min(1).max(8).default(6),
  penetration: z.number().min(0.5).max(0.9).default(0.75),
  dealerHitsSoft17: z.boolean().default(false),
  blackjackPayout: z.enum(['3:2', '6:5']).default('3:2'),
  allowSplit: z.boolean().default(true),
  maxHands: z.number().int().min(2).max(4).default(4),
  doubleAfterSplit: z.boolean().default(true),
  resplitAces: z.boolean().default(false),
  hitSplitAces: z.boolean().default(false),
  insurance: z.boolean().default(true),
});

export const BaccaratConfig = z.object({
  enabled: z.boolean().default(true),
  minBet: z.number().int().positive().default(100),
  maxBet: z.number().int().positive().default(250_000),
  decks: z.number().int().min(1).max(8).default(8),
  penetration: z.number().min(0.5).max(0.9).default(0.8),
  /** basis points: 500 = 5% */
  bankerCommissionBps: z.number().int().min(0).max(1000).default(500),
  /** Tie pays N:1 */
  tiePayout: z.number().int().min(5).max(10).default(8),
});

export const RouletteConfig = z.object({
  enabled: z.boolean().default(true),
  minBet: z.number().int().positive().default(100),
  maxBet: z.number().int().positive().default(500_000), // total per spin
  maxStraightBet: z.number().int().positive().default(50_000),
  maxOutsideBet: z.number().int().positive().default(250_000),
});

export const CrashConfig = z.object({
  enabled: z.boolean().default(true),
  minBet: z.number().int().positive().default(100),
  maxBet: z.number().int().positive().default(250_000),
  countdownMs: z.number().int().min(3000).max(30_000).default(5_000),
  maxAutoCashoutX100: z.number().int().default(1_000_000),
});

export const SlotConfigItem = z.object({
  enabled: z.boolean().default(true),
});

export const SlotsConfig = z.object({
  enabled: z.boolean().default(true),
  betLevels: z
    .array(z.number().int().positive())
    .default([100, 200, 500, 1_000, 2_000, 5_000, 10_000, 25_000, 50_000, 100_000]),
  machines: z
    .record(z.string(), SlotConfigItem)
    .default({ 'gilded-vault': { enabled: true }, overcharge: { enabled: true }, 'starforged-relics': { enabled: true } }),
});

export const RewardsConfig = z.object({
  dailyAmount: z.number().int().nonnegative().default(25_000),
  dailyCooldownHours: z.number().int().min(1).max(168).default(24),
  refillAmount: z.number().int().nonnegative().default(10_000),
  refillThreshold: z.number().int().nonnegative().default(1_000),
  refillCooldownMinutes: z.number().int().min(1).default(60),
  weeklyAmount: z.number().int().nonnegative().default(25_000),
  weeklyMinWagered: z.number().int().nonnegative().default(250_000),
  signupGrant: z.number().int().nonnegative().default(100_000),
});

export const SystemConfig = z.object({
  maintenanceMode: z.boolean().default(false),
  registrationOpen: z.boolean().default(true),
  announcement: z.string().max(280).default(''),
  chatSlowModeSeconds: z.number().int().min(0).max(120).default(0),
  limitIncreaseDelayHours: z.number().int().min(1).max(168).default(24),
});

export const SETTINGS = {
  'game.blackjack': BlackjackConfig,
  'game.baccarat': BaccaratConfig,
  'game.roulette': RouletteConfig,
  'game.crash': CrashConfig,
  'game.slots': SlotsConfig,
  rewards: RewardsConfig,
  system: SystemConfig,
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]>;
export type BlackjackConfigT = z.infer<typeof BlackjackConfig>;
export type BaccaratConfigT = z.infer<typeof BaccaratConfig>;
export type RouletteConfigT = z.infer<typeof RouletteConfig>;
export type CrashConfigT = z.infer<typeof CrashConfig>;
export type SlotsConfigT = z.infer<typeof SlotsConfig>;
export type RewardsConfigT = z.infer<typeof RewardsConfig>;
export type SystemConfigT = z.infer<typeof SystemConfig>;
