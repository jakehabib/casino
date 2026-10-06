import { describe, it, expect } from 'vitest';
import { isNoisy, isRepetitive, isShouting, spamFingerprint } from '@/server/services/chat/spam';

describe('spam heuristics', () => {
  it('fingerprints near-identical messages to the same key', () => {
    const a = spamFingerprint('Hello there!');
    expect(spamFingerprint('hello   there')).toBe(a);
    expect(spamFingerprint('HELLO THEREEEE!!!')).toBe(a);
    expect(spamFingerprint('h.e.l.l.o t-h-e-r-e')).toBe(a);
    expect(spamFingerprint('hello world')).not.toBe(a);
  });

  it('detects shouting only with enough letters', () => {
    expect(isShouting('THIS IS AMAZING EVERYONE')).toBe(true);
    expect(isShouting('GG')).toBe(false);
    expect(isShouting('This is fine, OK')).toBe(false);
  });

  it('detects excessive repetition', () => {
    expect(isRepetitive('loooooool')).toBe(true);
    expect(isRepetitive('spam spam spam spam')).toBe(true);
    expect(isRepetitive('hahahahahahahahaha')).toBe(true);
    expect(isRepetitive('that was a good hand')).toBe(false);
    expect(isRepetitive('nice nice')).toBe(false);
  });

  it('classifies noisy messages', () => {
    expect(isNoisy('WHAT A WIN EVERYBODY')).toBe(true);
    expect(isNoisy('what a win everybody')).toBe(false);
  });
});
