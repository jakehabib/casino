import { route } from '@/server/api/handler';
import { getSlotState } from '@/server/services/slots/slot-service';

/** GET /api/games/slots/[slotId]/state — public definition, bet levels, bonus state, last spin. */
export const GET = route<undefined, undefined, { slotId: string }>({}, async ({ user, params }) =>
  getSlotState(user?.id ?? null, params.slotId),
);
