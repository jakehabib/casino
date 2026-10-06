import { route } from '@/server/api/handler';
import { requestReinstatement } from '@/server/services/responsible-play/exclusions';

export const POST = route({ auth: true, rateLimit: { bucket: 'rp-reinstate', limit: 3, windowSec: 3600 } }, async ({ user }) => {
  await requestReinstatement(user.id);
  return { ok: true };
});
