'use client';
import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Users } from 'lucide-react';
import { timeForMultiplier, multiplierAt } from '@/engines/crash/crash-math';
import type { CrashRoundPublic } from '@/engines/crash/types';
import { useConnectionState } from '@/hooks/use-socket';
import { LoadingSpinner } from '@/components/ui/spinner';
import { CreditIcon } from '@/components/ui/credit-icon';
import { formatCredits } from '@/lib/format';
import { cn } from '@/lib/cn';
import { CrashRenderer, curveColor, type Phase } from './crash-renderer';
import { serverNow, useCrash } from './crash-store';
import { HistoryStrip } from './history-strip';

export function phaseOf(round: CrashRoundPublic | null, now = serverNow()): Phase {
  if (!round) return 'idle';
  switch (round.status) {
    case 'WAITING':
      return now < round.bettingEndsAt ? 'waiting' : 'locked';
    case 'BETTING_LOCKED':
      return 'locked';
    case 'RUNNING':
      return 'running';
    default:
      return 'crashed';
  }
}

function multColor(m: number, crashed: boolean) {
  if (crashed) return 'var(--color-loss)';
  if (m < 2) return 'var(--color-fg)';
  const [r, g, b] = curveColor(m);
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

/**
 * The Launch stage: canvas chart + DOM overlays. One rAF loop drives both the
 * canvas and the big multiplier text (written to the DOM directly, so React
 * never re-renders at 60fps).
 */
export function CrashStage({ onOpenRound }: { onOpenRound: (roundId: string) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const multRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() ?? false;
  const round = useCrash((s) => s.round);
  const ready = useCrash((s) => s.ready);
  const betsCount = useCrash((s) => Object.keys(s.bets).length);
  const totalWagered = useCrash((s) => Object.values(s.bets).reduce((a, b) => a + b.amount, 0));
  const conn = useConnectionState();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const renderer = new CrashRenderer(canvas);
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      renderer.resize(r.width, r.height, Math.min(2, window.devicePixelRatio || 1));
    });
    ro.observe(wrap);
    let raf = 0;
    const loop = (now: number) => {
      const st = useCrash.getState();
      const r = st.round;
      const t = serverNow();
      const phase = phaseOf(r, t);
      let elapsed = 0;
      let m = 1;
      if (phase === 'running' && r?.startedAt) {
        elapsed = Math.max(0, t - r.startedAt);
        m = Math.max(multiplierAt(elapsed), st.lastTick / 100);
      } else if (phase === 'crashed' && r?.crashPoint !== undefined) {
        m = r.crashPoint / 100;
        elapsed = timeForMultiplier(r.crashPoint);
      }
      renderer.draw(
        {
          phase,
          elapsed,
          m,
          roundId: r?.id ?? null,
          reducedMotion: reducedRef.current,
          marks: st.marks.map((k) => ({ at: k.cashoutAt, mine: k.mine, label: k.mine ? `+${formatCredits(k.payout)}` : undefined })),
        },
        now,
      );
      if (multRef.current) {
        if (phase === 'running' || phase === 'crashed') {
          const txt = `${m.toFixed(2)}×`;
          if (multRef.current.textContent !== txt) multRef.current.textContent = txt;
          multRef.current.style.color = multColor(m, phase === 'crashed');
        }
      }
      if (r && phase === 'waiting') {
        const left = Math.max(0, r.bettingEndsAt - t);
        if (countRef.current) countRef.current.textContent = `${(left / 1000).toFixed(1)}s`;
        if (barRef.current) {
          const span = Math.max(1_000, r.bettingEndsAt - r.openedAt);
          barRef.current.style.transform = `scaleX(${Math.min(1, left / span)})`;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const phase = phaseOf(round);
  const voided = round?.voided;

  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-[#0b0c12]">
      <div
        ref={wrapRef}
        className="relative h-[300px] w-full xs:h-[320px] sm:h-[400px] lg:h-[470px]"
        style={{ background: 'radial-gradient(120% 90% at 78% 0%, #17133a 0%, #0e0f1a 48%, #0a0b10 100%)' }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 block" aria-hidden />

        {/* Top rail: round + recent results */}
        <div className="absolute inset-x-0 top-0 flex items-center gap-2 px-3 pt-3 sm:gap-3 sm:px-4 sm:pt-3.5">
          <div className="shrink-0 rounded-md border border-white/[0.06] bg-black/30 px-2 py-1 text-[11px] font-medium text-fg-subtle backdrop-blur-sm">
            {round ? <span className="tabular">Round #{round.number.toLocaleString('en-US')}</span> : 'Launch'}
          </div>
          <HistoryStrip onOpen={onOpenRound} />
        </div>

        {/* Centre read-out */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pt-6 text-center" aria-live="polite">
          {!ready ? (
            <LoadingSpinner size={22} className="text-fg-subtle" />
          ) : phase === 'waiting' ? (
            <div className="flex flex-col items-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-subtle sm:text-xs">Launch in</div>
              <span ref={countRef} className="tabular mt-1 text-[44px] font-semibold leading-none tracking-tight text-fg sm:text-[64px]">
                –
              </span>
              <div className="mt-4 h-1 w-40 overflow-hidden rounded-full bg-white/[0.07] sm:w-56">
                <div ref={barRef} className="h-full w-full origin-left rounded-full bg-accent" />
              </div>
              <div className="mt-3 flex items-center gap-3 text-xs text-fg-muted">
                <span className="inline-flex items-center gap-1.5">
                  <Users size={13} className="text-fg-subtle" />
                  <span className="tabular">{betsCount}</span> {betsCount === 1 ? 'bet' : 'bets'}
                </span>
                <span className="h-3 w-px bg-line-strong" />
                <span className="tabular inline-flex items-center gap-1.5">
                  <CreditIcon size={12} />
                  {formatCredits(totalWagered, { compact: true })}
                </span>
              </div>
            </div>
          ) : phase === 'locked' ? (
            <div className="flex flex-col items-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-subtle sm:text-xs">Bets closed</div>
              <div className="mt-1 text-3xl font-semibold tracking-tight text-fg sm:text-5xl">Launching…</div>
            </div>
          ) : phase === 'running' || phase === 'crashed' ? (
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'mb-1 h-4 text-[11px] font-semibold uppercase tracking-[0.18em] sm:text-xs',
                  phase === 'crashed' ? 'text-loss' : 'text-transparent',
                )}
              >
                {phase === 'crashed' ? (voided ? 'Round voided' : 'Crashed') : '·'}
              </div>
              <div
                ref={multRef}
                className={cn(
                  'tabular font-semibold leading-none tracking-[-0.03em] transition-[font-size] duration-300',
                  'text-[56px] sm:text-[88px] lg:text-[104px]',
                )}
                style={{ textShadow: phase === 'crashed' ? 'none' : '0 0 40px rgba(124,92,255,0.25)' }}
              >
                {round?.crashPoint !== undefined ? `${(round.crashPoint / 100).toFixed(2)}×` : '1.00×'}
              </div>
              {phase === 'crashed' && round?.crashPoint !== undefined ? (
                <div className="mt-2 text-xs text-fg-subtle">Next launch shortly</div>
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-fg-subtle">Waiting for the next round…</div>
          )}
        </div>

        {conn !== 'connected' ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0a0b0e]/70 backdrop-blur-[2px]">
            <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface-2 px-3.5 py-2 text-[13px] font-medium text-fg-muted shadow-2">
              <LoadingSpinner size={14} /> Reconnecting…
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
