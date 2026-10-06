import { route } from '@/server/api/handler';
import { getDashboard } from '@/server/services/admin/dashboard';

export const GET = route({ auth: 'ADMIN' }, async ({ user }) => getDashboard(user));
