import { route } from '@/server/api/handler';
import { getPublicProfile } from '@/server/services/profile/profile-service';

/** Public, privacy-filtered profile. Responsible-play data is never included. */
export const GET = route<undefined, undefined, { username: string }>(
  { rateLimit: { bucket: 'profile-view', limit: 120, windowSec: 60 } },
  async ({ user, params }) => getPublicProfile(decodeURIComponent(params.username), user ? { id: user.id, role: user.role } : null),
);
