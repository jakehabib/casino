import { z } from 'zod';
import { route } from '@/server/api/handler';
import { getAllSettings, updateSettings } from '@/server/services/admin/settings';
import { SETTINGS, type SettingKey } from '@/server/services/settings/schemas';

export const GET = route({ auth: 'ADMIN' }, async ({ user }) => getAllSettings(user));

const Body = z.object({
  key: z.enum(Object.keys(SETTINGS) as [SettingKey, ...SettingKey[]]),
  patch: z.record(z.string(), z.unknown()),
  reason: z.string().trim().min(3, 'A reason is required').max(500),
});

export const POST = route(
  { auth: 'ADMIN', body: Body, rateLimit: { bucket: 'admin-mutation', limit: 60, windowSec: 60 } },
  async ({ user, body, ip }) => updateSettings(user, body.key, body.patch, body.reason, { ip }),
);
