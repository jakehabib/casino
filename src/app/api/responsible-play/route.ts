import { route } from '@/server/api/handler';
import { getResponsiblePlaySummary } from '@/server/services/responsible-play/summary';

export const GET = route({ auth: true }, async ({ user }) => getResponsiblePlaySummary(user.id));
