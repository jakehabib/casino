import { route } from '@/server/api/handler';
import { getSlotRoundDetail } from '@/server/services/slots/slot-service';

/** GET /api/games/slots/rounds/[id] — RoundDetail for a slot round (paid spin + its free spins). */
export const GET = route<undefined, undefined, { id: string }>({ auth: true }, async ({ user, params }) =>
  getSlotRoundDetail(user.id, params.id),
);
