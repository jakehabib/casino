import { CRASH_GROWTH_K, multiplierAt, timeForMultiplier } from '@/engines/crash/crash-math';

/**
 * Canvas renderer for the Launch stage. Pure drawing — it is fed a frame
 * description each rAF by <CrashStage/> and owns only cosmetic state (view
 * scale easing, starfield, particles). Nothing here decides outcomes.
 */

export type Phase = 'idle' | 'waiting' | 'locked' | 'running' | 'crashed';

export interface FrameInput {
  phase: Phase;
  /** ms since launch (running/crashed). */
  elapsed: number;
  /** current multiplier (×1). */
  m: number;
  marks: { at: number; mine: boolean; label?: string }[];
  reducedMotion: boolean;
  roundId: string | null;
}

const C = {
  grid: 'rgba(255,255,255,0.045)',
  gridStrong: 'rgba(255,255,255,0.08)',
  label: 'rgba(160,166,179,0.75)',
  accent: [124, 92, 255] as const,
  accentHi: [169, 147, 255] as const,
  gold: [245, 213, 137] as const,
  loss: [232, 106, 106] as const,
  win: [61, 220, 151] as const,
};

type RGB = readonly [number, number, number];
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const mix = (a: RGB, b: RGB, t: number): RGB => {
  const k = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
};

/** Curve colour by height: violet → bright violet → gold above 10×. */
export function curveColor(m: number): RGB {
  if (m < 2) return C.accent;
  if (m < 10) return mix(C.accent, C.accentHi, (m - 2) / 4);
  return mix(C.accentHi, C.gold, Math.min(1, (m - 10) / 6));
}

const Y_STEPS = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
const X_STEPS = [1, 2, 5, 10, 15, 20, 30, 60, 120, 300, 600];

function niceStep(range: number, steps: number[], target: number) {
  for (const s of steps) if (range / s <= target) return s;
  return steps[steps.length - 1];
}

function axisLabel(v: number, step: number) {
  if (step >= 1) return Math.round(v).toLocaleString('en-US');
  const s = v.toFixed(step < 0.25 ? 1 : 2);
  return s.replace(/0+$/, '').replace(/\.$/, '.0');
}

interface Star {
  x: number;
  y: number;
  z: number; // depth 0.2..1
  tw: number; // twinkle phase
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  hot: boolean;
}

export class CrashRenderer {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private stars: Star[] = [];
  private particles: Particle[] = [];
  private viewT = 8_000;
  private viewM = 2;
  private lastNow = 0;
  private roundId: string | null = null;
  private crashFx: { x: number; y: number; at: number } | null = null;
  private lastPhase: Phase = 'idle';
  private tip = { x: 0, y: 0, angle: -0.6 };

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    for (let i = 0; i < 140; i++) {
      this.stars.push({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8, tw: Math.random() * Math.PI * 2 });
    }
  }

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  /** Plot rectangle (labels live in the right/bottom gutters). */
  private get plot() {
    const compact = this.w < 520;
    const left = compact ? 12 : 20;
    const right = this.w - (compact ? 42 : 58);
    const top = compact ? 52 : 64;
    const bottom = this.h - (compact ? 26 : 32);
    return { left, right, top, bottom, width: right - left, height: bottom - top };
  }

  private px(t: number, m: number) {
    const p = this.plot;
    return {
      x: p.left + (t / this.viewT) * p.width,
      y: p.bottom - ((m - 1) / (this.viewM - 1)) * p.height,
    };
  }

  /** Screen position of a multiplier on the current curve (for DOM overlays). */
  pointFor(m: number) {
    return this.px(timeForMultiplier(Math.round(m * 100)), m);
  }

  get tipPosition() {
    return this.tip;
  }

  draw(f: FrameInput, now: number) {
    const dt = this.lastNow ? Math.min(64, now - this.lastNow) : 16;
    this.lastNow = now;
    if (f.roundId !== this.roundId) {
      this.roundId = f.roundId;
      if (f.phase === 'waiting' || f.phase === 'locked' || f.phase === 'idle') {
        this.viewT = 8_000;
        this.viewM = 2;
      }
      if (f.phase !== 'crashed') this.crashFx = null;
    }

    // ── View scale: ease toward targets so the axes rescale smoothly ──
    if (f.phase === 'running' || f.phase === 'crashed') {
      const targetT = Math.max(8_000, f.elapsed / 0.8);
      const targetM = Math.max(2, 1 + (f.m - 1) / 0.72);
      const k = f.reducedMotion ? 1 : 1 - Math.exp(-dt / 160);
      if (f.phase === 'running' || this.lastPhase !== 'crashed') {
        this.viewT += (Math.max(targetT, this.viewT) - this.viewT) * k;
        this.viewM += (Math.max(targetM, this.viewM) - this.viewM) * k;
        // Never let the tip leave the plot even before the ease catches up.
        this.viewT = Math.max(this.viewT, f.elapsed / 0.94);
        this.viewM = Math.max(this.viewM, 1 + (f.m - 1) / 0.92);
      }
    } else {
      const k = f.reducedMotion ? 1 : 1 - Math.exp(-dt / 260);
      this.viewT += (8_000 - this.viewT) * k;
      this.viewM += (2 - this.viewM) * k;
    }

    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    this.drawBackdrop(f, dt, now);
    this.drawGrid();

    if (f.phase === 'running' || f.phase === 'crashed') {
      this.drawCurve(f);
      this.drawMarks(f);
      if (f.phase === 'running') this.drawRocket(this.tip.x, this.tip.y, this.tip.angle, now, f.reducedMotion, f.m);
    } else {
      // Parked on the pad at the origin.
      const o = this.px(0, 1);
      this.tip = { x: o.x + 22, y: o.y - 18, angle: -0.62 };
      this.drawRocket(o.x + 22, o.y - 18, -0.62, now, f.reducedMotion, 1, f.phase === 'locked' ? 0.9 : 0.35);
    }

    if (f.phase === 'crashed' && this.lastPhase === 'running' && !this.crashFx) this.explode(f.reducedMotion);
    if (f.phase === 'crashed' && !this.crashFx && this.lastPhase !== 'running') {
      // Joined after the crash: no burst, just the wreck point.
      this.crashFx = { x: this.tip.x, y: this.tip.y, at: now - 10_000 };
    }
    this.drawParticles(dt, now);
    this.lastPhase = f.phase;
  }

  private drawBackdrop(f: FrameInput, dt: number, now: number) {
    const { ctx, w, h } = this;
    const g = ctx.createRadialGradient(w * 0.72, h * 0.1, 0, w * 0.72, h * 0.1, Math.max(w, h) * 0.9);
    const glow = f.phase === 'crashed' ? C.loss : curveColor(f.m);
    g.addColorStop(0, rgba(glow, f.phase === 'running' ? 0.09 + Math.min(0.06, (f.m - 1) * 0.01) : 0.05));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Parallax starfield — drift speed follows the curve's growth rate.
    const rate = f.phase === 'running' ? CRASH_GROWTH_K * f.m * 1000 : 0; // ×/s
    const speed = f.reducedMotion ? 0 : (f.phase === 'running' ? 0.018 + Math.min(0.5, rate * 0.9) : 0.006) * (dt / 1000);
    for (const s of this.stars) {
      s.x -= speed * s.z * 1.0;
      s.y += speed * s.z * 0.45;
      if (s.x < 0) s.x += 1;
      if (s.y > 1) s.y -= 1;
      const tw = f.reducedMotion ? 1 : 0.7 + 0.3 * Math.sin(now / 900 + s.tw);
      const a = (0.12 + s.z * 0.45) * tw;
      const r = 0.35 + s.z * 0.9;
      const streak = f.phase === 'running' && !f.reducedMotion ? Math.min(14, rate * 18 * s.z) : 0;
      ctx.fillStyle = `rgba(214,220,255,${a})`;
      if (streak > 1.2) {
        ctx.strokeStyle = `rgba(214,220,255,${a * 0.8})`;
        ctx.lineWidth = r;
        ctx.beginPath();
        ctx.moveTo(s.x * w, s.y * h);
        ctx.lineTo(s.x * w + streak, s.y * h - streak * 0.45);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawGrid() {
    const { ctx } = this;
    const p = this.plot;
    const compact = this.w < 520;
    ctx.font = `500 ${compact ? 10 : 11}px ${getComputedStyle(this.canvas).fontFamily || 'ui-sans-serif'}`;
    ctx.textBaseline = 'middle';

    // Horizontal (multiplier) lines
    const yStep = niceStep(this.viewM - 1, Y_STEPS, compact ? 4 : 5);
    ctx.textAlign = 'left';
    for (let v = 1; v <= this.viewM + 1e-9; v += yStep) {
      const { y } = this.px(0, v);
      if (y < p.top - 6) break;
      ctx.strokeStyle = v === 1 ? C.gridStrong : C.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.left, Math.round(y) + 0.5);
      ctx.lineTo(p.right, Math.round(y) + 0.5);
      ctx.stroke();
      ctx.fillStyle = C.label;
      ctx.fillText(`${axisLabel(v, yStep)}×`, p.right + 8, y);
    }

    // Vertical (time) lines
    const secs = this.viewT / 1000;
    const xStep = niceStep(secs, X_STEPS, compact ? 4 : 7);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let s = 0; s <= secs + 1e-9; s += xStep) {
      const { x } = this.px(s * 1000, 1);
      ctx.strokeStyle = s === 0 ? C.gridStrong : C.grid;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, p.top);
      ctx.lineTo(Math.round(x) + 0.5, p.bottom);
      ctx.stroke();
      if (s > 0) {
        ctx.fillStyle = C.label;
        ctx.fillText(`${s}s`, x, p.bottom + 8);
      }
    }
  }

  private drawCurve(f: FrameInput) {
    const { ctx } = this;
    const p = this.plot;
    const crashed = f.phase === 'crashed';
    const end = f.elapsed;
    const n = Math.max(24, Math.min(160, Math.round(p.width / 5)));
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= n; i++) {
      const t = (end * i) / n;
      pts.push(this.px(t, multiplierAt(t)));
    }
    const last = pts[pts.length - 1];
    const prev = pts[Math.max(0, pts.length - 3)];
    const angle = Math.atan2(last.y - prev.y, last.x - prev.x || 0.0001);
    this.tip = { x: last.x, y: last.y, angle: pts.length > 2 ? angle : -0.25 };

    const col: RGB = crashed ? C.loss : curveColor(f.m);
    // Area fill
    const fill = ctx.createLinearGradient(0, last.y, 0, p.bottom);
    fill.addColorStop(0, rgba(col, crashed ? 0.14 : 0.26));
    fill.addColorStop(1, rgba(col, 0));
    ctx.beginPath();
    ctx.moveTo(pts[0].x, p.bottom);
    for (const q of pts) ctx.lineTo(q.x, q.y);
    ctx.lineTo(last.x, p.bottom);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();

    // Stroke with glow
    const stroke = ctx.createLinearGradient(pts[0].x, pts[0].y, last.x, last.y);
    stroke.addColorStop(0, rgba(crashed ? C.loss : C.accent, crashed ? 0.45 : 0.55));
    stroke.addColorStop(1, rgba(col, crashed ? 0.8 : 1));
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = rgba(col, crashed ? 0.25 : 0.65);
    ctx.shadowBlur = crashed ? 6 : 16;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = this.w < 520 ? 3 : 3.5;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const q of pts) ctx.lineTo(q.x, q.y);
    ctx.stroke();
    ctx.restore();
  }

  private drawMarks(f: FrameInput) {
    const { ctx } = this;
    for (const mk of f.marks) {
      const t = timeForMultiplier(mk.at);
      if (t > f.elapsed + 1) continue;
      const { x, y } = this.px(t, mk.at / 100);
      if (mk.mine) {
        ctx.save();
        ctx.shadowColor = rgba(C.win, 0.7);
        ctx.shadowBlur = 10;
        ctx.fillStyle = rgba(C.win, 1);
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = 'rgba(10,11,14,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.stroke();
        if (mk.label) {
          ctx.font = `600 11px ${getComputedStyle(this.canvas).fontFamily || 'ui-sans-serif'}`;
          const tw = ctx.measureText(mk.label).width;
          // Below-right of the dot: the area under the curve stays clear of the read-out.
          const bx = Math.min(x + 9, this.plot.right - tw - 14);
          const by = Math.min(y + 6, this.plot.bottom - 24);
          ctx.fillStyle = 'rgba(13,32,24,0.92)';
          ctx.strokeStyle = rgba(C.win, 0.5);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(bx, by, tw + 14, 20, 6);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = rgba(C.win, 1);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(mk.label, bx + 7, by + 10.5);
        }
      } else {
        ctx.fillStyle = 'rgba(236,238,242,0.55)';
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawRocket(x: number, y: number, angle: number, now: number, reduced: boolean, m: number, flame = 1) {
    const { ctx } = this;
    const s = this.w < 520 ? 0.78 : 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(s, s);

    // Exhaust (behind the body, pointing back along -x)
    const flick = reduced ? 1 : 0.82 + 0.18 * Math.sin(now / 37) * Math.sin(now / 53 + 1.3);
    const len = (16 + Math.min(18, (m - 1) * 3)) * flick * flame;
    if (flame > 0) {
      const fg = ctx.createLinearGradient(-14, 0, -14 - len, 0);
      fg.addColorStop(0, 'rgba(255,244,214,0.95)');
      fg.addColorStop(0.35, 'rgba(255,170,90,0.75)');
      fg.addColorStop(1, 'rgba(124,92,255,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(-12, -4.2);
      ctx.quadraticCurveTo(-14 - len * 0.55, -3.2, -14 - len, 0);
      ctx.quadraticCurveTo(-14 - len * 0.55, 3.2, -12, 4.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.ellipse(-13.5, 0, 2.6, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fins
    ctx.fillStyle = '#5b44d6';
    ctx.beginPath();
    ctx.moveTo(-6, -5);
    ctx.lineTo(-13, -11);
    ctx.lineTo(-12, -4);
    ctx.closePath();
    ctx.moveTo(-6, 5);
    ctx.lineTo(-13, 11);
    ctx.lineTo(-12, 4);
    ctx.closePath();
    ctx.fill();

    // Body
    const body = ctx.createLinearGradient(0, -6, 0, 6);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.55, '#d9dcef');
    body.addColorStop(1, '#8f93ad');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.bezierCurveTo(11, -6.2, 2, -6.4, -12, -5);
    ctx.lineTo(-12, 5);
    ctx.bezierCurveTo(2, 6.4, 11, 6.2, 15, 0);
    ctx.closePath();
    ctx.fill();

    // Nose band + window
    ctx.fillStyle = '#7c5cff';
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.bezierCurveTo(13.4, -2.9, 11.6, -4.4, 9.6, -5.2);
    ctx.lineTo(9.6, 5.2);
    ctx.bezierCurveTo(11.6, 4.4, 13.4, 2.9, 15, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1b1f2a';
    ctx.beginPath();
    ctx.arc(3.2, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(169,147,255,0.9)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.restore();
  }

  private explode(reduced: boolean) {
    const { x, y } = this.tip;
    this.crashFx = { x, y, at: this.lastNow };
    if (reduced) return;
    const n = this.w < 520 ? 26 : 38;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 170;
      const hot = i % 3 !== 0;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 30,
        life: 0,
        max: 600 + Math.random() * 600,
        size: hot ? 1.2 + Math.random() * 1.8 : 2 + Math.random() * 2.5,
        hot,
      });
    }
  }

  private drawParticles(dt: number, now: number) {
    const { ctx } = this;
    if (this.crashFx) {
      const age = now - this.crashFx.at;
      if (age < 700) {
        const k = age / 700;
        ctx.strokeStyle = rgba(C.loss, 0.45 * (1 - k));
        ctx.lineWidth = 2 * (1 - k) + 0.5;
        ctx.beginPath();
        ctx.arc(this.crashFx.x, this.crashFx.y, 8 + k * 46, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Wreck marker
      ctx.fillStyle = rgba(C.loss, 0.9);
      ctx.beginPath();
      ctx.arc(this.crashFx.x, this.crashFx.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!this.particles.length) return;
    const s = dt / 1000;
    this.particles = this.particles.filter((p) => (p.life += dt) < p.max);
    for (const p of this.particles) {
      p.vx *= 0.985;
      p.vy = p.vy * 0.985 + 160 * s;
      p.x += p.vx * s;
      p.y += p.vy * s;
      const a = 1 - p.life / p.max;
      ctx.fillStyle = p.hot ? `rgba(255,${150 + Math.round(80 * a)},${90 + Math.round(60 * a)},${a})` : `rgba(160,166,190,${a * 0.8})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (p.hot ? 1 : 0.8 + 0.4 * (1 - a)), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
