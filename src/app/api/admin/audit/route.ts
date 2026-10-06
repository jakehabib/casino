import { z } from 'zod';
import { route } from '@/server/api/handler';
import { auditFacets, listAuditLog } from '@/server/services/admin/audit';

const Query = z.object({
  action: z.string().max(64).optional(),
  admin: z.string().max(64).optional(),
  targetType: z.string().max(64).optional(),
  targetId: z.string().max(64).optional(),
  cursor: z.string().max(40).optional(),
  take: z.coerce.number().int().min(1).max(100).optional(),
});

export const GET = route({ auth: 'ADMIN', query: Query }, async ({ user, query }) => {
  const [list, facets] = await Promise.all([listAuditLog(user, query), query.cursor ? null : auditFacets(user)]);
  return { ...list, facets };
});
