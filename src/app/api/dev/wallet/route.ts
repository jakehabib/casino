import { z } from 'zod';
import { route, RequestId } from '@/server/api/handler';
import { devClearBalance, devGrantCredits, requireDevUser } from '@/server/services/admin/dev-tools';

const Body = z.discriminatedUnion('op', [
  z.object({ op: z.literal('grant'), amount: z.number().int().positive(), requestId: RequestId }),
  z.object({ op: z.literal('clear'), requestId: RequestId }),
]);

export const POST = route({ body: Body }, async ({ user, body }) => {
  const u = requireDevUser(user);
  return body.op === 'grant' ? devGrantCredits(u.id, body.amount, body.requestId) : devClearBalance(u.id, body.requestId);
});
