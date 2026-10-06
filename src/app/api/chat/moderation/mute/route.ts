import { z } from 'zod';
import { route } from '@/server/api/handler';
import { muteUser } from '@/server/services/chat/moderation-service';
import { MAX_MUTE_SECONDS } from '@/server/services/chat/types';

export const POST = route(
  {
    auth: 'MODERATOR',
    body: z.object({
      userId: z.string().min(1).max(40),
      durationSec: z.number().int().min(60).max(MAX_MUTE_SECONDS),
      reason: z.string().max(300).nullish(),
      purge: z.boolean().optional(),
    }),
  },
  async ({ user, body }) => muteUser({ actorId: user.id, ...body }),
);
