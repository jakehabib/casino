'use client';

/**
 * AudioManager — synthesised, asset-free sound design via the Web Audio API.
 *
 * Categories: ui, game, win, ambient. Each routes through its own gain node
 * into a master gain. Nothing plays until the user has interacted with the
 * page (browser autoplay policy) and ambient audio is never started
 * automatically. Preferences persist in localStorage.
 */
export type SoundCategory = 'ui' | 'game' | 'win' | 'ambient';

export type SoundName =
  | 'click'
  | 'hover'
  | 'toggle'
  | 'chip'
  | 'chipStack'
  | 'cardDeal'
  | 'cardFlip'
  | 'cardSlide'
  | 'win'
  | 'bigWin'
  | 'blackjack'
  | 'loss'
  | 'push'
  | 'notify'
  | 'reelStart'
  | 'reelStop'
  | 'reelTick'
  | 'anticipation'
  | 'cascade'
  | 'scatter'
  | 'bonus'
  | 'wheelTick'
  | 'ballDrop'
  | 'launch'
  | 'cashout'
  | 'crash'
  | 'countdown'
  | 'error'
  | 'message';

export interface AudioPrefs {
  muted: boolean;
  master: number; // 0..1
  game: number;
  ui: number;
  win: number;
  ambient: number;
}

export const DEFAULT_PREFS: AudioPrefs = { muted: false, master: 0.7, game: 0.8, ui: 0.5, win: 0.8, ambient: 0.3 };
const STORAGE_KEY = 'nova.audio.v1';

const CATEGORY: Record<SoundName, SoundCategory> = {
  click: 'ui', hover: 'ui', toggle: 'ui', notify: 'ui', error: 'ui', message: 'ui',
  chip: 'game', chipStack: 'game', cardDeal: 'game', cardFlip: 'game', cardSlide: 'game',
  reelStart: 'game', reelStop: 'game', reelTick: 'game', anticipation: 'game', cascade: 'game',
  wheelTick: 'game', ballDrop: 'game', launch: 'game', countdown: 'game', crash: 'game',
  win: 'win', bigWin: 'win', blackjack: 'win', loss: 'game', push: 'game', scatter: 'win', bonus: 'win', cashout: 'win',
};

class AudioManagerImpl {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Partial<Record<SoundCategory, GainNode>> = {};
  private noiseBuf: AudioBuffer | null = null;
  private unlocked = false;
  private listeners = new Set<(p: AudioPrefs) => void>();
  private lastPlayed = new Map<SoundName, number>();
  prefs: AudioPrefs = DEFAULT_PREFS;

  constructor() {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) this.prefs = { ...DEFAULT_PREFS, ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
    const unlock = () => {
      this.unlocked = true;
      this.ensure();
      void this.ctx?.resume();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private ensure() {
    if (this.ctx || typeof window === 'undefined') return;
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    // Gentle bus compression keeps stacked effects tasteful.
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    for (const c of ['ui', 'game', 'win', 'ambient'] as SoundCategory[]) {
      const g = this.ctx.createGain();
      g.connect(this.master);
      this.buses[c] = g;
    }
    const len = this.ctx.sampleRate * 0.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; // audio texture only, not game RNG
    this.applyGains();
  }

  private applyGains() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.prefs.muted ? 0 : this.prefs.master, t, 0.02);
    for (const c of Object.keys(this.buses) as SoundCategory[]) {
      this.buses[c]!.gain.setTargetAtTime(this.prefs[c], t, 0.02);
    }
  }

  setPrefs(patch: Partial<AudioPrefs>) {
    this.prefs = { ...this.prefs, ...patch };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.prefs));
    } catch {
      /* ignore */
    }
    this.applyGains();
    this.listeners.forEach((l) => l(this.prefs));
  }

  subscribe(fn: (p: AudioPrefs) => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  // ── synthesis primitives ─────────────────────────────────
  private tone(bus: GainNode, freq: number, start: number, dur: number, opts: { type?: OscillatorType; gain?: number; attack?: number; endFreq?: number; detune?: number } = {}) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, start);
    if (opts.endFreq) osc.frequency.exponentialRampToValueAtTime(opts.endFreq, start + dur);
    if (opts.detune) osc.detune.value = opts.detune;
    const peak = opts.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + (opts.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g).connect(bus);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  private noise(bus: GainNode, start: number, dur: number, opts: { freq?: number; q?: number; gain?: number; type?: BiquadFilterType; sweepTo?: number } = {}) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.frequency.setValueAtTime(opts.freq ?? 2000, start);
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, start + dur);
    f.Q.value = opts.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.2, start + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(start);
    src.stop(start + dur + 0.02);
  }

  play(name: SoundName, opts: { pitch?: number; delay?: number } = {}) {
    if (!this.unlocked || this.prefs.muted) return;
    this.ensure();
    if (!this.ctx) return;
    // Throttle identical sounds (prevents harsh stacking on fast loops).
    const now = performance.now();
    const minGap = name === 'reelTick' || name === 'wheelTick' ? 28 : 18;
    if (now - (this.lastPlayed.get(name) ?? 0) < minGap) return;
    this.lastPlayed.set(name, now);

    const bus = this.buses[CATEGORY[name]]!;
    const t = this.ctx.currentTime + (opts.delay ?? 0);
    const p = opts.pitch ?? 1;
    switch (name) {
      case 'click':
        this.tone(bus, 1800 * p, t, 0.04, { type: 'triangle', gain: 0.08 });
        break;
      case 'hover':
        this.tone(bus, 2400 * p, t, 0.025, { type: 'sine', gain: 0.025 });
        break;
      case 'toggle':
        this.tone(bus, 900 * p, t, 0.05, { type: 'triangle', gain: 0.08 });
        this.tone(bus, 1350 * p, t + 0.04, 0.05, { type: 'triangle', gain: 0.07 });
        break;
      case 'chip':
        this.tone(bus, 3200 * p, t, 0.05, { type: 'square', gain: 0.03 });
        this.tone(bus, 4700 * p, t + 0.004, 0.08, { type: 'sine', gain: 0.06 });
        this.noise(bus, t, 0.03, { freq: 5000, q: 3, gain: 0.08 });
        break;
      case 'chipStack':
        for (let i = 0; i < 4; i++) {
          this.tone(bus, (3000 + i * 260) * p, t + i * 0.035, 0.05, { type: 'sine', gain: 0.05 });
          this.noise(bus, t + i * 0.035, 0.025, { freq: 5200, q: 3, gain: 0.06 });
        }
        break;
      case 'cardDeal':
        this.noise(bus, t, 0.09, { freq: 3200, sweepTo: 1200, q: 0.8, gain: 0.14 });
        break;
      case 'cardSlide':
        this.noise(bus, t, 0.14, { freq: 1800, sweepTo: 900, q: 0.6, gain: 0.09 });
        break;
      case 'cardFlip':
        this.noise(bus, t, 0.05, { freq: 2600, q: 1.4, gain: 0.12 });
        this.noise(bus, t + 0.05, 0.04, { freq: 1600, q: 1.2, gain: 0.08 });
        break;
      case 'win':
        [0, 4, 7].forEach((semi, i) => this.tone(bus, 523.25 * Math.pow(2, semi / 12) * p, t + i * 0.07, 0.35, { type: 'triangle', gain: 0.09 }));
        break;
      case 'bigWin':
        [0, 4, 7, 12, 16].forEach((semi, i) => this.tone(bus, 523.25 * Math.pow(2, semi / 12), t + i * 0.09, 0.6, { type: 'triangle', gain: 0.1 }));
        this.tone(bus, 1046.5, t + 0.45, 0.9, { type: 'sine', gain: 0.06 });
        break;
      case 'blackjack':
        [0, 7, 12, 16, 19].forEach((semi, i) => this.tone(bus, 440 * Math.pow(2, semi / 12), t + i * 0.06, 0.5, { type: 'triangle', gain: 0.09 }));
        break;
      case 'loss':
        this.tone(bus, 220 * p, t, 0.25, { type: 'sine', gain: 0.06, endFreq: 180 });
        break;
      case 'push':
        this.tone(bus, 440, t, 0.18, { type: 'sine', gain: 0.05 });
        break;
      case 'notify':
        this.tone(bus, 880, t, 0.12, { type: 'sine', gain: 0.06 });
        this.tone(bus, 1320, t + 0.08, 0.16, { type: 'sine', gain: 0.05 });
        break;
      case 'message':
        this.tone(bus, 1100, t, 0.06, { type: 'sine', gain: 0.035 });
        break;
      case 'error':
        this.tone(bus, 260, t, 0.12, { type: 'triangle', gain: 0.07 });
        this.tone(bus, 200, t + 0.09, 0.14, { type: 'triangle', gain: 0.06 });
        break;
      case 'reelStart':
        this.noise(bus, t, 0.25, { freq: 400, sweepTo: 1400, q: 0.7, gain: 0.08 });
        break;
      case 'reelStop':
        this.tone(bus, 140 * p, t, 0.09, { type: 'sine', gain: 0.18, endFreq: 70 });
        this.noise(bus, t, 0.04, { freq: 2200, q: 1, gain: 0.07 });
        break;
      case 'reelTick':
        this.noise(bus, t, 0.02, { freq: 3000 * p, q: 2, gain: 0.04 });
        break;
      case 'anticipation':
        this.tone(bus, 220, t, 1.2, { type: 'sawtooth', gain: 0.025, endFreq: 440, attack: 0.3 });
        break;
      case 'cascade':
        this.tone(bus, 660 * p, t, 0.15, { type: 'triangle', gain: 0.07, endFreq: 990 * p });
        this.noise(bus, t, 0.12, { freq: 4000, q: 1, gain: 0.04 });
        break;
      case 'scatter':
        this.tone(bus, 1318 * p, t, 0.3, { type: 'sine', gain: 0.08 });
        this.tone(bus, 1975 * p, t + 0.03, 0.4, { type: 'sine', gain: 0.05 });
        break;
      case 'bonus':
        [0, 3, 7, 10, 12, 15, 19, 24].forEach((semi, i) => this.tone(bus, 392 * Math.pow(2, semi / 12), t + i * 0.07, 0.5, { type: 'triangle', gain: 0.08 }));
        break;
      case 'wheelTick':
        this.noise(bus, t, 0.015, { freq: 4200 * p, q: 4, gain: 0.05 });
        break;
      case 'ballDrop':
        this.tone(bus, 1900, t, 0.05, { type: 'sine', gain: 0.07 });
        this.tone(bus, 1500, t + 0.09, 0.05, { type: 'sine', gain: 0.05 });
        this.tone(bus, 1700, t + 0.16, 0.06, { type: 'sine', gain: 0.04 });
        break;
      case 'launch':
        this.noise(bus, t, 1.4, { type: 'lowpass', freq: 200, sweepTo: 1600, q: 0.5, gain: 0.12 });
        break;
      case 'cashout':
        this.tone(bus, 987.77, t, 0.12, { type: 'triangle', gain: 0.09 });
        this.tone(bus, 1318.5, t + 0.07, 0.25, { type: 'triangle', gain: 0.08 });
        break;
      case 'crash':
        this.noise(bus, t, 0.6, { type: 'lowpass', freq: 900, sweepTo: 80, q: 0.7, gain: 0.2 });
        this.tone(bus, 120, t, 0.5, { type: 'sine', gain: 0.12, endFreq: 40 });
        break;
      case 'countdown':
        this.tone(bus, 740 * p, t, 0.08, { type: 'sine', gain: 0.05 });
        break;
    }
  }
}

const g = globalThis as unknown as { __novaAudio?: AudioManagerImpl };
export const AudioManager: AudioManagerImpl =
  typeof window === 'undefined' ? (new (class { play() {} setPrefs() {} subscribe() { return () => {}; } prefs = DEFAULT_PREFS })() as unknown as AudioManagerImpl) : (g.__novaAudio ??= new AudioManagerImpl());

export const playSound = (name: SoundName, opts?: { pitch?: number; delay?: number }) => AudioManager.play(name, opts);
