import { describe, expect, it } from 'vitest';
import { summarizePresence } from '@/server/socket/presence-math';

describe('cluster presence', () => {
  it('unions users across nodes, sums guests, counts game viewers once', () => {
    const p = summarizePresence([
      { at: 0, users: ['u1', 'u2'], guests: ['g1'], games: { crash: ['u1', 'g1'] } },
      { at: 0, users: ['u1', 'u3'], guests: ['g2', 'g3'], games: { crash: ['u1', 'u3'], roulette: ['g2'] } },
    ]);
    expect(p).toEqual({ online: 6, users: 3, games: { crash: 3, roulette: 1 } });
  });

  it('is empty with no nodes', () => {
    expect(summarizePresence([])).toEqual({ online: 0, users: 0, games: {} });
  });
});
