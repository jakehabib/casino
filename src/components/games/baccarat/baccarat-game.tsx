'use client';
import { useMemo } from 'react';
import { GameShell } from '@/components/games/shared/game-shell';
import { useHotkeys } from '@/components/ui/bet-controls';
import { ErrorState } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';
import { useBaccarat } from './use-baccarat';
import { BaccaratTable } from './table';
import { BaccaratControls } from './controls';
import { BeadPlate } from './bead-plate';
import { BaccaratRules } from './rules';

export function BaccaratGame() {
  const c = useBaccarat();
  const cfg = c.cfg;

  const keys = useMemo(() => ({ Space: c.primary, Backspace: c.undo }), [c.primary, c.undo]);
  useHotkeys(keys, !!cfg);

  const subtitle = cfg
    ? `Punto Banco · ${cfg.decks} decks · Banker ${cfg.bankerCommissionBps / 100}% commission · Tie ${cfg.tiePayout}:1`
    : 'Punto Banco';

  const loading = c.state.isLoading;
  const failed = c.state.isError && !c.state.data;

  return (
    <GameShell
      gameId="baccarat"
      title="Baccarat"
      subtitle={subtitle}
      rules={<BaccaratRules cfg={cfg} />}
      controls={loading ? <Skeleton className="h-[420px] rounded-xl" /> : <BaccaratControls c={c} />}
      stage={
        failed ? (
          <ErrorState title="Couldn’t load the table" body="Check your connection and try again." onRetry={() => void c.state.refetch()} />
        ) : loading ? (
          <Skeleton className="h-[440px] rounded-xl" />
        ) : (
          <BaccaratTable c={c} />
        )
      }
      footer={!failed ? <BeadPlate beads={c.state.data?.beadPlate ?? []} shoe={c.state.data?.shoe ?? null} loading={loading} /> : null}
    />
  );
}
