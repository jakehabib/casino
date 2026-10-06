import { z } from 'zod';
import { route } from '@/server/api/handler';
import { createExclusion, serializeExclusion } from '@/server/services/responsible-play/exclusions';
import { emitToUser } from '@/server/realtime/events';
import { AppError } from '@/lib/errors';

export const POST = route(
  {
    auth: true,
    body: z.object({
      type: z.enum(['COOLDOWN_24H', 'COOLDOWN_72H', 'LOCK_1W', 'EXCLUSION_1M', 'EXCLUSION_3M', 'EXCLUSION_6M', 'EXCLUSION_1Y', 'EXCLUSION_INDEFINITE']),
      // Deliberate confirmation: the client must echo the exact phrase shown.
      confirmation: z.string().max(64),
    }),
    rateLimit: { bucket: 'rp-exclusion', limit: 10, windowSec: 60 },
  },
  async ({ user, body }) => {
    const expected = body.type.startsWith('EXCLUSION') ? 'EXCLUDE' : 'CONFIRM';
    if (body.confirmation.trim().toUpperCase() !== expected) {
      throw new AppError('VALIDATION', `Type ${expected} to confirm`);
    }
    const { exclusion, created } = await createExclusion(user.id, body.type);
    await emitToUser(user.id, 'play:status', { changed: true });
    return { created, exclusion: serializeExclusion(exclusion) };
  },
);
