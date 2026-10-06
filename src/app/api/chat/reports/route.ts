import { z } from 'zod';
import { route } from '@/server/api/handler';
import { reportMessage } from '@/server/services/chat/chat-service';
import { REPORT_REASONS } from '@/server/services/chat/types';

const Reason = z.enum(REPORT_REASONS.map((r) => r.value) as [string, ...string[]]);

export const POST = route(
  {
    auth: true,
    body: z.object({ messageId: z.string().min(1).max(40), reason: Reason, details: z.string().max(300).nullish() }),
    rateLimit: { bucket: 'chat-report', limit: 20, windowSec: 600 },
  },
  async ({ user, body }) =>
    reportMessage({ reporterId: user.id, messageId: body.messageId, reason: body.reason as (typeof REPORT_REASONS)[number]['value'], details: body.details }),
);
