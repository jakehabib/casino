import { defineConfig, devices } from '@playwright/test';

/**
 * E2E suite. By default it boots its own server on :3300 (separate dist dir)
 * against the development database. Set E2E_BASE_URL to target a running app.
 */
const PORT = Number(process.env.E2E_PORT ?? 3300);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || (process.env.PLAYWRIGHT_BROWSERS_PATH === '/opt/pw-browsers' ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, grepInvert: /@mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } }, grep: /@mobile/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `NEXT_DIST_DIR=.next-e2e PORT=${PORT} APP_URL=${baseURL} ENABLE_DEV_TOOLS=true npx tsx server.ts`,
        url: `${baseURL}/api/health`,
        timeout: 180_000,
        reuseExistingServer: true,
      },
});
