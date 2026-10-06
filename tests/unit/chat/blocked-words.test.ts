import { describe, it, expect } from 'vitest';
import { moderateText, normaliseTerm, foldChar, type BlockedTerm } from '@/server/services/chat/blocked-words';

describe('blocked words — normalisation', () => {
  it('folds case, accents, full-width forms and leetspeak', () => {
    expect(foldChar('Ü')).toBe('u');
    expect(foldChar('Ｆ')).toBe('f');
    expect(foldChar('3')).toBe('e');
    expect(foldChar('$')).toBe('s');
    expect(foldChar('@')).toBe('a');
    expect(foldChar('.')).toBe('');
    expect(normaliseTerm('Sh1T')).toBe('shit');
  });

  it.each([
    ['fuck', true],
    ['FUCK', true],
    ['f.u.c.k', true],
    ['f u c k', true],
    ['f_u_c_k', true],
    ['fuuuuuck', true],
    ['ｆｕｃｋ', true],
    ['fück', true],
    ['sh1t', true],
    ['$hit', true],
    ['5h!t', true],
    ['a$$hole', true],
    ['fucking hell', true],
  ])('masks %s', (input, masked) => {
    const r = moderateText(`well ${input} then`);
    expect(r.action === 'mask').toBe(masked);
    expect(r.text.startsWith('well ')).toBe(true);
    expect(r.text.endsWith(' then')).toBe(true);
  });

  it('replaces only the matched characters with asterisks', () => {
    expect(moderateText('what the fuck').text).toBe('what the ****');
    expect(moderateText('f.u.c.k off').text).toBe('******* off');
  });

  it.each(['class act', 'assassin', 'I passed', 'Dickens novel', 'as soon as', 'grass', 'shiitake', 'Scunthorpe'])(
    'does not flag innocent text: %s',
    (text) => {
      const r = moderateText(text);
      expect(r.action).toBe('allow');
      expect(r.text).toBe(text);
    },
  );

  it('does not let a doubled-letter term match its single-letter form', () => {
    expect(moderateText('as').action).toBe('allow');
    expect(moderateText('ass').action).toBe('mask');
    expect(moderateText('a s s').action).toBe('mask');
  });

  it('rejects harassment and scam phrases even when spaced or leeted', () => {
    expect(moderateText('just kys').action).toBe('reject');
    expect(moderateText('k.y.s').action).toBe('reject');
    expect(moderateText('go k1ll y0urself').action).toBe('reject');
    expect(moderateText('send me your password pls').action).toBe('reject');
    expect(moderateText('BUY CREDITS here').action).toBe('reject');
  });

  it('supports a custom term list (configurable architecture)', () => {
    const terms: BlockedTerm[] = [{ term: 'banana', action: 'reject' }];
    expect(moderateText('b-a-n-a-n-a', terms).action).toBe('reject');
    expect(moderateText('fuck', terms).action).toBe('allow');
  });
});
