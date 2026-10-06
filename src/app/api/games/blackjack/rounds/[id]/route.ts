import { route } from '@/server/api/handler';
import { getRoundData, type BlackjackRoundData } from '@/server/services/blackjack/blackjack-service';
import { fairnessInfo } from '@/server/services/fairness/seed-service';
import { toNum } from '@/lib/money';
import type { RoundDetail } from '@/lib/round-detail';

/** GET /api/games/blackjack/rounds/[id] — owner-only settled round detail + fairness inputs. */
export const GET = route<undefined, undefined, { id: string }>(
  { auth: true, rateLimit: { bucket: 'bj-round', limit: 120, windowSec: 60 } },
  async ({ user, params }): Promise<RoundDetail<BlackjackRoundData>> => {
    const { game, data, decks, forced } = await getRoundData(user.id, params.id);
    const first = data.segments[0];
    const fairness = await fairnessInfo(user.id, game.serverSeedHash, game.clientSeed, game.nonce);
    const wager = toNum(game.totalWagered);
    const payout = toNum(game.totalPayout);
    return {
      game: 'BLACKJACK',
      id: game.id,
      variant: null,
      createdAt: game.createdAt.toISOString(),
      wager,
      payout,
      net: payout - wager,
      summary: game.result ?? '',
      fairness: {
        ...fairness,
        extra: {
          decks,
          shoeId: game.shoeId,
          positions: first ? [first.from, first.to] : [0, 0],
          ...(data.segments.length > 1 ? { segments: data.segments } : {}),
        },
      },
      forced,
      data,
    };
  },
);
