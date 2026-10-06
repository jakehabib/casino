'use client';
import { useState } from 'react';
import { GameShell, RulesSection, PayTable } from '@/components/games/shared/game-shell';
import { Tabs } from '@/components/ui/tabs';
import { ErrorState } from '@/components/ui/states';
import { useMe } from '@/hooks/use-me';
import { CRASH_SALT } from '@/engines/crash/crash-math';
import { useCrash } from './crash-store';
import { useCrashFeed } from './use-crash-feed';
import { CrashStage } from './crash-stage';
import { BetPanel } from './bet-panel';
import { PlayersTable } from './players-table';
import { RoundInfoModal } from './history-strip';

function Rules() {
  return (
    <>
      <RulesSection title="How it plays">
        <p>
          Every round a rocket launches and its multiplier climbs from 1.00×. Place up to two independent bets while the countdown runs, then cash out
          at any moment before the launch fails. Your payout is your bet × the multiplier at the instant the server receives your cash-out.
        </p>
        <p>If the rocket crashes before you cash out, that bet is lost. A cash-out that arrives exactly at the crash point loses.</p>
      </RulesSection>
      <RulesSection title="Auto cash-out">
        <p>
          Set a target (from 1.01×) and the server cashes you out at exactly that multiplier the moment it is reached — independent of your connection.
          You can still cash out manually earlier.
        </p>
      </RulesSection>
      <RulesSection title="Odds">
        <PayTable
          rows={[
            ['Chance to reach 1.5×', '66.0%'],
            ['Chance to reach 2×', '49.5%'],
            ['Chance to reach 10×', '9.9%'],
            ['Chance to reach 100×', '0.99%'],
            ['Return to player', '99%'],
          ]}
        />
      </RulesSection>
      <RulesSection title="Provably fair">
        <p>
          Before betting opens we publish SHA-256(seed). The crash point is derived from HMAC-SHA256(key = seed, message = salt) using the fixed public
          salt <code className="rounded bg-surface-3 px-1 text-fg">{CRASH_SALT}</code>; the seed is revealed the moment the round crashes. Click any
          result above the chart to verify it.
        </p>
      </RulesSection>
      <RulesSection title="Shortcuts">
        <p>Space — bet / cash out on Bet A.</p>
      </RulesSection>
    </>
  );
}

function Controls({ signedIn }: { signedIn: boolean }) {
  const [tab, setTab] = useState<'0' | '1'>('0');
  const mine = useCrash((s) => s.mine);
  const round = useCrash((s) => s.round);
  const live = (slot: 0 | 1) => {
    const b = mine[slot];
    return b && round && b.roundId === round.id && b.status === 'ACTIVE';
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="lg:hidden">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as '0' | '1')}
          listClassName="w-full [&>button]:flex-1 [&>button]:justify-center"
          items={[
            { value: '0', label: <span className="flex items-center gap-1.5">Bet A{live(0) ? <span className="h-1.5 w-1.5 rounded-full bg-win" /> : null}</span> },
            { value: '1', label: <span className="flex items-center gap-1.5">Bet B{live(1) ? <span className="h-1.5 w-1.5 rounded-full bg-win" /> : null}</span> },
          ]}
        />
      </div>
      {/* Both panels stay mounted (queued bets survive tab switches). */}
      <div className={tab === '0' ? 'block' : 'hidden lg:block'}>
        <BetPanel slot={0} signedIn={signedIn} hotkeys />
      </div>
      <div className={tab === '1' ? 'block' : 'hidden lg:block'}>
        <BetPanel slot={1} signedIn={signedIn} compact />
      </div>
    </div>
  );
}

export function CrashGame() {
  const me = useMe();
  const signedIn = !!me.data;
  const feed = useCrashFeed(signedIn);
  const [openRound, setOpenRound] = useState<string | null>(null);

  return (
    <GameShell
      gameId="crash"
      title="Launch"
      subtitle="Multiplayer crash · cash out before the launch fails"
      allowSpectate
      rules={<Rules />}
      controls={<Controls signedIn={signedIn} />}
      stage={
        feed.isError && !useCrash.getState().ready ? (
          <div className="rounded-xl border border-line bg-surface-1">
            <ErrorState title="Launch is unavailable" body="We couldn’t load the current round." onRetry={() => void feed.refetch()} />
          </div>
        ) : (
          <CrashStage onOpenRound={setOpenRound} />
        )
      }
      footer={
        <>
          <PlayersTable />
          <RoundInfoModal roundId={openRound} onClose={() => setOpenRound(null)} />
        </>
      }
    />
  );
}
