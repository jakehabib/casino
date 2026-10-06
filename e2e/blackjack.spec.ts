import { test, expect, balanceOf, expectHeaderBalance } from './fixtures';

test('Play Blackjack: deal, stand and win against a dealer bust (forced shoe)', async ({ page, context, player, dev }) => {
  void player;
  // Deal order: player, dealer, player, dealer(hole), then draws.
  // Player T+Q = 20, dealer 9+7 = 16 → stands... dealer must hit 16 → K busts.
  await dev.force('blackjack', { cards: ['TS', '9H', 'QH', '7D', 'KC'] });
  const before = await balanceOf(context.request);

  await page.goto('/casino/blackjack');
  await expect(page.getByTestId('bj-table')).toBeVisible();
  const deal = page.getByTestId('bj-deal');
  await expect(deal).toBeEnabled();

  const bet = Number((await page.getByLabel('Bet amount').first().inputValue()).replace(/[^\d]/g, ''));
  expect(bet).toBeGreaterThan(0);

  const dealRes = page.waitForResponse((r) => r.url().includes('/api/games/blackjack/deal') && r.request().method() === 'POST');
  await deal.click();
  expect((await dealRes).status()).toBe(200);

  const stand = page.getByTestId('bj-stand');
  await expect(stand).toBeEnabled();
  const actRes = page.waitForResponse((r) => r.url().includes('/api/games/blackjack/action'));
  await stand.click();
  expect((await actRes).status()).toBe(200);

  const result = page.getByTestId('bj-round-result');
  await expect(result).toContainText('You win');
  await expect(result).toContainText(`+${bet.toLocaleString('en-US')}`);
  await expectHeaderBalance(page, before + bet);
  expect(await balanceOf(context.request)).toBe(before + bet);
});
