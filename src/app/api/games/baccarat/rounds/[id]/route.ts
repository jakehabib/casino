import { route } from '@/server/api/handler';
import { getRoundDetail } from '@/server/services/baccarat/baccarat-service';

export const GET = route<undefined, undefined, { id: string }>({ auth: true }, async ({ user, params }) => getRoundDetail(user.id, params.id));
