import { route } from '@/server/api/handler';
import { getRoundDetail } from '@/server/services/crash/crash-service';

/** RoundDetail for one of the signed-in player's crash bets (by CrashBet id). */
export const GET = route<undefined, undefined, { id: string }>({ auth: true }, async ({ user, params }) =>
  getRoundDetail(user.id, params.id),
);
