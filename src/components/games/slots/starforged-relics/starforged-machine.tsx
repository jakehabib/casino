'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import { GameShell } from '@/components/games/shared/game-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { ReasonCopy } from '@/lib/errors';
import { Lock } from 'lucide-react';
import {
  BigWinOverlay,
  FreeSpinsOverlay,
  ReelGrid,
  SlotControls,
  SlotPaytable,
  WinTicker,
  useSlotMachine,
  type SlotMachineController,
} from '../shared';
import { StarforgedDefs } from './symbols';
import { starforgedTheme as theme } from './theme';
import { ClusterOverlay, ModifierReveal, RelicCollectFx, TransformFx, relicPositions } from './fx';
import { ModifierStrip, RelicMeter, StarforgedBanner, StarforgedBonusHud, TierUpBanner } from './hud';

const SLOT_ID = 'starforged-relics';
const TITLE = 'Starforged Relics';
const SUBTITLE = '6×5 · cluster pays · cascades · relic-tier free spins';

/**
 * Slot #3 — Starforged Relics. A bespoke stage on the shared controller:
 * modifier strip + reveal seals, transform effects (Star Surge comets, forged
 * Relic Wilds, Supernova shockwaves), traced cluster shapes, and a relic
 * meter whose tier medallions carry the growing bonus multiplier.
 */
function StarforgedStage({ m }: { m: SlotMachineController }) {
  const def = m.def!;
  const o = m.current;
  const stopped = !!o && m.spinning.every((s) => !s);
  const modifier = o?.steps[0].modifiers?.[0] ?? null;
  const modifierShown = stopped && (m.revealing || m.activeTransform !== null || m.stepIndex >= 0) ? modifier : null;

  // Relic meter: advance to the spin's tally once its steps are presented.
  const done = !!o && m.stepIndex >= o.steps.length;
  const relicInfo = o?.isFreeSpin ? o.freeSpins?.relics : undefined;
  const collected = done && relicInfo ? relicInfo.collected : (m.bonus?.relics ?? 0);
  const tier = done && relicInfo ? relicInfo.tier : (m.bonus?.relicTier ?? 0);
  const collecting = done && !!relicInfo && relicInfo.landed > 0;
  const [pulse, setPulse] = useState(0);
  const lastCollected = useRef(collected);
  useEffect(() => {
    if (collected > lastCollected.current) setPulse((p) => p + 1);
    lastCollected.current = collected;
  }, [collected]);
  const bonusMult = done && o?.freeSpins && o.isFreeSpin ? o.freeSpins.multiplier : (m.bonus?.multiplier ?? 1);

  const overlay: ReactNode = (
    <>
      {m.presentWins.length ? <ClusterOverlay wins={m.presentWins} reels={def.reels} rows={def.rows} reduced={m.reduced} /> : null}
      <TransformFx transform={m.activeTransform} reels={def.reels} rows={def.rows} reduced={m.reduced} turbo={m.turbo} />
      <RelicCollectFx positions={collecting ? relicPositions(o, def.relics?.symbol ?? 'RELIC') : []} active={collecting} reels={def.reels} rows={def.rows} reduced={m.reduced} />
      <ModifierReveal modifier={m.revealing ? modifier : null} reduced={m.reduced} />
    </>
  );

  const reels = (
    <ReelGrid
      def={def}
      theme={theme}
      columns={m.columns}
      spinning={m.spinning}
      anticipation={m.anticipation}
      highlight={m.highlight}
      transformed={m.transformed}
      removing={m.removing}
      reduced={m.reduced}
      turbo={m.turbo}
      overlay={overlay}
    />
  );

  const banner = m.banner;
  let bannerNode: ReactNode = null;
  if (banner && !banner.text.startsWith('Orrery')) {
    const rel = o?.freeSpins?.relics;
    bannerNode =
      banner.text.startsWith('Relic tier') && rel && o?.freeSpins ? (
        <TierUpBanner key={banner.id} tier={rel.tier} multiplier={o.freeSpins.multiplier} spins={rel.tiersGained * (def.relics?.spinsPerTier ?? 3)} />
      ) : (
        <StarforgedBanner key={banner.id} text={banner.text} sub={banner.sub} />
      );
  }

  const maxReelHeight = 'min(max(280px, calc(100dvh - 460px)), 540px)';
  const ratio = def.reels / def.rows;

  return (
    <div className="relative isolate overflow-hidden rounded-xl border border-[#d9b46a26] bg-[#061b1f]" data-testid="slot-stage">
      <div className="pointer-events-none absolute inset-0 -z-10">{theme.background}</div>
      <div className="flex flex-col items-center px-2.5 pb-6 pt-3 sm:px-6 sm:pb-8 sm:pt-4">
        <div className="mb-2 flex min-h-[46px] w-full items-center justify-center sm:mb-2.5">
          {m.bonus ? <StarforgedBonusHud bonus={m.bonus} current={m.fsCurrent} multiplier={bonusMult} /> : theme.logo}
        </div>
        <div className="mb-3 flex min-h-[44px] w-full items-center justify-center sm:mb-3.5">
          {m.bonus ? <RelicMeter def={def} collected={collected} tier={tier} pulse={pulse} reduced={m.reduced} /> : <ModifierStrip active={modifierShown} />}
        </div>
        <div className="relative w-full" style={{ maxWidth: `calc(${maxReelHeight} * ${ratio})` }}>
          {theme.Frame!({ children: reels, inBonus: !!m.bonus })}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex translate-y-1/2 justify-center">
            <WinTicker amount={m.winAmount} bet={m.lastOutcome?.betLevel ?? m.bonus?.betLevel ?? m.betLevel} multiplier={m.busy ? m.stepMultiplier : undefined} />
          </div>
        </div>
      </div>

      <AnimatePresence>{bannerNode}</AnimatePresence>
      <AnimatePresence>
        {m.overlay?.kind === 'bigwin' ? (
          <BigWinOverlay key="bigwin" amount={m.overlay.amount} bet={m.overlay.bet} reduced={m.reduced} turbo={m.turbo} onDone={m.closeOverlay} />
        ) : null}
        {m.overlay?.kind === 'fs-intro' ? (
          <FreeSpinsOverlay
            key="fs-intro"
            mode="intro"
            spins={m.overlay.spins}
            totalWin={0}
            bet={m.bonus?.betLevel ?? m.betLevel}
            theme={theme}
            reduced={m.reduced}
            autoContinueMs={m.autoplay ? 3200 : undefined}
            onContinue={m.closeOverlay}
          />
        ) : null}
        {m.overlay?.kind === 'fs-outro' ? (
          <FreeSpinsOverlay
            key="fs-outro"
            mode="outro"
            spins={m.overlay.spins}
            totalWin={m.overlay.totalWin}
            bet={m.overlay.bet}
            theme={theme}
            reduced={m.reduced}
            autoContinueMs={m.autoplay ? 3200 : undefined}
            onContinue={m.closeOverlay}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default function StarforgedRelicsMachine() {
  const m = useSlotMachine(SLOT_ID);
  let stage: ReactNode;
  if (m.loading || (!m.def && !m.error)) {
    stage = <Skeleton className="aspect-[16/10] w-full rounded-xl" />;
  } else if (m.error || !m.def) {
    stage = (
      <div className="rounded-xl border border-line bg-surface-1">
        <ErrorState title="Couldn’t load this machine" onRetry={() => void m.refetch()} />
      </div>
    );
  } else if (!m.enabled) {
    stage = (
      <div className="rounded-xl border border-line bg-surface-1">
        <EmptyState icon={<Lock size={18} />} title={ReasonCopy.GAME_DISABLED.title} body={`${TITLE} is currently unavailable. Please check back soon.`} />
      </div>
    );
  } else {
    stage = <StarforgedStage m={m} />;
  }
  return (
    <>
      <StarforgedDefs />
      <GameShell
        gameId={SLOT_ID}
        title={TITLE}
        subtitle={SUBTITLE}
        controlsPosition="bottom"
        rules={m.def ? <SlotPaytable def={m.def} theme={theme} betLevel={m.bonus?.betLevel ?? m.betLevel} /> : <Skeleton className="h-64 w-full" />}
        stage={stage}
        controls={m.def && m.enabled ? <SlotControls m={m} /> : null}
      />
    </>
  );
}
