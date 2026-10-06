import { test, expect, apiPost, rid } from './fixtures';

test('View History: settled rounds are listed and open into a detail view', async ({ page, context, baseURL, player, dev }) => {
  void player;
  // Fresh account: empty state first.
  await page.goto('/history');
  await expect(page.getByText('No rounds played yet')).toBeVisible();

  // One forced roulette round (17 = black, our Red bet loses) played through the API.
  await dev.force('roulette', { number: 17 });
  await apiPost(context.request, baseURL!, '/api/games/roulette/spin', { bets: [{ type: 'RED', numbers: [], amount: 250 }], requestId: rid('spin') });

  await page.reload();
  const rows = page.getByTestId('history-rows');
  await expect(rows).toBeVisible();
  const row = rows.getByRole('button').filter({ hasText: 'Roulette' });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('250');

  await row.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('round-detail')).toBeVisible();
  await expect(dialog).toContainText('17');
});
