import { z } from 'zod';
import { route } from '@/server/api/handler';
import { listTransactions } from '@/server/services/wallet/wallet-service';

const TYPES = ['SIGNUP_GRANT', 'FREE_CREDIT_CLAIM', 'BET', 'WIN', 'REFUND', 'ADMIN_ADJUSTMENT'] as const;

export const GET = route(
  {
    auth: true,
    query: z.object({
      cursor: z.string().max(40).optional(),
      take: z.coerce.number().int().min(1).max(100).optional(),
      // Optional comma-separated type filter, e.g. ?types=FREE_CREDIT_CLAIM,SIGNUP_GRANT
      types: z
        .string()
        .max(120)
        .optional()
        .transform((v) => (v ? v.split(',').filter(Boolean) : undefined))
        .pipe(z.array(z.enum(TYPES)).max(TYPES.length).optional()),
    }),
  },
  async ({ user, query }) => listTransactions(user.id, query),
);
