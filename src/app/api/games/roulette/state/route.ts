import { route } from '@/server/api/handler';
import { getRouletteState } from '@/server/services/roulette/roulette-service';

/** Table config + this player's recent results + last round (refresh restore). */
export const GET = route({ auth: true }, async ({ user }) => getRouletteState(user.id));
