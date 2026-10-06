import { describe, it, expect } from 'vitest';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import {
  CRASH_SALT,
  crashPayout,
  crashPoint,
  crashPointFromHash,
  crashTier,
  crashTimeMs,
  isBeforeCrash,
  multiplierAt,
  multiplierX100At,
  timeForMultiplier,
} from '@/engines/crash/crash-math';
import { verifyCrash } from '@/engines/crash/verify';

const nodePoint = (seed: string, salt: string) => crashPointFromHash(createHmac('sha256', seed).update(salt).digest('hex'));

describe('crash point', () => {
  it('maps hash extremes correctly', () => {
    // h = 0 → floor(99·2^52 / 2^52) = 99 → clamped to 1.00×
    expect(crashPointFromHash('0000000000000' + 'f'.repeat(51))).toBe(100);
    // h = 2^51 (r = 0.5) → 99 / 0.5 = 1.98×
    expect(crashPointFromHash('8000000000000')).toBe(198);
    // r = 0.99 → ≈ 99×
    const h99 = (BigInt(2) ** 52n * 99n) / 100n;
    expect(crashPointFromHash(h99.toString(16).padStart(13, '0'))).toBeGreaterThanOrEqual(9899);
    // Largest h → huge, but finite
    expect(crashPointFromHash('fffffffffffff')).toBe(Math.floor((99 * 2 ** 52) / 1));
  });

  it('known vectors are stable', () => {
    const seed = '0'.repeat(64);
    const hex = createHmac('sha256', seed).update(CRASH_SALT).digest('hex');
    const expected = Number((99n * 2n ** 52n) / (2n ** 52n - BigInt('0x' + hex.slice(0, 13))));
    expect(crashPoint(seed, CRASH_SALT)).toBe(Math.max(100, expected));
    expect(crashPoint('nova', 'nova-launch-v1')).toBe(nodePoint('nova', 'nova-launch-v1'));
  });

  it('pure-JS HMAC agrees with node:crypto on 2,000 random seeds', () => {
    for (let i = 0; i < 2_000; i++) {
      const seed = randomBytes(32).toString('hex');
      expect(crashPoint(seed, CRASH_SALT)).toBe(nodePoint(seed, CRASH_SALT));
    }
  });

  it('distribution: P(≥2×) ≈ 0.495, P(≥10×) ≈ 0.099, P(1.00×) ≈ 1.98% (1 − 0.99/1.01)', () => {
    const N = 200_000;
    let ge2 = 0;
    let ge10 = 0;
    let instant = 0;
    for (let i = 0; i < N; i++) {
      const p = nodePoint(randomBytes(16).toString('hex'), CRASH_SALT);
      if (p >= 200) ge2++;
      if (p >= 1000) ge10++;
      if (p === 100) instant++;
    }
    expect(ge2 / N).toBeGreaterThan(0.495 - 0.006);
    expect(ge2 / N).toBeLessThan(0.495 + 0.006);
    expect(ge10 / N).toBeGreaterThan(0.099 - 0.004);
    expect(ge10 / N).toBeLessThan(0.099 + 0.004);
    expect(instant / N).toBeGreaterThan(0.0198 - 0.002);
    expect(instant / N).toBeLessThan(0.0198 + 0.002);
  });
});

describe('growth curve', () => {
  it('multiplier and time are inverses', () => {
    for (const x of [101, 150, 200, 231, 1000, 5000, 100_000]) {
      const t = timeForMultiplier(x);
      expect(multiplierAt(t) * 100).toBeCloseTo(x, 6);
    }
    expect(multiplierX100At(0)).toBe(100);
    expect(timeForMultiplier(200)).toBeCloseTo(Math.log(2) / 0.00006, 6);
  });

  it('is monotonic', () => {
    let prev = 0;
    for (let t = 0; t < 120_000; t += 37) {
      const m = multiplierX100At(t);
      expect(m).toBeGreaterThanOrEqual(prev);
      prev = m;
    }
  });

  it('isBeforeCrash: ties at the crash point lose', () => {
    const cp = 245;
    const tc = timeForMultiplier(cp);
    expect(isBeforeCrash(tc - 50, cp)).toBe(true);
    expect(isBeforeCrash(tc, cp)).toBe(false);
    expect(isBeforeCrash(tc + 1, cp)).toBe(false);
    expect(isBeforeCrash(0, 100)).toBe(false); // instant crash
    expect(isBeforeCrash(-1, 300)).toBe(false);
    expect(crashTimeMs(1_000, 200)).toBeCloseTo(1_000 + timeForMultiplier(200), 6);
  });

  it('payout floors with integer math', () => {
    expect(crashPayout(1_000n, 231)).toBe(2_310n);
    expect(crashPayout(333n, 150)).toBe(499n);
    expect(crashPayout(1n, 199)).toBe(1n);
  });

  it('tiers', () => {
    expect(crashTier(112)).toBe('low');
    expect(crashTier(200)).toBe('mid');
    expect(crashTier(1000)).toBe('high');
  });
});

describe('verifyCrash', () => {
  it('re-derives crash point and seed hash', () => {
    const seed = randomBytes(32).toString('hex');
    const v = verifyCrash(seed, CRASH_SALT);
    expect(v.seedHash).toBe(createHash('sha256').update(seed).digest('hex'));
    expect(v.crashPointX100).toBe(nodePoint(seed, CRASH_SALT));
  });
});
