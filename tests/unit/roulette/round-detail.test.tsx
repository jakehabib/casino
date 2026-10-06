import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RouletteRoundDetail } from '@/components/games/roulette/round-detail';
import type { RoundDetail } from '@/lib/round-detail';
import type { RouletteRoundData } from '@/engines/roulette/api-types';

describe('RouletteRoundDetail', () => {
  it('renders the winning number, bet labels and returns', () => {
    const detail: RoundDetail<RouletteRoundData> = {
      game: 'ROULETTE',
      id: 'r1',
      createdAt: new Date(0).toISOString(),
      wager: 2_000,
      payout: 18_000,
      net: 16_000,
      summary: '17 Black · 2 bets',
      fairness: null,
      data: {
        winningNumber: 17,
        bets: [
          { type: 'SPLIT', numbers: [17, 20], amount: 1_000, payout: 18_000, won: true },
          { type: 'CORNER', numbers: [0, 1, 2, 3], amount: 1_000, payout: 0, won: false },
        ],
      },
    };
    const html = renderToStaticMarkup(<RouletteRoundDetail detail={detail} />);
    expect(html).toContain('17 Black');
    expect(html).toContain('Split 17/20');
    expect(html).toContain('First Four');
    expect(html).toContain('18,000');
    expect(html).toContain('+16,000');
  });
});
