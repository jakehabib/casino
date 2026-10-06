import { route } from '@/server/api/handler';
import { getRewardStatus } from '@/server/services/rewards/rewards-service';

export const GET = route({ auth: true }, async ({ user }) => getRewardStatus(user.id));
