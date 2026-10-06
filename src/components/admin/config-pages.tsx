'use client';
import { Spade, Diamond, CircleDot, Rocket, Gem, Gift, Megaphone, Wrench, AlertTriangle } from 'lucide-react';
import { GAMES } from '@/lib/games';
import { PageHeader } from './ui';
import { SettingsError, SettingsForm, SettingsSkeleton, useAdminSettings, type FieldSection } from './settings-form';

const MAX = 100_000_000;

const BLACKJACK: FieldSection[] = [
  {
    title: 'Table limits',
    fields: [
      { type: 'credits', key: 'minBet', label: 'Minimum wager', min: 1, max: MAX },
      { type: 'credits', key: 'maxBet', label: 'Maximum wager', min: 1, max: MAX },
    ],
  },
  {
    title: 'Shoe',
    fields: [
      { type: 'int', key: 'decks', label: 'Decks', min: 1, max: 8, suffix: 'decks', hint: 'Applies when the next shoe is built.' },
      { type: 'percent', key: 'penetration', label: 'Penetration', min: 0.5, max: 0.9, hint: 'Cut card position before reshuffle (50–90%).' },
    ],
  },
  {
    title: 'Rules',
    fields: [
      {
        type: 'select',
        key: 'blackjackPayout',
        label: 'Blackjack pays',
        options: [
          { value: '3:2', label: '3 : 2' },
          { value: '6:5', label: '6 : 5' },
        ],
      },
      { type: 'int', key: 'maxHands', label: 'Max hands after splits', min: 2, max: 4, suffix: 'hands' },
      { type: 'toggle', key: 'dealerHitsSoft17', label: 'Dealer hits soft 17', hint: 'Off = dealer stands on all 17s.' },
      { type: 'toggle', key: 'insurance', label: 'Offer insurance', hint: 'When the dealer shows an Ace.' },
      { type: 'toggle', key: 'allowSplit', label: 'Allow splitting' },
      { type: 'toggle', key: 'doubleAfterSplit', label: 'Double after split' },
      { type: 'toggle', key: 'resplitAces', label: 'Re-split aces' },
      { type: 'toggle', key: 'hitSplitAces', label: 'Hit split aces' },
    ],
  },
];

const BACCARAT: FieldSection[] = [
  {
    title: 'Table limits',
    fields: [
      { type: 'credits', key: 'minBet', label: 'Minimum wager', min: 1, max: MAX },
      { type: 'credits', key: 'maxBet', label: 'Maximum wager', min: 1, max: MAX },
    ],
  },
  {
    title: 'Shoe & payouts',
    fields: [
      { type: 'int', key: 'decks', label: 'Decks', min: 1, max: 8, suffix: 'decks' },
      { type: 'percent', key: 'penetration', label: 'Penetration', min: 0.5, max: 0.9 },
      { type: 'bps', key: 'bankerCommissionBps', label: 'Banker commission', min: 0, max: 1000, hint: 'Standard is 5%.' },
      { type: 'int', key: 'tiePayout', label: 'Tie pays', min: 5, max: 10, suffix: ': 1', hint: 'Standard is 8 : 1.' },
    ],
  },
];

const ROULETTE: FieldSection[] = [
  {
    title: 'Limits',
    fields: [
      { type: 'credits', key: 'minBet', label: 'Minimum wager', min: 1, max: MAX },
      { type: 'credits', key: 'maxBet', label: 'Maximum per spin', min: 1, max: MAX, hint: 'Total of all bets on one spin.' },
      { type: 'credits', key: 'maxStraightBet', label: 'Straight-up maximum', min: 1, max: MAX, hint: 'Per single number.' },
      { type: 'credits', key: 'maxOutsideBet', label: 'Outside-bet maximum', min: 1, max: MAX, hint: 'Red/black, dozens, columns…' },
    ],
  },
];

const CRASH: FieldSection[] = [
  {
    title: 'Limits & timing',
    fields: [
      { type: 'credits', key: 'minBet', label: 'Minimum wager', min: 1, max: MAX },
      { type: 'credits', key: 'maxBet', label: 'Maximum wager', min: 1, max: MAX },
      { type: 'int', key: 'countdownMs', label: 'Betting countdown', min: 3000, max: 30_000, suffix: 'ms', hint: 'Betting window before launch (3–30s).' },
      { type: 'x100', key: 'maxAutoCashoutX100', label: 'Max auto cash-out', min: 101, max: 100_000_000 },
    ],
  },
];

const SLOT_MACHINES = GAMES.filter((g) => g.slotId).map((g) => ({ id: g.slotId!, name: g.name }));
const SLOTS: FieldSection[] = [
  {
    fields: [
      { type: 'machines', key: 'machines', label: 'Machines', machines: SLOT_MACHINES },
      { type: 'betLevels', key: 'betLevels', label: 'Bet levels', hint: 'Stake steps offered on every machine. Press Enter to add.' },
    ],
  },
];

export function GamesConfig() {
  const q = useAdminSettings();
  return (
    <div>
      <PageHeader eyebrow="Admin" title="Games" description="Availability, limits and table rules. Disabling a game blocks new wagers immediately; rounds in progress can finish." />
      {q.isError ? (
        <SettingsError onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <SettingsSkeleton count={3} />
      ) : (
        <div className="space-y-4">
          <SettingsForm settingKey="game.blackjack" title="Blackjack" icon={<Spade size={14} className="text-fg-subtle" />} headerToggle={{ key: 'enabled', label: 'Blackjack enabled' }} sections={BLACKJACK} data={q.data['game.blackjack']} />
          <SettingsForm settingKey="game.baccarat" title="Baccarat" icon={<Diamond size={14} className="text-fg-subtle" />} headerToggle={{ key: 'enabled', label: 'Baccarat enabled' }} sections={BACCARAT} data={q.data['game.baccarat']} />
          <SettingsForm settingKey="game.roulette" title="Roulette" icon={<CircleDot size={14} className="text-fg-subtle" />} headerToggle={{ key: 'enabled', label: 'Roulette enabled' }} sections={ROULETTE} data={q.data['game.roulette']} />
          <SettingsForm settingKey="game.crash" title="Crash" icon={<Rocket size={14} className="text-fg-subtle" />} headerToggle={{ key: 'enabled', label: 'Crash enabled' }} sections={CRASH} data={q.data['game.crash']} />
          <SettingsForm settingKey="game.slots" title="Slots" icon={<Gem size={14} className="text-fg-subtle" />} headerToggle={{ key: 'enabled', label: 'Slots enabled' }} sections={SLOTS} data={q.data['game.slots']} />
        </div>
      )}
    </div>
  );
}

const REWARDS: FieldSection[] = [
  {
    title: 'Daily credits',
    fields: [
      { type: 'credits', key: 'dailyAmount', label: 'Daily amount', min: 0, max: MAX },
      { type: 'int', key: 'dailyCooldownHours', label: 'Cooldown', min: 1, max: 168, suffix: 'hours' },
    ],
  },
  {
    title: 'Emergency refill',
    fields: [
      { type: 'credits', key: 'refillAmount', label: 'Refill amount', min: 0, max: MAX, hint: 'Set to 0 to disable refills.' },
      { type: 'credits', key: 'refillThreshold', label: 'Available below balance', min: 0, max: MAX },
      { type: 'int', key: 'refillCooldownMinutes', label: 'Cooldown', min: 1, max: 10_080, suffix: 'min' },
    ],
  },
  {
    title: 'Weekly bonus',
    fields: [
      { type: 'credits', key: 'weeklyAmount', label: 'Weekly amount', min: 0, max: MAX },
      { type: 'credits', key: 'weeklyMinWagered', label: 'Minimum wagered in week', min: 0, max: MAX },
    ],
  },
  {
    title: 'New accounts',
    fields: [{ type: 'credits', key: 'signupGrant', label: 'Signup grant', min: 0, max: MAX, hint: 'Credited once at registration.' }],
  },
];

export function RewardsConfig() {
  const q = useAdminSettings();
  return (
    <div>
      <PageHeader eyebrow="Admin" title="Rewards" description="Free-credit economy. Changes apply to the next claim; existing cooldowns are measured from each player’s last claim." />
      {q.isError ? (
        <SettingsError onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <SettingsSkeleton count={1} />
      ) : (
        <SettingsForm settingKey="rewards" title="Reward settings" icon={<Gift size={14} className="text-fg-subtle" />} sections={REWARDS} data={q.data.rewards} />
      )}
    </div>
  );
}

const SYSTEM: FieldSection[] = [
  {
    title: 'Platform',
    fields: [
      { type: 'toggle', key: 'maintenanceMode', label: 'Maintenance mode', hint: 'Blocks all new wagers platform-wide.' },
      { type: 'toggle', key: 'registrationOpen', label: 'Registration open', hint: 'Allow new accounts to sign up.' },
    ],
  },
  {
    title: 'Announcement',
    fields: [{ type: 'text', key: 'announcement', label: 'Announcement banner', maxLength: 280, placeholder: 'Shown at the top of every page. Leave empty to hide.' }],
  },
  {
    title: 'Chat & limits',
    fields: [
      { type: 'int', key: 'chatSlowModeSeconds', label: 'Chat slow mode', min: 0, max: 120, suffix: 'sec', hint: '0 = off. Minimum gap between messages.' },
      { type: 'int', key: 'limitIncreaseDelayHours', label: 'Limit increase delay', min: 1, max: 168, suffix: 'hours', hint: 'Cool-off before a less restrictive RP limit applies.' },
    ],
  },
];

export function SystemConfig() {
  const q = useAdminSettings();
  const maint = q.data?.system.value.maintenanceMode;
  return (
    <div>
      <PageHeader eyebrow="Admin" title="System" description="Platform-wide switches. Use with care — these affect every player immediately." />
      {maint ? (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2.5 text-[13px] text-fg-muted">
          <AlertTriangle size={15} className="mt-px shrink-0 text-warn" />
          <div>
            <span className="font-semibold text-fg">Maintenance mode is on.</span> Players cannot place new wagers.
          </div>
        </div>
      ) : null}
      {q.isError ? (
        <SettingsError onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <SettingsSkeleton count={1} />
      ) : (
        <SettingsForm
          settingKey="system"
          title="System settings"
          icon={<Wrench size={14} className="text-fg-subtle" />}
          sections={SYSTEM}
          data={q.data.system}
          aside={<AnnouncementPreview text={q.data.system.value.announcement} />}
        />
      )}
    </div>
  );
}

function AnnouncementPreview({ text }: { text: string }) {
  return (
    <div>
      <div className="mb-2 text-2xs font-semibold uppercase tracking-[0.12em] text-fg-subtle">Live banner</div>
      {text ? (
        <div className="flex items-start gap-2 rounded-lg border border-accent/25 bg-accent-soft px-3 py-2.5 text-[13px] text-fg">
          <Megaphone size={14} className="mt-0.5 shrink-0 text-accent" />
          <span className="break-words">{text}</span>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-fg-subtle">No announcement is showing.</div>
      )}
      <p className="mt-3 text-xs leading-relaxed text-fg-subtle">Shows the currently saved banner. Players see updates within a minute.</p>
    </div>
  );
}
