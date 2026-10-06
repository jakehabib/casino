import { z } from 'zod';
import { route } from '@/server/api/handler';
import { listTransactions } from '@/server/services/wallet/wallet-service';

export const GET = route(
  { auth: true, query: z.object({ cursor: z.string().max(40).optional(), take: z.coerce.number().int().min(1).max(100).optional() }) },
  async ({ user, query }) => listTransactions(user.id, query),
);
