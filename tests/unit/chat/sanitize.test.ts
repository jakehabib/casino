import { describe, it, expect } from 'vitest';
import { CHAT_MAX_LENGTH, chatLength, collapseRuns, sanitizeChatText, validateChatText } from '@/server/services/chat/sanitize';

describe('sanitizeChatText', () => {
  it('trims and collapses all whitespace (incl. newlines/tabs) to single spaces', () => {
    expect(sanitizeChatText('  hello \n\n  world\t!  ')).toBe('hello world !');
    expect(sanitizeChatText('a b c')).toBe('a b c');
  });

  it('strips control characters', () => {
    expect(sanitizeChatText('he\u0000ll\u0007o\u001b[31m')).toBe('hello[31m');
    expect(sanitizeChatText('x\u0085y\u009fz')).toBe('xyz');
  });

  it('strips zero-width, bidi-override and filler characters', () => {
    expect(sanitizeChatText('ad​min')).toBe('admin');
    expect(sanitizeChatText('﻿hi⁠')).toBe('hi');
    expect(sanitizeChatText('abc‮dcba')).toBe('abcdcba');
    expect(sanitizeChatText('ㅤㅤ')).toBe('');
    expect(sanitizeChatText('so­ft')).toBe('soft');
  });

  it('keeps zero-width joiners only inside emoji sequences', () => {
    const family = '\u{1F468}‍\u{1F469}‍\u{1F467}';
    expect(sanitizeChatText(family)).toBe(family);
    expect(sanitizeChatText('f‍uck')).toBe('fuck');
  });

  it('caps combining-mark stacks (zalgo)', () => {
    const zalgo = 'á̂̃̄̅';
    expect(sanitizeChatText(zalgo)).toBe('á̂'.normalize('NFC'));
  });

  it('collapses very long character runs', () => {
    expect(collapseRuns('niiiiiiiiiiiice')).toBe('niiiiiice');
    expect(sanitizeChatText('!!!!!!!!!!!!!!')).toBe('!!!!!!');
  });

  it('never alters HTML — it is stored as inert text', () => {
    expect(sanitizeChatText('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
  });
});

describe('validateChatText', () => {
  it('rejects empty / whitespace-only / invisible-only messages', () => {
    expect(validateChatText('')).toMatchObject({ ok: false, error: 'EMPTY' });
    expect(validateChatText('   \n\t ')).toMatchObject({ ok: false, error: 'EMPTY' });
    expect(validateChatText('​​﻿')).toMatchObject({ ok: false, error: 'EMPTY' });
  });

  it(`enforces the ${CHAT_MAX_LENGTH} character limit in code points`, () => {
    expect(validateChatText('a'.repeat(CHAT_MAX_LENGTH)).ok).toBe(true);
    expect(validateChatText('ab'.repeat(CHAT_MAX_LENGTH / 2) + 'c')).toMatchObject({ ok: false, error: 'TOO_LONG' });
    // Emoji count as one character each, not two UTF-16 units.
    const emoji = '\u{1F600}'.repeat(CHAT_MAX_LENGTH);
    expect(chatLength(emoji)).toBe(CHAT_MAX_LENGTH);
  });

  it('measures length after sanitising (padding does not count)', () => {
    expect(validateChatText(' '.repeat(500) + 'hi' + ' '.repeat(500))).toEqual({ ok: true, text: 'hi' });
  });
});
