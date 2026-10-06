import { z } from 'zod';
import { route } from '@/server/api/handler';
import { changeUserRole } from '@/server/services/admin/users';

const Body = z.object({
  role: z.enum(['USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN']),
  reason: z.string().trim().min(3, 'A reason is required').max(500),
});

export const POST = route<typeof Body, undefined, { id: string }>(
  { auth: 'SUPER_ADMIN', body: Body, rateLimit: { bucket: 'admin-mutation', limit: 60, windowSec: 60 } },
  async ({ user, params, body, ip }) => changeUserRole(user, { userId: params.id, ...body }, { ip }),
);
