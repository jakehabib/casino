import { test, expect, uniqueName, PASSWORD, registerViaApi, balanceOf, expectHeaderBalance } from './fixtures';

test.describe('Authentication', () => {
  test('Register: a new player can create an account and lands in the lobby signed in', async ({ page, context }) => {
    const username = uniqueName('reg');
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();

    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Email').fill(`${username}@e2e.nova.test`);
    await page.getByLabel('Password').fill(PASSWORD);

    // Submitting without acknowledging play-money terms is refused client-side.
    await page.getByRole('button', { name: /Create account/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Credits have no value' })).toBeVisible();

    await page.getByTestId('accept-terms').click();
    await expect(page.getByTestId('accept-terms')).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: /Create account/ }).click();

    await page.waitForURL((u) => u.pathname === '/');
    await expect(page.getByTestId('balance')).toBeVisible();

    // Server agrees: session exists and the sign-up grant landed.
    const balance = await balanceOf(context.request);
    expect(balance).toBeGreaterThan(0);
    await expectHeaderBalance(page, balance);
  });

  test('Login: an existing player signs in with username and password', async ({ page, context, baseURL }) => {
    const player = await registerViaApi(context, baseURL!, 'login');
    await context.clearCookies();

    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    // Wrong password → friendly error, no session.
    await page.getByLabel('Email or username').fill(player.username);
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: /\w/ })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel('Password').fill(player.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL((u) => u.pathname === '/');
    await expect(page.getByTestId('balance')).toBeVisible();

    const me = await (await context.request.get('/api/me')).json();
    expect(me.user.username).toBe(player.username);
  });
});
