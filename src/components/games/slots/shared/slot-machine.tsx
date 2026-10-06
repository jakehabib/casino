'use client';
import type { ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import { GameShell } from '@/components/games/shared/game-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, EmptyState } from '@/components/ui/states';
import { ReasonCopy } from '@/lib/errors';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ReelGrid } from './reel-grid';
import { WinOverlay } from './win-overlay';
import { BigWinOverlay, WinTicker } from './win-counter';
import { FeatureBanner, FreeSpinsOverlay } from './free-spins-overlay';
import { SlotControls } from './slot-controls';
import { SlotPaytable } from './paytable';
import { BonusHud, MultiplierLadder } from './bonus-hud';
import { useSlotMachine, type SlotMachineController } from './use-slot-machine';
import type { SlotTheme } from './types';

/**
 * SlotStage — reels + every overlay (win lines, ticker, big win, free-spin
 * intro/outro, banners, bonus HUD), themed. Machines that want a bespoke
 * layout can compose <ReelGrid/> etc. themselves; most only need a theme.
 *
 * `maxReelHeight` caps the reel window height (CSS length) so the machine
 * keeps its aspect ratio on every screen.
 */
export function SlotStage({
  m,
  theme,
  maxReelHeight = 'min(max(300px, calc(100dvh - 440px)), 520px)',
  header,
  className,
}: {
  m: SlotMachineController;
  theme: SlotTheme;
  maxReelHeight?: string;
  /** Extra content above the reels (under the logo). */
  header?: ReactNode;
  className?: string;
}) {
  const def = m.def;
  if (!def) return null;
  const ratio = def.reels / def.rows;
  const ladder = def.cascade && def.cascade.multipliers.length > 1 ? def.cascade.multipliers : null;
  const ladderActive = m.busy
    ? m.stepMultiplier
    : m.bonus && ladder && def.cascade?.persistInFreeSpins
      ? ladder[Math.min(m.bonus.cascadeLevel, ladder.length - 1)]
      : ladder?.[0] ?? 1;
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
      overlay={m.presentWins.length ? <WinOverlay def={def} theme={theme} wins={m.presentWins} reduced={m.reduced} /> : null}
    />
  );
  return (
    <div className={cn('relative isolate overflow-hidden rounded-xl border border-line bg-bg-raised', className)} data-testid="slot-stage">
      {theme.background ? <div className="pointer-events-none absolute inset-0 -z-10">{theme.background}</div> : null}
      <div className="flex flex-col items-center px-2.5 pb-6 pt-3 sm:px-6 sm:pb-8 sm:pt-4">
        {/* Top row: logo in the base game, bonus HUD during free spins (same slot, no layout jump). */}
        <div className="mb-2.5 flex min-h-[46px] w-full items-center justify-center sm:mb-3">
          {m.bonus ? <BonusHud def={def} bonus={m.bonus} current={m.fsCurrent} accentClass={theme.accentText} /> : (theme.logo ?? null)}
        </div>
        {header}
        {ladder && !m.bonus ? (
          <div className="mb-2.5 flex w-full justify-center sm:mb-3">
            <MultiplierLadder ladder={ladder} active={ladderActive} />
          </div>
        ) : null}
        <div className="relative w-full" style={{ maxWidth: `calc(${maxReelHeight} * ${ratio})` }}>
          {theme.Frame ? theme.Frame({ children: reels, inBonus: !!m.bonus }) : <div className="overflow-hidden rounded-lg border border-line">{reels}</div>}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex translate-y-1/2 justify-center">
            <WinTicker amount={m.winAmount} bet={m.lastOutcome?.betLevel ?? m.bonus?.betLevel ?? m.betLevel} multiplier={m.busy ? m.stepMultiplier : undefined} />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {m.banner ? <FeatureBanner key={m.banner.id} text={m.banner.text} sub={m.banner.sub} theme={theme} /> : null}
      </AnimatePresence>
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

/**
 * SlotMachine — complete page body for a machine: GameShell (rules modal with
 * the generated paytable, fairness, sound, play gate) + SlotStage + controls.
 */
export function SlotMachine({
  slotId,
  theme,
  title,
  subtitle,
  maxReelHeight,
  header,
}: {
  slotId: string;
  theme: SlotTheme;
  title: string;
  subtitle?: string;
  maxReelHeight?: string;
  header?: ReactNode;
}) {
  const m = useSlotMachine(slotId);
  return <SlotMachineView m={m} slotId={slotId} theme={theme} title={title} subtitle={subtitle} maxReelHeight={maxReelHeight} header={header} />;
}

export function SlotMachineView({
  m,
  slotId,
  theme,
  title,
  subtitle,
  maxReelHeight,
  header,
}: {
  m: SlotMachineController;
  slotId: string;
  theme: SlotTheme;
  title: string;
  subtitle?: string;
  maxReelHeight?: string;
  header?: ReactNode;
}) {
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
        <EmptyState icon={<Lock size={18} />} title={ReasonCopy.GAME_DISABLED.title} body={`${title} is currently unavailable. Please check back soon.`} />
      </div>
    );
  } else {
    stage = <SlotStage m={m} theme={theme} maxReelHeight={maxReelHeight} header={header} />;
  }
  return (
    <GameShell
      gameId={slotId}
      title={title}
      subtitle={subtitle}
      controlsPosition="bottom"
      rules={m.def ? <SlotPaytable def={m.def} theme={theme} betLevel={m.bonus?.betLevel ?? m.betLevel} /> : <Skeleton className="h-64 w-full" />}
      stage={stage}
      controls={m.def && m.enabled ? <SlotControls m={m} /> : null}
    />
  );
}
