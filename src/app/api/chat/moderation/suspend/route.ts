import { z } from 'zod';
import { route } from '@/server/api/handler';
import { suspendAccount } from '@/server/services/chat/moderation-service';

/** Account suspension — ADMIN and above only. Writes ModerationLog + AdminAuditLog. */
export const POST = route(
  {
    auth: 'ADMIN',
    body: z.object({
      userId: z.string().min(1).max(40),
      durationSec: z.number().int().min(3600).max(365 * 86_400).nullable(),
      reason: z.string().trim().min(3, 'Add a reason').max(300),
    }),
  },
  async ({ user, body, ip }) => suspendAccount({ actorId: user.id, userId: body.userId, durationSec: body.durationSec, reason: body.reason, ip }),
);
