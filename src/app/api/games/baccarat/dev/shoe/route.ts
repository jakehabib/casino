import { route } from '@/server/api/handler';
import { AppError } from '@/lib/errors';
import { devToolsEnabled } from '@/server/env';
import { getDevShoe } from '@/server/services/baccarat/baccarat-service';

export const GET = route({ devOnly: true, auth: true }, async ({ user }) => {
  if (!devToolsEnabled()) throw new AppError('NOT_FOUND');
  return getDevShoe(user.id);
});
