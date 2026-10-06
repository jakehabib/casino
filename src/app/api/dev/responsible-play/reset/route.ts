import { z } from 'zod';
import { route } from '@/server/api/handler';
import { devResetResponsiblePlay, requireDevUser } from '@/server/services/admin/dev-tools';

export const POST = route({ body: z.object({}).optional() }, async ({ user }) => devResetResponsiblePlay(requireDevUser(user).id));
