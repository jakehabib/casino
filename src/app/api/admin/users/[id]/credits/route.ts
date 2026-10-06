import { z } from 'zod';
import { route, RequestId } from '@/server/api/handler';
import { adjustCredits, MAX_ADJUSTMENT } from '@/server/services/admin/users';

const Body = z.object({
  amount: z.number().int().min(-MAX_ADJUSTMENT).max(MAX_ADJUSTMENT),
  reason: z.string().trim().min(3, 'A reason is required').max(500),
  requestId: RequestId,
});

export const POST = route<typeof Body, undefined, { id: string }>(
  { auth: 'ADMIN', body: Body, rateLimit: { bucket: 'admin-mutation', limit: 60, windowSec: 60 } },
  async ({ user, params, body, ip }) => adjustCredits(user, { userId: params.id, ...body }, { ip }),
);
