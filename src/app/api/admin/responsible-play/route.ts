import { route } from '@/server/api/handler';
import { getResponsiblePlayOverview } from '@/server/services/admin/responsible-play';

export const GET = route({ auth: 'ADMIN' }, async ({ user }) => getResponsiblePlayOverview(user));
