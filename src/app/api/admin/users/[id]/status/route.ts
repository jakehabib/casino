import { z } from 'zod';
import { route } from '@/server/api/handler';
import { setUserStatus } from '@/server/services/admin/users';

const Body = z.object({
  action: z.enum(['SUSPEND', 'BAN', 'REINSTATE']),
  until: z.iso.datetime({ offset: true }).nullable().optional(),
  reason: z.string().trim().min(3, 'A reason is required').max(500),
});

export const POST = route<typeof Body, undefined, { id: string }>(
  { auth: 'ADMIN', body: Body, rateLimit: { bucket: 'admin-mutation', limit: 60, windowSec: 60 } },
  async ({ user, params, body, ip }) =>
    setUserStatus(
      user,
      { userId: params.id, action: body.action, until: body.until ? new Date(body.until) : null, reason: body.reason },
      { ip },
    ),
);
