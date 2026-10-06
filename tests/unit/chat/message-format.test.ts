import { describe, it, expect } from 'vitest';
import { countUrls, extractMentionHandles, hostAllowed, safeUrl, tokenizeMessage } from '@/server/services/chat/message-format';

describe('URL safety', () => {
  it('only accepts http(s) URLs', () => {
    expect(safeUrl('https://youtube.com/watch?v=1')?.hostname).toBe('youtube.com');
    expect(safeUrl('www.github.com/nova')?.protocol).toBe('https:');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeUrl('vbscript:msgbox')).toBeNull();
    expect(safeUrl('file:///etc/passwd')).toBeNull();
  });

  it('rejects credential-style host spoofing', () => {
    expect(safeUrl('https://youtube.com@evil.example/x')).toBeNull();
  });

  it('matches allowlisted hosts and subdomains only', () => {
    expect(hostAllowed('youtube.com', ['youtube.com'])).toBe(true);
    expect(hostAllowed('m.youtube.com', ['youtube.com'])).toBe(true);
    expect(hostAllowed('youtube.com.evil.io', ['youtube.com'])).toBe(false);
    expect(hostAllowed('notyoutube.com', ['youtube.com'])).toBe(false);
  });

  it('tokenises allowlisted URLs as links and others as inert text', () => {
    const t = tokenizeMessage('see https://youtube.com/watch?v=abc and https://evil.example/x.', { allowHosts: ['youtube.com'] });
    expect(t).toEqual([
      { type: 'text', text: 'see ' },
      { type: 'link', text: 'https://youtube.com/watch?v=abc', href: 'https://youtube.com/watch?v=abc' },
      { type: 'text', text: ' and ' },
      { type: 'url', text: 'https://evil.example/x' },
      { type: 'text', text: '.' },
    ]);
  });

  it('never turns javascript: into a link', () => {
    const t = tokenizeMessage('click javascript:alert(document.cookie)');
    expect(t.every((x) => x.type === 'text')).toBe(true);
  });

  it('counts URLs', () => {
    expect(countUrls('a https://a.com b www.b.com c http://c.io')).toBe(3);
    expect(countUrls('no links here.')).toBe(0);
  });
});

describe('mentions', () => {
  it('extracts unique lowercase handles', () => {
    expect(extractMentionHandles('hi @Alice and @bob_1, also @alice!')).toEqual(['alice', 'bob_1']);
    expect(extractMentionHandles('email me at a@b.com')).toEqual([]);
    expect(extractMentionHandles('@ab too short')).toEqual([]);
  });

  it('caps the number of handles', () => {
    expect(extractMentionHandles('@aaa @bbb @ccc @ddd @eee @fff @ggg')).toHaveLength(5);
  });

  it('only highlights resolved mentions', () => {
    const t = tokenizeMessage('gg @Alice and @ghost', { mentions: ['alice'] });
    expect(t).toEqual([
      { type: 'text', text: 'gg ' },
      { type: 'mention', text: '@Alice', username: 'alice' },
      { type: 'text', text: ' and @ghost' },
    ]);
  });
});
