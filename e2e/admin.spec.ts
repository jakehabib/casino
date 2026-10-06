import { test, expect, registerViaApi, balanceOf, type Player } from './fixtures';
import type { Page } from '@playwright/test';

const ADMIN = { identifier: 'admin@nova.test', password: 'admin12345' };

async function loginAsAdmin(page: Page, next = '/admin') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email or username').fill(ADMIN.identifier);
  await page.getByLabel('Password').fill(ADMIN.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((u) => u.pathname === next);
}

test.describe('Admin', () => {
  test('Admin Login: an admin signs in and reaches the admin dashboard', async ({ page, context, request, baseURL }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Users' }).first()).toBeVisible();
    const me = await (await context.request.get('/api/me')).json();
    expect(['ADMIN', 'SUPER_ADMIN']).toContain(me.user.role);

    // A regular player (separate cookie jar) cannot reach the admin API.
    await registerViaApi({ request }, baseURL!, 'noadm');
    expect((await request.get('/api/admin/users')).status()).toBe(403);
  });

  test('Admin Adjust Balance: crediting a player updates their wallet through the ledger', async ({ page, request, baseURL }) => {
    const target: Player = await registerViaApi({ request }, baseURL!, 'adj');
    const before = await balanceOf(request);

    await loginAsAdmin(page, `/admin/users/${target.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(`@${target.username}`).first()).toBeVisible();

    await page.getByRole('button', { name: 'Adjust credits' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Adjust credits');
    await dialog.getByLabel('Amount').fill('12345');
    const confirm = dialog.getByRole('button', { name: 'Add credits' });
    await expect(confirm).toBeDisabled(); // reason required
    await dialog.getByLabel('Reason').fill('E2E goodwill credit');
    await expect(dialog).toContainText((before + 12_345).toLocaleString('en-US'));
    await confirm.click();

    await expect(dialog).toBeHidden();
    await expect(page.getByText('Balance adjusted')).toBeVisible();
    expect(await balanceOf(request)).toBe(before + 12_345);
  });
});
