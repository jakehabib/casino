import { createHash, createHmac, randomBytes } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { sha256, hmacSha256, toHex, utf8 } from '@/engines/fairness/sha256';
import { FairRng, jsHmac, hashServerSeed } from '@/engines/fairness/rng';
import { orderedShoe } from '@/engines/cards/cards';
import { verifyRoulette } from '@/engines/roulette/verify';
import { verifyCrash } from '@/engines/crash/verify';
import { CRASH_SALT } from '@/engines/crash/crash-math';
import { verifyBlackjackShoe } from '@/engines/blackjack/verify';
import { verifyBaccaratShoe, resolveBaccarat } from '@/engines/baccarat/verify';
import { readVerifyParams, verifyHref, verifyParamsFor } from '@/components/fairness/verify-link';
import type { RoundDetail } from '@/lib/round-detail';

const nodeHmac = (k: string, m: string) => new Uint8Array(createHmac('sha256', k).update(m).digest());

/**
 * Independent reference implementation — the same standalone snippet that
 * docs/FAIRNESS.md publishes. If this ever disagrees with the engines, either
 * the docs or the engine is wrong.
 */
const ref = {
  floats(serverSeed: string, clientSeed: string, nonce: number, count: number) {
    const out: number[] = [];
    for (let round = 0; out.length < count; round++) {
      const b = createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}:${round}`).digest();
      for (let i = 0; i < 32 && out.length < count; i += 4) out.push(b[i] / 256 + b[i + 1] / 256 ** 2 + b[i + 2] / 256 ** 3 + b[i + 3] / 256 ** 4);
    }
    return out;
  },
  roulette(s: string, c: string, n: number) {
    return Math.floor(ref.floats(s, c, n, 1)[0] * 37);
  },
  shoe(s: string, c: string, n: number, decks: number) {
    const cards: string[] = [];
    for (let d = 0; d < decks; d++) for (const suit of 'SHDC') for (const r of 'A23456789TJQK') cards.push(r + suit);
    const f = ref.floats(s, c, n, cards.length - 1);
    for (let i = cards.length - 1, k = 0; i > 0; i--, k++) {
      const j = Math.floor(f[k] * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  },
  crash(seed: string, salt: string) {
    const h = BigInt('0x' + createHmac('sha256', seed).update(salt).digest('hex').slice(0, 13));
    const e = 2n ** 52n;
    return Math.max(100, Number((99n * e) / (e - h)));
  },
};

const seed = () => randomBytes(32).toString('hex');

describe('browser SHA-256 / HMAC', () => {
  it('matches node:crypto for many inputs, including multi-block and long keys', () => {
    for (let len = 0; len < 300; len += 7) {
      const data = randomBytes(len);
      expect(toHex(sha256(new Uint8Array(data)))).toBe(createHash('sha256').update(data).digest('hex'));
      const key = randomBytes((len * 3) % 150).toString('hex');
      const msg = randomBytes(len).toString('base64');
      expect(toHex(hmacSha256(utf8(key), utf8(msg)))).toBe(createHmac('sha256', key).update(msg).digest('hex'));
    }
  });

  it('hashServerSeed is the committed SHA-256 hex', () => {
    const s = seed();
    expect(hashServerSeed(s)).toBe(createHash('sha256').update(s).digest('hex'));
  });
});

describe('FairRng', () => {
  it('JS and node HMAC produce the identical float stream', () => {
    const s = seed();
    const a = new FairRng(s, 'client', 7, jsHmac);
    const b = new FairRng(s, 'client', 7, nodeHmac);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('matches the documented reference stream across block boundaries', () => {
    const s = seed();
    const rng = new FairRng(s, 'abc', 3);
    const expected = ref.floats(s, 'abc', 3, 20);
    for (const f of expected) expect(rng.next()).toBe(f);
  });
});

describe('game verifiers agree with the reference implementation', () => {
  it('roulette', () => {
    for (let n = 0; n < 50; n++) {
      const s = seed();
      const v = verifyRoulette(s, 'my-seed', n);
      expect(v).toBe(ref.roulette(s, 'my-seed', n));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(36);
    }
  });

  it('crash', () => {
    for (let i = 0; i < 50; i++) {
      const s = seed();
      const v = verifyCrash(s, CRASH_SALT);
      expect(v.crashPointX100).toBe(ref.crash(s, CRASH_SALT));
      expect(v.seedHash).toBe(createHash('sha256').update(s).digest('hex'));
    }
  });

  it('blackjack and baccarat shoes are reproducible Fisher–Yates permutations', () => {
    const s = seed();
    const bj = verifyBlackjackShoe(s, 'c', 2, 6);
    expect(bj).toEqual(ref.shoe(s, 'c', 2, 6));
    expect([...bj].sort()).toEqual(orderedShoe(6).sort());
    expect(verifyBlackjackShoe(s, 'c', 2, 6)).toEqual(bj);
    expect(verifyBlackjackShoe(s, 'c', 3, 6)).not.toEqual(bj);

    const bac = verifyBaccaratShoe(s, 'c', 0, 8);
    expect(bac).toHaveLength(416);
    expect(bac).toEqual(ref.shoe(s, 'c', 0, 8));
    const round = resolveBaccarat(bac.slice(0, 6));
    expect(['PLAYER', 'BANKER', 'TIE']).toContain(round.outcome);
    expect(round.playerCards[0]).toBe(bac[0]);
    expect(round.bankerCards[0]).toBe(bac[1]);
  });
});

describe('verify links', () => {
  const base: RoundDetail<unknown> = {
    game: 'BACCARAT',
    id: 'r1',
    createdAt: new Date().toISOString(),
    wager: 100,
    payout: 0,
    net: -100,
    summary: '',
    data: {},
    fairness: { serverSeedHash: 'h', clientSeed: 'cs', nonce: 4, serverSeed: 'ss', revealed: true, extra: { decks: 8, positions: [12, 18] } },
  };

  it('maps shoe positions and seeds into query params and back', () => {
    const p = verifyParamsFor(base)!;
    expect(p).toMatchObject({ game: 'baccarat', serverSeed: 'ss', clientSeed: 'cs', nonce: '4', seedHash: 'h', decks: '8', from: '12', to: '18' });
    const href = verifyHref(p);
    expect(href.startsWith('/fairness?')).toBe(true);
    const back = readVerifyParams(new URL(href, 'http://x').searchParams);
    expect(back).toMatchObject({ game: 'baccarat', serverSeed: 'ss', from: '12', to: '18' });
  });

  it('omits an unrevealed server seed and uses the round seed + salt for crash', () => {
    const unrevealed = verifyParamsFor({ ...base, fairness: { ...base.fairness!, serverSeed: null, revealed: false } })!;
    expect(unrevealed.serverSeed).toBeUndefined();
    const crash = verifyParamsFor({ ...base, game: 'CRASH', fairness: { serverSeedHash: 'h', clientSeed: CRASH_SALT, nonce: 9, serverSeed: 'rs', revealed: true, extra: { salt: CRASH_SALT } } })!;
    expect(crash).toMatchObject({ game: 'crash', serverSeed: 'rs', salt: CRASH_SALT });
    expect(crash.nonce).toBeUndefined();
  });

  it('serialises slot bonus state as JSON and rejects unknown games', () => {
    const p = verifyParamsFor({ ...base, game: 'SLOTS', variant: 'overcharge', fairness: { ...base.fairness!, extra: { betLevel: 200, bonusStateBefore: { remaining: 3 } } } })!;
    expect(p).toMatchObject({ slotId: 'overcharge', betLevel: '200', bonusState: '{"remaining":3}' });
    expect(readVerifyParams(new URLSearchParams('game=poker')).game).toBeUndefined();
  });
});
