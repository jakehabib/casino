import { test, expect } from './fixtures';

test('Mobile smoke @mobile: lobby, bottom nav and chat drawer at 390px', async ({ page, player }) => {
  void player;
  await page.goto('/');
  expect(page.viewportSize()?.width).toBe(390);

  // Lobby renders game tiles; the desktop sidebar and chat panel are not shown.
  await expect(page.locator('[data-testid^="game-tile-"]').first()).toBeVisible();
  await expect(page.getByTestId('balance')).toBeVisible();
  await expect(page.getByTestId('chat-panel-panel')).toBeHidden();

  // No horizontal overflow at phone width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  // Bottom navigation.
  const nav = page.getByRole('navigation', { name: 'Mobile' });
  await expect(nav).toBeVisible();
  for (const name of ['Menu', 'Casino', 'Rewards', 'History', 'Chat']) await expect(nav.getByText(name, { exact: true })).toBeVisible();
  await nav.getByRole('link', { name: 'Casino' }).click();
  await page.waitForURL('**/casino');
  await expect(nav.getByRole('link', { name: 'Casino' })).toHaveClass(/text-accent/);

  // Menu drawer.
  await nav.getByRole('button', { name: 'Menu' }).click();
  const menu = page.getByRole('dialog', { name: 'Menu' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Blackjack' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();

  // Chat drawer.
  await page.getByTestId('mobile-chat-button').click();
  const drawer = page.getByTestId('chat-panel-drawer');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByTestId('chat-log')).toBeVisible();
  await expect(drawer.getByTestId('chat-input')).toBeEnabled();
  await drawer.getByRole('button', { name: 'Close chat' }).click();
  await expect(drawer).toBeHidden();
});
