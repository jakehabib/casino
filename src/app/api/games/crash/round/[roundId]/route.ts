import { route } from '@/server/api/handler';
import { roundInfo } from '@/server/services/crash/crash-service';

/** Public round info (seed revealed only once crashed) — history pills. */
export const GET = route<undefined, undefined, { roundId: string }>(
  { rateLimit: { bucket: 'crash-round', limit: 120, windowSec: 60 } },
  async ({ params }) => roundInfo(params.roundId),
);
