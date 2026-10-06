import { z } from 'zod';
import { route } from '@/server/api/handler';
import { processReinstatement } from '@/server/services/admin/responsible-play';

const Body = z.object({
  exclusionId: z.string().min(1).max(40),
  reason: z.string().trim().min(3, 'A reason is required').max(500),
});

// SUPER_ADMIN only — the service re-checks the role and every eligibility rule.
export const POST = route(
  { auth: 'SUPER_ADMIN', body: Body, rateLimit: { bucket: 'admin-mutation', limit: 60, windowSec: 60 } },
  async ({ user, body, ip }) => processReinstatement(user, body, { ip }),
);
