import { z } from 'zod';
import { route, RequestId } from '@/server/api/handler';
import { spinSlot } from '@/server/services/slots/slot-service';

const Body = z.object({
  betLevel: z.number().int().positive().max(1_000_000_000),
  requestId: RequestId,
  /** What the client believes it is playing. 'free' never turns into a paid spin (stale tab). */
  mode: z.enum(['paid', 'free']).optional(),
});

/**
 * POST /api/games/slots/[slotId]/spin { betLevel, requestId, mode? }
 * Paid spin, or a free spin (no charge, locked bet level) while a bonus is active.
 * Idempotent by requestId.
 */
export const POST = route<typeof Body, undefined, { slotId: string }>(
  {
    auth: true,
    body: Body,
    rateLimit: { bucket: 'slot-spin', limit: 150, windowSec: 60 },
  },
  async ({ user, body, params }) => spinSlot(user.id, params.slotId, body),
);
