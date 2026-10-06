import { route } from '@/server/api/handler';
import { statePayload } from '@/server/services/crash/crash-service';

/** First-paint snapshot: current round + bets (+ own bets), last 30 results, my recent bets, limits. */
export const GET = route({ rateLimit: { bucket: 'crash-state', limit: 60, windowSec: 60 } }, async ({ user }) =>
  statePayload(user?.id ?? null, Date.now()),
);
