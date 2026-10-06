'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { GameShell, Stage } from '@/components/games/shared/game-shell';
import { useHotkeys } from '@/components/ui/bet-controls';
import { ErrorState } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';
import { useDisplayBalance } from '@/stores/balance-store';
import { usePlayStatus } from '@/hooks/use-play-status';
import { playSound } from '@/audio/audio-manager';
import { useBlackjack } from './use-blackjack';
import { BlackjackTable } from './table';
import { ActionBar } from './action-bar';
import { BlackjackControls } from './controls';
import { BlackjackRules } from './rules';

const BET_KEY = 'nova:bj:bet';

function readStoredBet(): number | null {
  try {
    const v = Number(window.localStorage.getItem(BET_KEY));
    return Number.isSafeInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export default function BlackjackGame() {
  const bj = useBlackjack();
  const balance = useDisplayBalance();
  const config = bj.config;
  const [bet, setBetRaw] = useState(1_000);
  const [chip, setChip] = useState(1_000);
  const [fresh, setFresh] = useState(true);
  const [instantId, setInstantId] = useState<string | null>(null);

  useEffect(() => {
    const stored = readStoredBet();
    if (stored) {
      setBetRaw(stored);
      setFresh(false);
    }
  }, []);

  const clamp = useCallback(
    (v: number) => (config ? Math.max(config.minBet, Math.min(config.maxBet, Math.floor(v))) : Math.floor(v)),
    [config],
  );
  const setBet = useCallback(
    (v: number) => {
      const next = clamp(v);
      setBetRaw(next);
      setFresh(false);
      try {
        window.localStorage.setItem(BET_KEY, String(next));
      } catch {
        /* storage unavailable */
      }
    },
    [clamp],
  );

  // Keep the bet inside the live table limits.
  useEffect(() => {
    if (config && (bet < config.minBet || bet > config.maxBet)) setBetRaw(clamp(bet));
  }, [config, bet, clamp]);

  // Restored hand → render without deal animation.
  useEffect(() => {
    if (bj.view && instantId === null && !bj.revealing) setInstantId(bj.view.id);
    // only the first presented round
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bj.view?.id]);

  const view = bj.view;
  const inRound = bj.inRound;
  const busy = bj.pending !== null;
  const hasPrevious = !!view?.settled;
  const { play } = usePlayStatus();
  const blocked = !!play && !play.canPlay;
  const canDeal = !!config?.enabled && !blocked && !inRound && !busy && !bj.revealing && (balance === null || balance >= bet);

  // A restricted account keeps the table (not the betting controls) while it
  // finishes a hand it had already started, including that hand's result.
  const [spectate, setSpectate] = useState(false);
  useEffect(() => {
    if (inRound) setSpectate(true);
  }, [inRound]);

  const onDeal = useCallback(() => {
    if (!canDeal) return;
    void bj.deal(bet);
  }, [canDeal, bj, bet]);

  const onRebetDouble = useCallback(() => {
    if (!canDeal || !config) return;
    const doubled = clamp(bet * 2);
    setBet(doubled);
    if (balance !== null && balance < doubled) return;
    void bj.deal(doubled);
  }, [canDeal, config, clamp, bet, setBet, balance, bj]);

  const onChip = useCallback(
    (v: number) => {
      setChip(v);
      if (inRound || busy) return;
      playSound('chip');
      setBet(fresh ? v : bet + v);
    },
    [inRound, busy, fresh, bet, setBet],
  );

  const onReset = useCallback(() => {
    if (!config) return;
    setBetRaw(config.minBet);
    setFresh(true);
  }, [config]);

  const legal = view && !bj.revealing ? view.legal : [];
  const hotkeys = useMemo(
    () => ({
      Space: inRound ? undefined : onDeal,
      h: legal.includes('HIT') ? () => bj.act('HIT') : undefined,
      s: legal.includes('STAND') ? () => bj.act('STAND') : undefined,
      d: legal.includes('DOUBLE') ? () => bj.act('DOUBLE') : undefined,
      p: legal.includes('SPLIT') ? () => bj.act('SPLIT') : undefined,
      y: legal.includes('INSURANCE') ? () => bj.act('INSURANCE') : undefined,
      n: legal.includes('DECLINE_INSURANCE') ? () => bj.act('DECLINE_INSURANCE') : undefined,
    }),
    [inRound, legal, bj, onDeal],
  );
  useHotkeys(hotkeys, !!config);

  let stage: React.ReactNode;
  let controls: React.ReactNode;
  if (bj.loading || (!config && !bj.error)) {
    stage = <Skeleton className="h-[470px] rounded-xl sm:h-[590px]" />;
    controls = <Skeleton className="h-[420px] rounded-xl" />;
  } else if (bj.error || !config) {
    stage = (
      <Stage className="flex min-h-[420px] items-center justify-center">
        <ErrorState title="Couldn’t load the table" body="Check your connection and try again." onRetry={() => void bj.refetch()} />
      </Stage>
    );
    controls = null;
  } else {
    stage = (
      <BlackjackTable
        view={view}
        shoe={bj.shoe}
        config={config}
        bet={bet}
        canBet={!inRound && !busy}
        onBetSpot={() => onChip(chip)}
        instantIds={instantId}
        actionBar={
          <ActionBar
            view={view}
            busy={busy}
            pending={bj.pending}
            revealing={bj.revealing}
            onAction={(a) => void bj.act(a)}
            onDeal={onDeal}
            onRebetDouble={onRebetDouble}
            bet={bet}
            canDeal={canDeal}
            hasPrevious={hasPrevious}
          />
        }
      />
    );
    controls = (
      <BlackjackControls
        config={config}
        bet={bet}
        setBet={setBet}
        chip={chip}
        onChip={onChip}
        onReset={onReset}
        balance={balance}
        view={view}
        inRound={inRound}
        busy={busy}
        revealing={bj.revealing}
        pending={bj.pending}
        onDeal={onDeal}
        onRebetDouble={onRebetDouble}
        hasPrevious={hasPrevious}
      />
    );
  }

  return (
    <GameShell
      gameId="blackjack"
      title="Blackjack"
      subtitle={config ? `${config.decks} decks · Blackjack pays ${config.blackjackPayout === '6:5' ? '6:5' : '3:2'} · Dealer ${config.dealerHitsSoft17 ? 'hits' : 'stands on'} soft 17` : 'Classic six-deck blackjack'}
      rules={<BlackjackRules config={config} />}
      controls={controls}
      stage={stage}
      allowSpectate={spectate}
    />
  );
}
