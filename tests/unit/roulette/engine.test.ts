import { describe, it, expect } from 'vitest';
import { FairRng, FastRng, jsHmac } from '@/engines/fairness/rng';
import {
  BET_CATALOGUE,
  PAYOUT_ODDS,
  RED_NUMBERS,
  WHEEL_ORDER,
  colorOf,
  drawWinningNumber,
  getSpot,
  pocketIndex,
  resolveSpot,
  settle,
  validateBets,
  verifyRoulette,
  type BetInput,
  type BetType,
  type TableLimits,
} from '@/engines/roulette';
import { nodeHmac } from '@/server/services/fairness/seed-service';

const LIMITS: TableLimits = { minBet: 100, maxBet: 500_000, maxStraightBet: 50_000, maxOutsideBet: 250_000 };
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

function slip(...bets: BetInput[]) {
  const v = validateBets(bets, LIMITS);
  if (!v.ok) throw new Error(`invalid: ${JSON.stringify(v.error, (_, x) => (typeof x === 'bigint' ? String(x) : x))}`);
  return v.bets;
}

describe('wheel', () => {
  it('has the 37 European pockets in the correct order', () => {
    expect(WHEEL_ORDER).toHaveLength(37);
    expect(new Set(WHEEL_ORDER).size).toBe(37);
    expect(WHEEL_ORDER.slice(0, 5)).toEqual([0, 32, 15, 19, 4]);
    expect(WHEEL_ORDER[36]).toBe(26);
    expect(pocketIndex(26)).toBe(36);
  });

  it('colours: 18 red, 18 black, green zero, adjacent pockets alternate', () => {
    expect(RED_NUMBERS.size).toBe(18);
    expect(colorOf(0)).toBe('green');
    expect(colorOf(1)).toBe('red');
    expect(colorOf(2)).toBe('black');
    expect(colorOf(36)).toBe('red');
    for (let i = 1; i < 36; i++) expect(colorOf(WHEEL_ORDER[i])).not.toBe(colorOf(WHEEL_ORDER[i + 1]));
  });
});

describe('winning number derivation', () => {
  it('is the first rng draw: floor(f0 * 37)', () => {
    const rng = new FairRng('server-seed', 'client', 7, jsHmac);
    const f0 = new FairRng('server-seed', 'client', 7, jsHmac).next();
    expect(drawWinningNumber(rng)).toBe(Math.floor(f0 * 37));
  });

  it('verifier matches the server (node HMAC) derivation', () => {
    for (let nonce = 0; nonce < 50; nonce++) {
      const server = drawWinningNumber(new FairRng('a'.repeat(64), 'my-seed', nonce, nodeHmac));
      expect(verifyRoulette('a'.repeat(64), 'my-seed', nonce)).toBe(server);
    }
  });

  it('is roughly uniform over 0..36', () => {
    const rng = new FastRng(42);
    const counts = new Array(37).fill(0);
    for (let i = 0; i < 74_000; i++) counts[drawWinningNumber(rng)]++;
    for (const c of counts) expect(Math.abs(c - 2000)).toBeLessThan(300);
  });
});

describe('bet catalogue', () => {
  const count = (t: BetType) => BET_CATALOGUE.filter((s) => s.type === t).length;
  it('enumerates every legal bet exactly once', () => {
    expect(count('STRAIGHT')).toBe(37);
    expect(count('SPLIT')).toBe(60);
    expect(count('STREET')).toBe(14);
    expect(count('CORNER')).toBe(23);
    expect(count('SIX_LINE')).toBe(11);
    expect(count('DOZEN')).toBe(3);
    expect(count('COLUMN')).toBe(3);
    expect(BET_CATALOGUE).toHaveLength(157);
    expect(new Set(BET_CATALOGUE.map((s) => s.id)).size).toBe(157);
  });

  it('resolves legal bets regardless of number order', () => {
    expect(resolveSpot('SPLIT', [2, 1])?.id).toBe('SPLIT:1-2');
    expect(resolveSpot('SPLIT', [17, 20])?.id).toBe('SPLIT:17-20');
    expect(resolveSpot('CORNER', [5, 1, 4, 2])?.id).toBe('CORNER:1-2-4-5');
    expect(resolveSpot('CORNER', [0, 1, 2, 3])?.label).toBe('First Four');
    expect(resolveSpot('STREET', [0, 2, 3])?.id).toBe('STREET:0-2-3');
    expect(resolveSpot('RED', [])?.id).toBe('RED');
    expect(resolveSpot('COLUMN', range(1, 36).filter((n) => n % 3 === 0))?.label).toBe('Column 3');
  });

  it('rejects geometrically illegal bets', () => {
    expect(resolveSpot('SPLIT', [1, 5])).toBeNull(); // not adjacent
    expect(resolveSpot('SPLIT', [3, 4])).toBeNull(); // different streets, not touching
    expect(resolveSpot('SPLIT', [0, 4])).toBeNull();
    expect(resolveSpot('SPLIT', [1, 1])).toBeNull();
    expect(resolveSpot('STREET', [2, 3, 4])).toBeNull();
    expect(resolveSpot('STREET', [0, 1, 3])).toBeNull();
    expect(resolveSpot('CORNER', [3, 4, 6, 7])).toBeNull(); // wraps across top/bottom
    expect(resolveSpot('CORNER', [0, 1, 2, 4])).toBeNull();
    expect(resolveSpot('SIX_LINE', range(2, 7))).toBeNull();
    expect(resolveSpot('STRAIGHT', [37])).toBeNull();
    expect(resolveSpot('STRAIGHT', [-1])).toBeNull();
    expect(resolveSpot('STRAIGHT', [1.5])).toBeNull();
    expect(resolveSpot('STRAIGHT', [1, 2])).toBeNull(); // right numbers, wrong type
    expect(resolveSpot('CORNER', [1, 2])).toBeNull();
    expect(resolveSpot('DOZEN', range(1, 11))).toBeNull();
    expect(resolveSpot('RED', [1, 2, 3])).toBeNull();
    expect(resolveSpot('ZERO_SPIEL', [0])).toBeNull();
    expect(resolveSpot('DOZEN', [])).toBeNull();
  });

  it('labels outside bets with correct coverage', () => {
    expect(getSpot('RED')!.numbers).toHaveLength(18);
    expect(getSpot('BLACK')!.numbers.every((n) => colorOf(n) === 'black')).toBe(true);
    expect(getSpot('LOW')!.numbers).toEqual(range(1, 18));
    expect(getSpot('HIGH')!.numbers).toEqual(range(19, 36));
    expect(getSpot('ODD')!.numbers.every((n) => n % 2 === 1)).toBe(true);
    expect(getSpot('EVEN')!.numbers).not.toContain(0);
  });
});

describe('settlement', () => {
  const single = (type: BetType, numbers: number[], amount: number, win: number) =>
    settle(slip({ type, numbers, amount }), win);

  it.each([
    ['STRAIGHT', [17], 17, 36],
    ['SPLIT', [17, 20], 20, 18],
    ['STREET', [16, 17, 18], 16, 12],
    ['CORNER', [16, 17, 19, 20], 19, 9],
    ['SIX_LINE', range(13, 18), 13, 6],
    ['DOZEN', range(13, 24), 24, 3],
    ['COLUMN', range(1, 36).filter((n) => n % 3 === 2), 35, 3],
    ['RED', [], 1, 2],
    ['BLACK', [], 2, 2],
    ['ODD', [], 3, 2],
    ['EVEN', [], 36, 2],
    ['LOW', [], 18, 2],
    ['HIGH', [], 19, 2],
  ] as [BetType, number[], number, number][])('%s pays %#: odds+1 multiple', (type, numbers, win, mult) => {
    const s = single(type, numbers, 1_000, win);
    expect(s.bets[0].won).toBe(true);
    expect(s.bets[0].payout).toBe(BigInt(1_000 * mult));
    expect(PAYOUT_ODDS[type] + 1).toBe(mult);
  });

  it('losing bets pay nothing', () => {
    expect(single('STRAIGHT', [17], 1_000, 18).totalPayout).toBe(0n);
    expect(single('RED', [], 1_000, 2).totalPayout).toBe(0n);
    expect(single('DOZEN', range(1, 12), 1_000, 13).totalPayout).toBe(0n);
  });

  it('zero: even-money, dozens and columns all lose; zero bets win', () => {
    for (const t of ['RED', 'BLACK', 'ODD', 'EVEN', 'LOW', 'HIGH'] as const) expect(single(t, [], 1_000, 0).totalPayout).toBe(0n);
    expect(single('DOZEN', range(1, 12), 1_000, 0).totalPayout).toBe(0n);
    expect(single('COLUMN', range(1, 36).filter((n) => n % 3 === 1), 1_000, 0).totalPayout).toBe(0n);
    expect(single('STRAIGHT', [0], 1_000, 0).totalPayout).toBe(36_000n);
    expect(single('SPLIT', [0, 2], 1_000, 0).totalPayout).toBe(18_000n);
    expect(single('STREET', [0, 1, 2], 1_000, 0).totalPayout).toBe(12_000n);
    expect(single('CORNER', [0, 1, 2, 3], 1_000, 0).totalPayout).toBe(9_000n);
  });

  it('settles multiple bets independently', () => {
    const bets = slip(
      { type: 'STRAIGHT', numbers: [7], amount: 500 },
      { type: 'RED', numbers: [], amount: 2_000 },
      { type: 'ODD', numbers: [], amount: 1_000 },
      { type: 'DOZEN', numbers: range(13, 24), amount: 1_000 },
      { type: 'SPLIT', numbers: [7, 8], amount: 300 },
    );
    const s = settle(bets, 7);
    expect(s.totalWagered).toBe(4_800n);
    // 500*36 + 2000*2 + 1000*2 + 0 + 300*18
    expect(s.totalPayout).toBe(18_000n + 4_000n + 2_000n + 5_400n);
    expect(s.bets.filter((b) => b.won)).toHaveLength(4);
  });

  it('payouts are exact integers for large stakes', () => {
    const s = single('STRAIGHT', [5], 50_000, 5);
    expect(s.totalPayout).toBe(1_800_000n);
  });
});

describe('validation & limits', () => {
  it('merges duplicate spots before checking per-spot limits', () => {
    const v = validateBets(
      [
        { type: 'STRAIGHT', numbers: [5], amount: 30_000 },
        { type: 'STRAIGHT', numbers: [5], amount: 30_000 },
      ],
      LIMITS,
    );
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error.code).toBe('BET_TOO_HIGH');
  });

  it('applies the inside limit to inside bets and the outside limit to outside bets', () => {
    expect(validateBets([{ type: 'SPLIT', numbers: [1, 2], amount: 50_001 }], LIMITS).ok).toBe(false);
    expect(validateBets([{ type: 'SPLIT', numbers: [1, 2], amount: 50_000 }], LIMITS).ok).toBe(true);
    expect(validateBets([{ type: 'RED', numbers: [], amount: 250_000 }], LIMITS).ok).toBe(true);
    expect(validateBets([{ type: 'RED', numbers: [], amount: 250_001 }], LIMITS).ok).toBe(false);
  });

  it('enforces min per spot and the table max', () => {
    const low = validateBets([{ type: 'RED', numbers: [], amount: 99 }], LIMITS);
    expect(!low.ok && low.error.code).toBe('BET_TOO_LOW');
    const table = validateBets(
      [
        { type: 'RED', numbers: [], amount: 250_000 },
        { type: 'ODD', numbers: [], amount: 250_000 },
        { type: 'LOW', numbers: [], amount: 100 },
      ],
      LIMITS,
    );
    expect(!table.ok && table.error.code).toBe('TABLE_MAX');
  });

  it('rejects empty slips, non-integer and non-positive amounts, illegal spots', () => {
    expect(validateBets([], LIMITS).ok).toBe(false);
    const frac = validateBets([{ type: 'RED', numbers: [], amount: 100.5 }], LIMITS);
    expect(!frac.ok && frac.error.code).toBe('INVALID_AMOUNT');
    const neg = validateBets([{ type: 'RED', numbers: [], amount: -100 }], LIMITS);
    expect(!neg.ok && neg.error.code).toBe('INVALID_AMOUNT');
    const illegal = validateBets([{ type: 'RED', numbers: [], amount: 100 }, { type: 'SPLIT', numbers: [1, 5], amount: 100 }], LIMITS);
    expect(!illegal.ok && illegal.error).toEqual({ code: 'ILLEGAL_BET', index: 1 });
  });
});
