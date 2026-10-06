import { route } from '@/server/api/handler';
import { getUserDetail } from '@/server/services/admin/users';

export const GET = route<undefined, undefined, { id: string }>({ auth: 'ADMIN' }, async ({ user, params }) => getUserDetail(user, params.id));
