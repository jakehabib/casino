import { z } from 'zod';
import { route } from '@/server/api/handler';
import { listModerationLog } from '@/server/services/admin/audit';

const Query = z.object({
  action: z.string().max(64).optional(),
  cursor: z.string().max(40).optional(),
  take: z.coerce.number().int().min(1).max(100).optional(),
});

export const GET = route({ auth: 'MODERATOR', query: Query }, async ({ user, query }) => listModerationLog(user, query));
