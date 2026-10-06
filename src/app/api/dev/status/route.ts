import { route } from '@/server/api/handler';
import { getDevStatus, requireDevUser } from '@/server/services/admin/dev-tools';

export const GET = route({}, async ({ user }) => getDevStatus(requireDevUser(user).id));
