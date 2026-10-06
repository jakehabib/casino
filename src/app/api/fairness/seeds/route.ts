import { route } from '@/server/api/handler';
import { getSeedState } from '@/server/services/fairness/seed-service';

export const GET = route({ auth: true }, async ({ user }) => getSeedState(user.id));
