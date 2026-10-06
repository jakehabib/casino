import { z } from 'zod';
import { route } from '@/server/api/handler';
import { getUserLedger } from '@/server/services/admin/users';

const Query = z.object({ cursor: z.string().max(40).optional(), take: z.coerce.number().int().min(1).max(100).optional() });

export const GET = route<undefined, typeof Query, { id: string }>({ auth: 'ADMIN', query: Query }, async ({ user, params, query }) =>
  getUserLedger(user, params.id, query),
);
