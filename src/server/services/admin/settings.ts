import { z } from 'zod';
import { prisma, transaction } from '@/server/db';
import { AppError } from '@/lib/errors';
import { emitToAll } from '@/server/realtime/events';
import { SETTINGS, type SettingKey, type SettingValue } from '@/server/services/settings/schemas';
import { invalidateSettings } from '@/server/services/settings/settings-service';
import { type Actor, type AuditContext, cleanReason, requireRole, writeAudit } from './access';

export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];
export const KNOWN_SLOT_MACHINES = ['gilded-vault', 'overcharge', 'starforged-relics'] as const;

function parseStored<K extends SettingKey>(key: K, raw: unknown): SettingValue<K> {
  const res = SETTINGS[key].safeParse(raw ?? {});
  return (res.success ? res.data : SETTINGS[key].parse({})) as SettingValue<K>;
}

/** Cross-field rules the per-field zod schemas cannot express. */
function crossValidate(key: SettingKey, v: Record<string, unknown>) {
  const issue = (path: string, message: string) => {
    throw new AppError('VALIDATION', message, { issues: [{ path, message }] });
  };
  if ('minBet' in v && 'maxBet' in v && (v.minBet as number) > (v.maxBet as number)) {
    issue('minBet', 'Minimum wager cannot exceed the maximum wager.');
  }
  if (key === 'game.roulette') {
    const r = v as SettingValue<'game.roulette'>;
    if (r.maxStraightBet > r.maxBet) issue('maxStraightBet', 'Straight-up maximum cannot exceed the table maximum.');
    if (r.maxOutsideBet > r.maxBet) issue('maxOutsideBet', 'Outside-bet maximum cannot exceed the table maximum.');
    if (r.maxStraightBet < r.minBet) issue('maxStraightBet', 'Straight-up maximum must be at least the table minimum.');
  }
  if (key === 'game.crash') {
    const c = v as SettingValue<'game.crash'>;
    if (c.maxAutoCashoutX100 < 101) issue('maxAutoCashoutX100', 'Max auto cash-out must be above 1.01×.');
  }
  if (key === 'game.slots') {
    const s = v as SettingValue<'game.slots'>;
    if (s.betLevels.length < 1 || s.betLevels.length > 20) issue('betLevels', 'Provide between 1 and 20 bet levels.');
    if (new Set(s.betLevels).size !== s.betLevels.length) issue('betLevels', 'Bet levels must be unique.');
    for (const id of Object.keys(s.machines)) {
      if (!(KNOWN_SLOT_MACHINES as readonly string[]).includes(id)) issue('machines', `Unknown slot machine "${id}".`);
    }
  }
  if (key === 'rewards') {
    const r = v as SettingValue<'rewards'>;
    if (r.refillAmount > 0 && r.refillThreshold === 0) issue('refillThreshold', 'Refill threshold must be above zero when refills are enabled.');
  }
}

export async function getAllSettings(actor: Actor) {
  requireRole(actor, 'ADMIN');
  const rows = await prisma.siteSetting.findMany({ where: { key: { in: SETTING_KEYS } } });
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const updaterIds = [...new Set(rows.map((r) => r.updatedBy).filter((x): x is string => !!x))];
  const updaters = updaterIds.length
    ? await prisma.user.findMany({ where: { id: { in: updaterIds } }, select: { id: true, username: true } })
    : [];
  const names = new Map(updaters.map((u) => [u.id, u.username]));
  return Object.fromEntries(
    SETTING_KEYS.map((k) => {
      const row = byKey.get(k);
      return [
        k,
        {
          value: parseStored(k, row?.value),
          defaults: SETTINGS[k].parse({}),
          updatedAt: row?.updatedAt.toISOString() ?? null,
          updatedBy: row?.updatedBy ? (names.get(row.updatedBy) ?? row.updatedBy) : null,
        },
      ];
    }),
  ) as { [K in SettingKey]: { value: SettingValue<K>; defaults: SettingValue<K>; updatedAt: string | null; updatedBy: string | null } };
}

export type AdminSettings = Awaited<ReturnType<typeof getAllSettings>>;

/**
 * Validate + save a settings patch. The read, write and audit row happen in
 * one transaction (row-locked via SELECT … FOR UPDATE on the setting) so two
 * admins saving at once cannot lose an update or an audit entry.
 */
export async function updateSettings<K extends SettingKey>(
  actor: Actor,
  key: K,
  patch: unknown,
  reasonRaw: string,
  ctx: Omit<AuditContext, 'reason'> = {},
) {
  requireRole(actor, 'ADMIN');
  if (!SETTING_KEYS.includes(key)) throw new AppError('VALIDATION', 'Unknown setting');
  const reason = cleanReason(reasonRaw);
  const schema = SETTINGS[key] as unknown as z.ZodObject<z.ZodRawShape>;
  const parsedPatch = schema.partial().strict().safeParse(patch ?? {});
  if (!parsedPatch.success) {
    const first = parsedPatch.error.issues[0];
    throw new AppError('VALIDATION', first ? `${first.path.join('.') || 'value'}: ${first.message}` : 'Invalid settings', {
      issues: parsedPatch.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const result = await transaction(async (tx) => {
    await tx.$queryRaw`SELECT key FROM "SiteSetting" WHERE key = ${key} FOR UPDATE`;
    const row = await tx.siteSetting.findUnique({ where: { key } });
    const before = parseStored(key, row?.value);
    // zod fills defaults for absent keys even under .partial(); only apply the keys actually supplied.
    const supplied = Object.fromEntries(
      Object.entries(parsedPatch.data as Record<string, unknown>).filter(([k]) => Object.prototype.hasOwnProperty.call(patch, k)),
    );
    const merged = SETTINGS[key].safeParse({ ...(before as object), ...supplied });
    if (!merged.success) {
      const first = merged.error.issues[0];
      throw new AppError('VALIDATION', first?.message ?? 'Invalid settings');
    }
    const after = merged.data as SettingValue<K>;
    crossValidate(key, after as Record<string, unknown>);
    if (JSON.stringify(after) === JSON.stringify(before)) {
      return { before, after, changed: false };
    }
    await tx.siteSetting.upsert({
      where: { key },
      create: { key, value: after as object, updatedBy: actor.id },
      update: { value: after as object, updatedBy: actor.id },
    });
    await writeAudit(tx, actor, { action: 'SETTINGS_UPDATE', targetType: 'SETTING', targetId: key, before, after }, { reason, ip: ctx.ip });
    return { before, after, changed: true };
  });
  invalidateSettings();
  if (result.changed && key === 'system') {
    await emitToAll('site:update', {});
  }
  return result;
}
