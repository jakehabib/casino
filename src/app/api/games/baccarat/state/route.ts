import { route } from '@/server/api/handler';
import { getState } from '@/server/services/baccarat/baccarat-service';

export const GET = route({ auth: true }, async ({ user }) => getState(user.id));
