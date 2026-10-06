'use client';
import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { WHEEL_ORDER, POCKET_DEG, colorOf, pocketIndex } from '@/engines/roulette/wheel';
import { playSound } from '@/audio/audio-manager';
import { cn } from '@/lib/cn';

/**
 * Top-down European wheel (SVG). The head rotates clockwise; the ball travels
 * counter-clockwise on the track, drops, bounces over the frets and settles in
 * the pocket of the server-determined number, then rides with the head.
 *
 * Animation is driven by a single rAF loop that writes transforms to refs — no
 * React renders per frame. The landing pocket is computed from WHEEL_ORDER, so
 * the ball always ends exactly in `pocketIndex(winningNumber)`.
 *
 * Angles are degrees clockwise from 12 o'clock.
 */

export interface RouletteWheelHandle {
  /** Animate a spin that lands on `n`. Resolves when the ball has settled. */
  spinTo(n: number): Promise<void>;
  /** Place the ball at rest in `n`'s pocket without animating (refresh restore). */
  rest(n: number | null): void;
}

const R_TRACK = 171;
const R_POCKET = 101;
const R_NUM_OUT = 139;
const R_NUM_IN = 114;
const R_POCKET_IN = 89;
const IDLE_SPEED = 7; // deg/s

const POCKET_FILL = { red: 'var(--color-roulette-red)', black: 'var(--color-roulette-black)', green: 'var(--color-roulette-green)' } as const;

const rad = (a: number) => (a * Math.PI) / 180;
const pt = (r: number, a: number) => `${(r * Math.sin(rad(a))).toFixed(3)} ${(-r * Math.cos(rad(a))).toFixed(3)}`;
function wedge(r0: number, r1: number, a0: number, a1: number) {
  return `M ${pt(r1, a0)} A ${r1} ${r1} 0 0 1 ${pt(r1, a1)} L ${pt(r0, a1)} A ${r0} ${r0} 0 0 0 ${pt(r0, a0)} Z`;
}
const mod = (a: number, m = 360) => ((a % m) + m) % m;
const easeOutCubic = (u: number) => 1 - Math.pow(1 - u, 3);
const easeOutQuad = (u: number) => 1 - (1 - u) * (1 - u);
const easeInQuad = (u: number) => u * u;
const clamp01 = (u: number) => Math.max(0, Math.min(1, u));

interface Plan {
  start: number; // performance.now()
  T: number; // wheel ease duration (s)
  Tb: number; // ball settle time (s)
  w0: number;
  Dw: number;
  psi0: number;
  Dpsi: number;
  rStart: number;
  reduced: boolean;
  target: number; // final relative angle
  resolve: () => void;
  bounceIdx: number;
  lastPocket: number;
  resolved: boolean;
}

// Bounce profile after the ball reaches the pocket ring: [height, duration share]
const BOUNCES: [number, number][] = [
  [17, 0.3],
  [9, 0.22],
  [4.5, 0.17],
  [1.8, 0.12],
];
const BOUNCE_TOTAL = BOUNCES.reduce((s, [, d]) => s + d, 0);

export const RouletteWheel = memo(
  forwardRef<RouletteWheelHandle, { winning: number | null; className?: string; highlight?: boolean }>(function RouletteWheel(
    { winning, className, highlight },
    ref,
  ) {
    const reduce = useReducedMotion() ?? false;
    const headRef = useRef<SVGGElement>(null);
    const ballRef = useRef<SVGGElement>(null);
    const ballShadowRef = useRef<SVGCircleElement>(null);
    const st = useRef({ w: -POCKET_DEG * 0.5, psi: 0, r: R_POCKET, visible: false, plan: null as Plan | null, last: 0 });
    const reduceRef = useRef(reduce);
    reduceRef.current = reduce;

    useImperativeHandle(
      ref,
      () => ({
        spinTo(n: number) {
          return new Promise<void>((resolve) => {
            const s = st.current;
            s.plan?.resolve();
            const reduced = reduceRef.current;
            const T = reduced ? 1.1 : 6.0;
            const Tb = reduced ? 0.9 : 4.9;
            const target = pocketIndex(n) * POCKET_DEG;
            // Ball starts on the track (if it was not on the wheel yet, at 12 o'clock).
            const psi0 = s.visible ? s.psi : mod(-s.w);
            const base = reduced ? 360 : 1440 + 360;
            // psi decreases (counter-clockwise relative to the head) and must end ≡ target.
            const adj = mod(psi0 - target);
            s.visible = true;
            s.plan = {
              start: performance.now(),
              T,
              Tb,
              w0: s.w,
              Dw: reduced ? 40 : 430,
              psi0,
              Dpsi: base + adj,
              rStart: s.r,
              reduced,
              target,
              resolve,
              bounceIdx: -1,
              resolved: false,
              lastPocket: Math.floor(mod(psi0 + POCKET_DEG / 2) / POCKET_DEG),
            };
          });
        },
        rest(n: number | null) {
          const s = st.current;
          if (s.plan) return;
          if (n === null) {
            s.visible = false;
            return;
          }
          s.visible = true;
          s.psi = pocketIndex(n) * POCKET_DEG;
          s.r = R_POCKET;
        },
      }),
      [],
    );

    useEffect(() => {
      let raf = 0;
      const s = st.current;
      s.last = performance.now();
      const frame = (now: number) => {
        const dt = Math.min(0.05, (now - s.last) / 1000);
        s.last = now;
        const p = s.plan;
        if (p) {
          const t = (now - p.start) / 1000;
          // Head: idle drift + eased boost so the speed returns smoothly to idle.
          s.w = p.w0 + IDLE_SPEED * t + p.Dw * easeOutCubic(clamp01(t / p.T));
          if (t < p.Tb) {
            const u = t / p.Tb;
            s.psi = p.psi0 - p.Dpsi * (p.reduced ? easeOutQuad(u) : easeOutCubic(u));
            s.r = ballRadius(p, t);
            // Fret ticks once the ball is down among the pockets.
            if (!p.reduced && s.r < R_NUM_OUT + 6) {
              const pocket = Math.floor(mod(s.psi + POCKET_DEG / 2) / POCKET_DEG);
              if (pocket !== p.lastPocket) {
                p.lastPocket = pocket;
                playSound('wheelTick', { pitch: 0.9 + (pocket % 5) * 0.05 });
              }
            }
          } else {
            s.psi = p.target;
            s.r = R_POCKET;
            if (!p.resolved && t >= p.Tb + (p.reduced ? 0.05 : 0.3)) {
              p.resolved = true;
              p.resolve();
            }
            // Keep driving the head until its boost has fully decayed into idle drift.
            if (t >= p.T) s.plan = null;
          }
        } else if (!reduceRef.current) {
          s.w += IDLE_SPEED * dt;
        }
        s.w = mod(s.w);
        headRef.current?.setAttribute('transform', `rotate(${s.w.toFixed(3)})`);
        const ball = ballRef.current;
        if (ball) {
          const a = s.w + s.psi;
          ball.setAttribute('transform', `translate(${pt(s.r, a)})`);
          ball.style.opacity = s.visible ? '1' : '0';
          // Contact shadow falls toward the centre (light from above-outside).
          ballShadowRef.current?.setAttribute('transform', `translate(${(-Math.sin(rad(a)) * 1.6).toFixed(2)} ${(Math.cos(rad(a)) * 1.6).toFixed(2)})`);
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      return () => {
        cancelAnimationFrame(raf);
        s.plan?.resolve();
        s.plan = null;
      };
    }, []);

    const winIdx = winning === null ? -1 : pocketIndex(winning);

    return (
      <svg viewBox="-200 -200 400 400" className={cn('block h-auto w-full select-none', className)} role="img" aria-label={winning === null ? 'Roulette wheel' : `Roulette wheel, ball on ${winning}`}>
        <defs>
          <radialGradient id="rw-wood" cx="0" cy="0" r="200" gradientUnits="userSpaceOnUse">
            <stop offset="0.86" stopColor="#3a2416" />
            <stop offset="0.93" stopColor="#5b3a22" />
            <stop offset="1" stopColor="#2a190e" />
          </radialGradient>
          <linearGradient id="rw-wood-grain" x1="-200" y1="-200" x2="200" y2="200" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.10" />
            <stop offset="0.45" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="1" stopColor="#000000" stopOpacity="0.25" />
          </linearGradient>
          <radialGradient id="rw-track" cx="0" cy="0" r="186" gradientUnits="userSpaceOnUse">
            <stop offset="0.74" stopColor="#0b0c0f" />
            <stop offset="0.86" stopColor="#1c1f26" />
            <stop offset="0.97" stopColor="#262a33" />
            <stop offset="1" stopColor="#0d0e11" />
          </radialGradient>
          <radialGradient id="rw-cone" cx="0" cy="0" r={R_POCKET_IN} gradientUnits="userSpaceOnUse">
            <stop offset="0.3" stopColor="#4a2f1c" />
            <stop offset="0.75" stopColor="#6b4428" />
            <stop offset="1" stopColor="#3b2414" />
          </radialGradient>
          <linearGradient id="rw-metal" x1="-40" y1="-40" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#f4f6fa" />
            <stop offset="0.45" stopColor="#a4abb8" />
            <stop offset="0.55" stopColor="#7c8391" />
            <stop offset="1" stopColor="#dfe3ea" />
          </linearGradient>
          <radialGradient id="rw-ball" cx="-1.8" cy="-2" r="7" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.55" stopColor="#e9ecf1" />
            <stop offset="1" stopColor="#9aa1ad" />
          </radialGradient>
          <radialGradient id="rw-sheen" cx="-60" cy="-90" r="260" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.10" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <filter id="rw-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>

        {/* Bowl: wooden rim + ball track (static) */}
        <circle r="200" fill="url(#rw-wood)" />
        <circle r="200" fill="url(#rw-wood-grain)" />
        <circle r="197" fill="none" stroke="#000" strokeOpacity="0.45" strokeWidth="1.5" />
        <circle r="186" fill="url(#rw-track)" />
        <circle r="186" fill="none" stroke="url(#rw-metal)" strokeWidth="1.6" strokeOpacity="0.8" />
        <circle r="156" fill="none" stroke="#ffffff" strokeOpacity="0.04" strokeWidth="1" />
        {/* Deflectors */}
        {Array.from({ length: 8 }, (_, i) => {
          const a = i * 45 + 22.5;
          const vertical = i % 2 === 0;
          return (
            <g key={i} transform={`rotate(${a}) translate(0 -152)`}>
              <path d={vertical ? 'M0 -7 L3 0 L0 7 L-3 0 Z' : 'M-7 0 L0 -3 L7 0 L0 3 Z'} fill="url(#rw-metal)" stroke="#000" strokeOpacity="0.35" strokeWidth="0.6" />
            </g>
          );
        })}
        <circle r={R_NUM_OUT + 2.5} fill="#0a0b0e" />

        {/* Rotating head */}
        <g ref={headRef}>
          {WHEEL_ORDER.map((n, i) => {
            const a0 = i * POCKET_DEG - POCKET_DEG / 2;
            const a1 = a0 + POCKET_DEG;
            const c = colorOf(n);
            return (
              <g key={n}>
                <path d={wedge(R_NUM_IN, R_NUM_OUT, a0, a1)} fill={POCKET_FILL[c]} />
                <path d={wedge(R_POCKET_IN, R_NUM_IN, a0, a1)} fill={POCKET_FILL[c]} />
                <path d={wedge(R_POCKET_IN, R_NUM_IN, a0, a1)} fill="#000" fillOpacity="0.38" />
                <text
                  transform={`rotate(${i * POCKET_DEG}) translate(0 ${-(R_NUM_IN + R_NUM_OUT) / 2 + 0.5})`}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize="12.5"
                  fontWeight="700"
                  fill="#f5f6f8"
                  style={{ fontFamily: 'var(--font-geist-sans)', fontVariantNumeric: 'tabular-nums' }}
                >
                  {n}
                </text>
              </g>
            );
          })}
          {/* Frets */}
          {WHEEL_ORDER.map((_, i) => {
            const a = i * POCKET_DEG - POCKET_DEG / 2;
            return (
              <g key={`f${i}`}>
                <line x1={0} y1={-R_POCKET_IN} x2={0} y2={-R_NUM_IN} transform={`rotate(${a})`} stroke="url(#rw-metal)" strokeWidth="1.6" />
                <line x1={0} y1={-R_NUM_IN} x2={0} y2={-R_NUM_OUT} transform={`rotate(${a})`} stroke="#000" strokeOpacity="0.35" strokeWidth="0.8" />
              </g>
            );
          })}
          <circle r={R_NUM_IN} fill="none" stroke="url(#rw-metal)" strokeWidth="1.4" />
          <circle r={R_NUM_OUT} fill="none" stroke="#c9ced8" strokeOpacity="0.55" strokeWidth="1.2" />
          {/* Winning pocket highlight */}
          {winIdx >= 0 && highlight ? (
            <path
              d={wedge(R_POCKET_IN, R_NUM_OUT, winIdx * POCKET_DEG - POCKET_DEG / 2, winIdx * POCKET_DEG + POCKET_DEG / 2)}
              fill="#ffffff"
              fillOpacity="0.24"
              stroke="#ffffff"
              strokeOpacity="0.9"
              strokeWidth="1.6"
              className="animate-[rw-pulse_1.6s_ease-in-out_infinite]"
            />
          ) : null}
          {/* Cone */}
          <circle r={R_POCKET_IN} fill="url(#rw-cone)" />
          <circle r={R_POCKET_IN} fill="none" stroke="url(#rw-metal)" strokeWidth="2.2" />
          {Array.from({ length: 8 }, (_, i) => (
            <line key={i} x1="0" y1="-44" x2="0" y2={-R_POCKET_IN + 3} transform={`rotate(${i * 45 + 22.5})`} stroke="#000" strokeOpacity="0.18" strokeWidth="1" />
          ))}
          <circle r="46" fill="#2a1a0f" />
          <circle r="46" fill="none" stroke="url(#rw-metal)" strokeWidth="1.8" />
          {/* Turret */}
          {Array.from({ length: 4 }, (_, i) => (
            <g key={i} transform={`rotate(${i * 90 + 45})`}>
              <path d="M -3.2 -14 L -1.8 -36 L 1.8 -36 L 3.2 -14 Z" fill="url(#rw-metal)" stroke="#000" strokeOpacity="0.3" strokeWidth="0.5" />
              <circle cy="-38" r="4.2" fill="url(#rw-metal)" stroke="#000" strokeOpacity="0.35" strokeWidth="0.5" />
            </g>
          ))}
          <circle r="16" fill="url(#rw-metal)" stroke="#000" strokeOpacity="0.35" strokeWidth="0.6" />
          <circle r="9" fill="#cfd4dc" stroke="#7c8391" strokeWidth="0.8" />
          <circle r="3.5" fill="#f4f6fa" />
        </g>

        {/* Ball */}
        <g ref={ballRef} style={{ opacity: 0 }}>
          <circle ref={ballShadowRef} r="6.2" fill="#000" fillOpacity="0.45" filter="url(#rw-glow)" />
          <circle r="5.6" fill="url(#rw-ball)" />
        </g>

        {/* Glass sheen */}
        <circle r="200" fill="url(#rw-sheen)" pointerEvents="none" />
        <style>{`@keyframes rw-pulse { 0%,100% { opacity: 1 } 50% { opacity: .55 } }`}</style>
      </svg>
    );
  }),
);

/** Radial position of the ball during a spin plan. Also fires the drop sound. */
function ballRadius(p: Plan, t: number): number {
  const u = t / p.Tb;
  if (p.reduced) return R_TRACK + (R_POCKET - R_TRACK) * easeInQuad(clamp01(u));
  // Launch: lift from wherever it was (pocket or track) up to the track.
  const lift = clamp01(t / 0.45);
  const uDrop = 0.5;
  if (u < uDrop) {
    const onTrack = R_TRACK - 3 * (u / uDrop);
    return p.rStart + (onTrack - p.rStart) * easeOutQuad(lift);
  }
  const v = (u - uDrop) / (1 - uDrop);
  const fallShare = 0.22;
  if (v < fallShare) {
    const from = R_TRACK - 3;
    // Spiral down past the deflectors, accelerating.
    return from + (R_POCKET - from) * easeInQuad(v / fallShare);
  }
  // Bounces over the frets with decaying height.
  let w = ((v - fallShare) / (1 - fallShare)) * BOUNCE_TOTAL;
  for (let i = 0; i < BOUNCES.length; i++) {
    const [h, d] = BOUNCES[i];
    if (w <= d) {
      if (p.bounceIdx < i) {
        p.bounceIdx = i;
        if (i === 0) playSound('ballDrop');
        else playSound('wheelTick', { pitch: 0.7 });
      }
      const s = w / d;
      return R_POCKET + h * 4 * s * (1 - s);
    }
    w -= d;
  }
  return R_POCKET;
}
