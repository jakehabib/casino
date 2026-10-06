import { describe, it, expect } from 'vitest';
import { createHash, createHmac } from 'node:crypto';
import { FairRng, shuffle, weightedIndex, hashServerSeed, jsHmac } from '@/engines/fairness/rng';
import { sha256, hmacSha256, toHex, utf8 } from '@/engines/fairness/sha256';
import { nodeHmac } from '@/server/services/fairness/seed-service';

describe('pure-JS SHA-256 / HMAC', () => {
  it('matches node:crypto for many inputs', () => {
    for (const msg of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(200), 'nova:client:42:0']) {
      expect(toHex(sha256(utf8(msg)))).toBe(createHash('sha256').update(msg).digest('hex'));
      expect(toHex(hmacSha256(utf8('server-seed'), utf8(msg)))).toBe(createHmac('sha256', 'server-seed').update(msg).digest('hex'));
    }
    const longKey = 'k'.repeat(100);
    expect(toHex(hmacSha256(utf8(longKey), utf8('x')))).toBe(createHmac('sha256', longKey).update('x').digest('hex'));
  });

  it('hashServerSeed equals sha256 hex', () => {
    expect(hashServerSeed('deadbeef')).toBe(createHash('sha256').update('deadbeef').digest('hex'));
  });
});

describe('FairRng', () => {
  it('is deterministic and identical across HMAC implementations', () => {
    const a = new FairRng('seed', 'client', 7, jsHmac);
    const b = new FairRng('seed', 'client', 7, nodeHmac);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('changes with nonce and client seed', () => {
    const x = new FairRng('seed', 'client', 1).next();
    expect(new FairRng('seed', 'client', 2).next()).not.toBe(x);
    expect(new FairRng('seed', 'client2', 1).next()).not.toBe(x);
  });

  it('derives the documented float from the first 4 HMAC bytes', () => {
    const bytes = createHmac('sha256', 's').update('c:0:0').digest();
    const expected = bytes[0] / 256 + bytes[1] / 256 ** 2 + bytes[2] / 256 ** 3 + bytes[3] / 256 ** 4;
    expect(new FairRng('s', 'c', 0).next()).toBe(expected);
  });

  it('produces values in [0,1) and roughly uniform ints', () => {
    const rng = new FairRng('uniform', 'test', 0, nodeHmac);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 20_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      buckets[Math.floor(v * 10)]++;
    }
    for (const b of buckets) expect(Math.abs(b - 2000)).toBeLessThan(250);
  });

  it('shuffle is a permutation and deterministic', () => {
    const arr = Array.from({ length: 52 }, (_, i) => i);
    const s1 = shuffle([...arr], new FairRng('a', 'b', 0));
    const s2 = shuffle([...arr], new FairRng('a', 'b', 0));
    expect(s1).toEqual(s2);
    expect([...s1].sort((x, y) => x - y)).toEqual(arr);
    expect(s1).not.toEqual(arr);
  });

  it('weightedIndex respects weights', () => {
    const rng = new FairRng('w', 'x', 0, nodeHmac);
    const counts = [0, 0, 0];
    for (let i = 0; i < 10_000; i++) counts[weightedIndex([1, 2, 7], rng)]++;
    expect(counts[2] / 10_000).toBeCloseTo(0.7, 1);
    expect(counts[0] / 10_000).toBeCloseTo(0.1, 1);
  });
});
