import { test, expect, balanceOf, expectHeaderBalance } from './fixtures';

test('Play Baccarat: bet Player and win with a natural 9 (forced cards)', async ({ page, context, player, dev }) => {
  void player;
  // Deal order P, B, P, B → Player 9+K = 9 (natural), Banker 2+3 = 5.
  await dev.force('baccarat', { cards: ['9S', '2H', 'KD', '3C'] });
  const before = await balanceOf(context.request);

  await page.goto('/casino/baccarat');
  await expect(page.getByTestId('bac-table')).toBeVisible();

  // Choose the 100 chip and place it on Player.
  await page.getByRole('radiogroup', { name: 'Chip value' }).getByRole('radio').first().click();
  const zone = page.getByTestId('bac-zone-player');
  await expect(zone).toBeEnabled();
  await zone.click();
  await expect(zone).toHaveAttribute('aria-label', /current bet \d+/);
  const stake = Number((await zone.getAttribute('aria-label'))!.match(/current bet (\d+)/)![1]);

  const dealRes = page.waitForResponse((r) => r.url().includes('/api/games/baccarat/deal'));
  await page.getByTestId('bac-deal').click();
  expect((await dealRes).status()).toBe(200);

  const table = page.getByTestId('bac-table');
  await expect(table.getByText('Player wins')).toBeVisible({ timeout: 30_000 });
  await expect(table.getByText('9 – 5')).toBeVisible();
  await expect(table.getByText(`+${stake.toLocaleString('en-US')}`).first()).toBeVisible();
  await expectHeaderBalance(page, before + stake);
  await expect(page.getByTestId('bac-bead-plate')).toBeVisible();
});
