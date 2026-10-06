import { z } from 'zod';
import { route, RequestId } from '@/server/api/handler';
import { spinSlot } from '@/server/services/slots/slot-service';

/**
 * POST /api/games/slots/[slotId]/spin { betLevel, requestId }
 * Paid spin, or a free spin (no charge, locked bet level) while a bonus is active.
 * Idempotent by requestId.
 */
export const POST = route<z.ZodObject<{ betLevel: z.ZodNumber; requestId: typeof RequestId }>, undefined, { slotId: string }>(
  {
    auth: true,
    body: z.object({ betLevel: z.number().int().positive().max(1_000_000_000), requestId: RequestId }),
    rateLimit: { bucket: 'slot-spin', limit: 150, windowSec: 60 },
  },
  async ({ user, body, params }) => spinSlot(user.id, params.slotId, body),
);
