import { test as base, expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';

/**
 * Shared E2E fixtures.
 *
 * Every test gets its own browser context with:
 *   • a unique X-Forwarded-For address, so per-IP rate limits (register: 5 per
 *     10 min, login: 20 per 5 min) never couple independent tests or reruns;
 *   • prefers-reduced-motion, which the app honours globally (MotionConfig
 *     reducedMotion="user" + useReducedMotion in canvas games) — this keeps
 *     reveal animations short without changing any game logic.
 *
 * `player` registers a brand-new account through the public API inside the
 * page's context (cookies are shared), so each test starts from a clean user
 * with the standard sign-up grant.
 */

export const PASSWORD = 'e2e-password-123';

export interface Player {
  id: string;
  username: string;
  email: string;
  password: string;
}

export function uniqueName(prefix = 'e2e') {
  // Usernames are max 20 chars, [A-Za-z0-9_].
  return `${prefix}_${Date.now().toString(36)}${randomBytes(2).toString('hex')}`.slice(0, 20);
}

function fakeIp() {
  const b = randomBytes(3);
  return `10.${b[0]}.${b[1]}.${b[2]}`;
}

/** Headers for state-changing requests (the API enforces same-origin + JSON). */
function mutationHeaders(baseURL: string) {
  return { Origin: new URL(baseURL).origin, 'Content-Type': 'application/json' };
}

export async function apiPost<T = unknown>(req: APIRequestContext, baseURL: string, url: string, data: unknown = {}): Promise<T> {
  const res = await req.post(url, { data, headers: mutationHeaders(baseURL) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok()) throw new Error(`POST ${url} → ${res.status()} ${JSON.stringify(body)}`);
  return body as T;
}

export async function apiGet<T = unknown>(req: APIRequestContext, url: string): Promise<T> {
  const res = await req.get(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok()) throw new Error(`GET ${url} → ${res.status()} ${JSON.stringify(body)}`);
  return body as T;
}

export function rid(prefix = 'e2e') {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

/** Register a fresh account and sign the given context in as it. */
export async function registerViaApi(context: BrowserContext, baseURL: string, prefix = 'e2e'): Promise<Player> {
  const username = uniqueName(prefix);
  const email = `${username}@e2e.nova.test`;
  const res = await apiPost<{ ok: boolean; userId: string }>(context.request, baseURL, '/api/auth/register', {
    username,
    email,
    password: PASSWORD,
    timezone: 'UTC',
    acceptTerms: true,
  });
  return { id: res.userId, username: username.toLowerCase(), email, password: PASSWORD };
}

/** Thin client for the dev panel APIs (src/app/api/dev). */
export function devTools(req: APIRequestContext, baseURL: string) {
  return {
    force: (game: 'blackjack' | 'baccarat' | 'roulette' | 'crash' | 'slots', value: unknown) => apiPost(req, baseURL, '/api/dev/force', { game, value }),
    status: () => apiGet<{ balance: number; forced: Record<string, unknown>; crashCountdownMs: number | null }>(req, '/api/dev/status'),
    crashCountdown: (ms: number | null) => apiPost(req, baseURL, '/api/dev/crash-countdown', { ms }),
    resetResponsiblePlay: () => apiPost(req, baseURL, '/api/dev/responsible-play/reset', {}),
    resetRewards: () => apiPost(req, baseURL, '/api/dev/rewards/reset', {}),
    grant: (amount: number) => apiPost(req, baseURL, '/api/dev/wallet', { op: 'grant', amount, requestId: rid('grant') }),
  };
}

export async function balanceOf(req: APIRequestContext): Promise<number> {
  const me = await apiGet<{ balance: number }>(req, '/api/me');
  return me.balance;
}

/** Parse the header balance pill ("100,000" → 100000). */
export async function headerBalance(page: Page): Promise<number> {
  // First .tabular span is the AnimatedNumber; a transient "+delta" span may follow it.
  const txt = (await page.getByTestId('balance').first().locator('span.tabular').first().innerText()).replace(/[^\d]/g, '');
  return Number(txt);
}

/** Wait until the header balance pill settles on an exact value. */
export async function expectHeaderBalance(page: Page, value: number) {
  await expect.poll(() => headerBalance(page), { timeout: 20_000 }).toBe(value);
}

type Fixtures = {
  player: Player;
  dev: ReturnType<typeof devTools>;
};

export const test = base.extend<Fixtures>({
  reducedMotion: async ({}, use) => use('reduce'),
  extraHTTPHeaders: async ({}, use) => use({ 'X-Forwarded-For': fakeIp() }),
  player: async ({ context, baseURL }, use) => {
    await use(await registerViaApi(context, baseURL!));
  },
  dev: async ({ context, baseURL }, use) => {
    await use(devTools(context.request, baseURL!));
  },
});

export { expect };
