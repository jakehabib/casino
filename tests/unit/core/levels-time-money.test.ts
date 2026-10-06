import { describe, it, expect } from 'vitest';
import { levelFromLifetimeXp, lifetimeXpForLevel, xpForWager, tierForLevel, MAX_LEVEL } from '@/lib/levels';
import { localDateKey, nextLocalMidnight } from '@/lib/time';
import { toNum, toBig, mulDiv } from '@/lib/money';

describe('levels', () => {
  it('derives level from lifetime XP at boundaries', () => {
    expect(levelFromLifetimeXp(0).level).toBe(1);
    expect(levelFromLifetimeXp(lifetimeXpForLevel(2) - 1).level).toBe(1);
    expect(levelFromLifetimeXp(lifetimeXpForLevel(2)).level).toBe(2);
    expect(levelFromLifetimeXp(lifetimeXpForLevel(50)).level).toBe(50);
    expect(levelFromLifetimeXp(Number.MAX_SAFE_INTEGER).level).toBe(MAX_LEVEL);
  });
  it('awards XP for wagering regardless of outcome', () => {
    expect(xpForWager(1_000)).toBe(100n);
    expect(xpForWager(9)).toBe(0n);
  });
  it('maps tiers', () => {
    expect([1, 9, 10, 24, 25, 49, 50, 74, 75, 99, 100].map(tierForLevel)).toEqual([
      'neutral', 'neutral', 'bronze', 'bronze', 'silver', 'silver', 'gold', 'gold', 'platinum', 'platinum', 'prestige',
    ]);
  });
});

describe('timezone day boundaries', () => {
  it('computes local date keys', () => {
    const at = new Date('2026-10-06T23:30:00Z');
    expect(localDateKey('UTC', at)).toBe('2026-10-06');
    expect(localDateKey('Asia/Tokyo', at)).toBe('2026-10-07');
    expect(localDateKey('America/Los_Angeles', at)).toBe('2026-10-06');
  });
  it('finds the next local midnight', () => {
    const at = new Date('2026-10-06T23:30:00Z');
    expect(nextLocalMidnight('UTC', at).toISOString()).toBe('2026-10-07T00:00:00.000Z');
    expect(nextLocalMidnight('Asia/Tokyo', at).toISOString()).toBe('2026-10-07T15:00:00.000Z');
    expect(nextLocalMidnight('America/New_York', at).toISOString()).toBe('2026-10-07T04:00:00.000Z');
  });
  it('handles DST transitions', () => {
    // US DST ends 2026-11-01 at 02:00 local; midnight of Nov 2 is UTC-5
    const at = new Date('2026-11-01T12:00:00Z');
    expect(nextLocalMidnight('America/New_York', at).toISOString()).toBe('2026-11-02T05:00:00.000Z');
  });
});

describe('money', () => {
  it('converts safely', () => {
    expect(toNum(123n)).toBe(123);
    expect(() => toBig(1.5)).toThrow();
    expect(() => toNum(2n ** 60n)).toThrow();
    expect(mulDiv(1_001n, 95n, 100n)).toBe(950n);
  });
});
