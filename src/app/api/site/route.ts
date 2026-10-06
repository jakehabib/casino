import { route } from '@/server/api/handler';
import { getSetting } from '@/server/services/settings/settings-service';

export const GET = route({}, async () => {
  const s = await getSetting('system');
  return { announcement: s.announcement, maintenanceMode: s.maintenanceMode, registrationOpen: s.registrationOpen };
});
