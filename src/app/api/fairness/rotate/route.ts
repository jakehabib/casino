import { z } from 'zod';
import { route } from '@/server/api/handler';
import { rotateSeed } from '@/server/services/fairness/seed-service';

export const POST = route(
  {
    auth: true,
    body: z.object({ clientSeed: z.string().trim().min(1).max(64).regex(/^[\x20-\x7E]+$/, 'Printable ASCII only').optional() }),
    rateLimit: { bucket: 'seed-rotate', limit: 10, windowSec: 60 },
  },
  async ({ user, body }) => rotateSeed(user.id, body.clientSeed),
);
