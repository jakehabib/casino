/**
 * Normalise a configured public URL (APP_URL). Tolerates common deployment
 * mistakes: surrounding spaces/quotes, a missing scheme
 * ("casino.up.railway.app"), trailing slashes or paths. Returns the origin
 * (e.g. "https://casino.up.railway.app") or null if it cannot be parsed.
 */
export function normalizeAppUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let v = raw.trim().replace(/^['"]|['"]$/g, '').trim();
  if (!v) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.origin;
  } catch {
    return null;
  }
}
