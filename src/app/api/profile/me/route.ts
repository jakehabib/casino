import { route } from '@/server/api/handler';
import { getOwnProfile } from '@/server/services/profile/profile-service';

/** Full own stats, level progress and recent games. */
export const GET = route({ auth: true }, async ({ user }) => getOwnProfile(user.id));
