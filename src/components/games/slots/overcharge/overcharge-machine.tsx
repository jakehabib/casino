'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { GameShell } from '@/components/games/shared/game-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, EmptyState } from '@/components/ui/states';
import { CreditIcon } from '@/components/ui/credit-icon';
import { ReasonCopy } from '@/lib/errors';
import { formatCredits } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useSlotMachine, type SlotMachineController } from '../shared/use-slot-machine';
import { ReelGrid } from '../shared/reel-grid';
import { WinOverlay } from '../shared/win-overlay';
import { BigWinOverlay, WinTicker } from '../shared/win-counter';
import { FeatureBanner, FreeSpinsOverlay } from '../shared/free-spins-overlay';
import { SlotControls } from '../shared/slot-controls';
import { SlotPaytable } from '../shared/paytable';
import { savedBonusNote } from '../shared/slot-machine';
import type { PublicBonus } from '../shared/types';
import { OverchargeDefs } from './symbols';
import { OC_AMBER, OC_CYAN, OverchargeBackground, OverchargeLogo, overchargeTheme as theme } from './theme';
import { ChargeLadder } from './charge-ladder';
import { CascadeFx } from './cascade-fx';

const SLOT_ID = 'overcharge';
const TITLE = 'Overcharge';
const SUBTITLE = '5×4 · 1,024 ways · cascading chain multiplier';

/**
 * Chain level shown on the ladder. The controller replays server steps; the
 * ladder mirrors them: a spin starts at 0 (base) or the held bonus level, and
 * each cascade (removed cells refilled) advances one rung — exactly the
 * engine's `ladder[start + step]`. Between spins the server's
 * `bonus.cascadeLevel` is the truth.
 */
function useChainLevel(m: SlotMachineController, top: number, persist: boolean) {
  const [level, setLevel] = useState(0);
  const [surgeKey, setSurgeKey] = useState(0);
  const prevPhase = useRef(m.phase);
  const prevRemoving = useRef(m.removing);

  useEffect(() => {
    const was = prevPhase.current;
    prevPhase.current = m.phase;
    if (m.phase === 'spinning' && was !== 'spinning') setLevel(persist && m.bonus ? Math.min(m.bonus.cascadeLevel, top) : 0);
    else if (m.phase === 'idle' && m.bonus && persist) setLevel(Math.min(m.bonus.cascadeLevel, top));
    else if (m.phase === 'idle' && !m.bonus && was !== 'idle') {
      // Base game: let the reached level read for a beat, then discharge (the next paid spin starts at 1×).
      const t = setTimeout(() => setLevel(0), 1600);
      return () => clearTimeout(t);
    }
  }, [m.phase, m.bonus, persist, top]);

  useEffect(() => {
    if (prevRemoving.current && !m.removing) {
      setLevel((l) => Math.min(l + 1, top));
      setSurgeKey((k) => k + 1);
    }
    prevRemoving.current = m.removing;
  }, [m.removing, top]);

  return { level, surgeKey };
}

/** Graphite chassis with HUD corner brackets; an energy dash races the bezel on every chain surge. */
function Frame({ children, level, top, surgeKey, inBonus, reduced }: { children: ReactNode; level: number; top: number; surgeKey: number; inBonus: boolean; reduced: boolean }) {
  const hot = level >= top;
  const c = hot ? OC_AMBER : OC_CYAN;
  const glow = level / Math.max(1, top);
  return (
    <div
      className="relative rounded-[16px] p-[6px] sm:rounded-[20px] sm:p-[10px]"
      style={{
        background: 'linear-gradient(180deg, #212a36 0%, #121820 18%, #0b1016 60%, #151c25 100%)',
        boxShadow: [
          '0 0 0 1px #000',
          'inset 0 1px 0 #ffffff1c',
          'inset 0 -1px 0 #ffffff0a',
          '0 28px 60px -22px #000',
          `0 0 ${24 + glow * 40}px -12px ${c}${Math.round(40 + glow * 120)
            .toString(16)
            .padStart(2, '0')}`,
          inBonus ? `0 0 0 1px ${OC_AMBER}30` : '',
        ]
          .filter(Boolean)
          .join(', '),
        transition: 'box-shadow 500ms ease',
      }}
    >
      {/* HUD corners */}
      {(['left-[-1px] top-[-1px] border-l-2 border-t-2 rounded-tl-[16px] sm:rounded-tl-[20px]', 'right-[-1px] top-[-1px] border-r-2 border-t-2 rounded-tr-[16px] sm:rounded-tr-[20px]', 'bottom-[-1px] left-[-1px] border-b-2 border-l-2 rounded-bl-[16px] sm:rounded-bl-[20px]', 'bottom-[-1px] right-[-1px] border-b-2 border-r-2 rounded-br-[16px] sm:rounded-br-[20px]'] as const).map((cls) => (
        <span key={cls} aria-hidden className={cn('pointer-events-none absolute h-5 w-5 transition-colors duration-500 sm:h-7 sm:w-7', cls)} style={{ borderColor: `${c}${inBonus || level > 0 ? 'cc' : '70'}` }} />
      ))}
      {/* bezel conduit: a dash of energy runs the frame on every surge */}
      {!reduced && surgeKey > 0 ? (
        <svg key={surgeKey} aria-hidden className="pointer-events-none absolute inset-[2px] z-10 h-[calc(100%-4px)] w-[calc(100%-4px)] overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
          {[0, 50].map((off) => (
            <rect
              key={off}
              x="0.5"
              y="0.5"
              width="99"
              height="99"
              rx="3"
              pathLength={100}
              fill="none"
              stroke={c}
              strokeWidth="2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              strokeDasharray="9 91"
              style={{ filter: `drop-shadow(0 0 4px ${c})`, animation: 'oc-bezel 900ms cubic-bezier(.45,0,.25,1) forwards', ['--oc-off' as string]: `${-off}` }}
            />
          ))}
        </svg>
      ) : null}
      <style>{`@keyframes oc-bezel { from { stroke-dashoffset: var(--oc-off); opacity: 1; } 80% { opacity: 1; } to { stroke-dashoffset: calc(var(--oc-off) - 60); opacity: 0; } }`}</style>
      <div className="relative overflow-hidden rounded-[10px] ring-1 ring-[#000] sm:rounded-[12px]" style={{ boxShadow: `0 0 0 1px ${c}${level > 0 || inBonus ? '38' : '1c'}` }}>
        {children}
        {/* surge flash across the bay */}
        {!reduced && surgeKey > 0 ? (
          <motion.div
            key={surgeKey}
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            style={{ boxShadow: `inset 0 0 40px -6px ${c}`, background: `linear-gradient(180deg, ${c}14, transparent 40%)` }}
          />
        ) : null}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10" style={{ boxShadow: 'inset 0 12px 24px -14px #000, inset 0 -12px 24px -14px #000' }} />
      </div>
    </div>
  );
}

/** Free-spins HUD (replaces the logo while the bonus runs). */
function OverchargeHud({ bonus, current }: { bonus: PublicBonus; current: number | null }) {
  const n = Math.min(current ?? bonus.played, bonus.total);
  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-stretch justify-center gap-2 sm:gap-3" data-testid="slot-bonus-hud">
      <Panel label="Free spins">
        <span className="tabular text-[#ffd79a]">{n}</span>
        <span className="tabular text-[#6b7b90]"> / {bonus.total}</span>
        <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-[#1a2330]">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-[#ffbf5a] to-[#ffe1ad]" initial={false} animate={{ width: `${(n / Math.max(1, bonus.total)) * 100}%` }} transition={{ duration: 0.4 }} />
        </div>
      </Panel>
      <Panel label="Bonus win">
        <span className="tabular inline-flex items-center gap-1.5 text-white">
          <CreditIcon size={14} />
          {formatCredits(bonus.bonusWin)}
        </span>
      </Panel>
    </motion.div>
  );
}

function Panel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="relative min-w-[118px] overflow-hidden rounded-[10px] border border-[#243142] bg-[#060b12]/85 px-3.5 py-1.5 text-center sm:min-w-[140px]">
      <div aria-hidden className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-[#ffbf5a99] to-transparent" />
      <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#7f90a6]">{label}</div>
      <div className="mt-0.5 text-[16px] font-extrabold leading-tight">{children}</div>
    </div>
  );
}

function OverchargeStage({ m }: { m: SlotMachineController }) {
  const def = m.def!;
  const ladder = def.cascade?.multipliers ?? [1];
  const top = ladder.length - 1;
  const persist = !!def.cascade?.persistInFreeSpins;
  const { level, surgeKey } = useChainLevel(m, top, persist);
  const hot = level >= top && top > 0;
  const maxReelHeight = 'min(max(260px, calc(100dvh - 500px)), 500px)';
  const ratio = def.reels / def.rows;

  return (
    <div className="relative isolate overflow-hidden rounded-xl border border-line bg-[#04070b]" data-testid="slot-stage">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <OverchargeBackground charge={top ? level / top : 0} hot={hot} />
      </div>
      <div className="flex flex-col items-center px-2.5 pb-7 pt-3 sm:px-6 sm:pb-9 sm:pt-4">
        <div className="mb-2 flex min-h-[50px] w-full items-center justify-center sm:mb-3">
          {m.bonus ? <OverchargeHud bonus={m.bonus} current={m.fsCurrent} /> : <OverchargeLogo />}
        </div>
        <div className="relative w-full" style={{ maxWidth: `calc(${maxReelHeight} * ${ratio} + 20px)` }}>
          <div className="mb-1.5 px-0.5 sm:mb-2">
            <ChargeLadder ladder={ladder} level={level} surgeKey={surgeKey} held={persist && !!m.bonus} reduced={m.reduced} />
          </div>
          <Frame level={level} top={top} surgeKey={surgeKey} inBonus={!!m.bonus} reduced={m.reduced}>
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
              overlay={
                <>
                  <CascadeFx reels={def.reels} rows={def.rows} removing={m.removing} wins={m.presentWins} color={OC_CYAN} hot={hot} reduced={m.reduced} turbo={m.turbo} />
                  {m.presentWins.length ? <WinOverlay def={def} theme={theme} wins={m.presentWins} reduced={m.reduced} /> : null}
                </>
              }
            />
          </Frame>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex translate-y-1/2 justify-center">
            <WinTicker amount={m.winAmount} bet={m.lastOutcome?.betLevel ?? m.bonus?.betLevel ?? m.betLevel} multiplier={m.busy ? m.stepMultiplier : undefined} />
          </div>
        </div>
      </div>

      <AnimatePresence>{m.banner ? <FeatureBanner key={m.banner.id} text={m.banner.text} sub={m.banner.sub} theme={theme} /> : null}</AnimatePresence>
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

/** Slot #2 — Overcharge: the shared slot framework with a bespoke stage, art and cascade effects. */
export default function OverchargeMachine() {
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
    stage = <OverchargeStage m={m} />;
  }
  return (
    <>
      <OverchargeDefs />
      <GameShell
        gameId={SLOT_ID}
        title={TITLE}
        subtitle={SUBTITLE}
        controlsPosition="bottom"
        rules={m.def ? <SlotPaytable def={m.def} theme={theme} betLevel={m.bonus?.betLevel ?? m.betLevel} /> : <Skeleton className="h-64 w-full" />}
        stage={stage}
        controls={m.def && m.enabled ? <SlotControls m={m} /> : null}
        blockedNote={savedBonusNote(m, TITLE)}
      />
    </>
  );
}
