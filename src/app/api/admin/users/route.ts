import { z } from 'zod';
import { route } from '@/server/api/handler';
import { searchUsers } from '@/server/services/admin/users';

export const GET = route(
  {
    auth: 'ADMIN',
    query: z.object({
      q: z.string().max(64).optional(),
      role: z.enum(['USER', 'MODERATOR', 'ADMIN', 'SUPER_ADMIN']).optional(),
      status: z.enum(['ACTIVE', 'SUSPENDED', 'BANNED']).optional(),
      page: z.coerce.number().int().min(1).max(10_000).optional(),
      pageSize: z.coerce.number().int().min(5).max(100).optional(),
    }),
  },
  async ({ user, query }) => searchUsers(user, query),
);
