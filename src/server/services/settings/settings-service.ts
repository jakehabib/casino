import { prisma, type Tx } from '@/server/db';
import { SETTINGS, type SettingKey, type SettingValue } from './schemas';
import { logger } from '@/server/logger';

const TTL_MS = 2_000;
const g = globalThis as unknown as { __novaSettingsCache?: Map<string, { at: number; value: unknown }> };
const cache = (g.__novaSettingsCache ??= new Map());

function parse<K extends SettingKey>(key: K, raw: unknown): SettingValue<K> {
  const schema = SETTINGS[key];
  const res = schema.safeParse(raw ?? {});
  if (res.success) return res.data as SettingValue<K>;
  logger.warn({ key, issues: res.error.issues }, 'invalid stored setting, using defaults');
  return schema.parse({}) as SettingValue<K>;
}

/**
 * Read a setting (2s in-process cache). Inside a transaction ALWAYS pass the
 * transaction client: using the global client while holding a row lock can
 * starve the connection pool under concurrency.
 */
export async function getSetting<K extends SettingKey>(key: K, db?: Tx): Promise<SettingValue<K>> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as SettingValue<K>;
  const row = await (db ?? prisma).siteSetting.findUnique({ where: { key } });
  const value = parse(key, row?.value);
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function defaultSetting<K extends SettingKey>(key: K): SettingValue<K> {
  return SETTINGS[key].parse({}) as SettingValue<K>;
}

export async function setSetting<K extends SettingKey>(key: K, patch: Partial<SettingValue<K>>, updatedBy?: string) {
  const current = await getSetting(key);
  const next = SETTINGS[key].parse({ ...current, ...patch }) as SettingValue<K>;
  await prisma.siteSetting.upsert({
    where: { key },
    create: { key, value: next as object, updatedBy },
    update: { value: next as object, updatedBy },
  });
  cache.delete(key);
  return { before: current, after: next };
}

export function invalidateSettings() {
  cache.clear();
}
