import { test, expect, balanceOf, expectHeaderBalance } from './fixtures';

test('Play Roulette: bet Red, spin, land on forced 32 and get paid', async ({ page, context, player, dev }) => {
  void player;
  await dev.force('roulette', { number: 32 }); // 32 is red
  const before = await balanceOf(context.request);

  await page.goto('/casino/roulette');
  const spin = page.getByTestId('roulette-spin');
  await expect(spin).toBeVisible();

  await page.getByRole('radiogroup', { name: 'Chip value' }).first().getByRole('radio').first().click();
  const red = page.getByRole('button', { name: /^Red, pays/ });
  await red.click();
  await expect(red).toHaveAttribute('aria-label', /placed/);
  const stake = Number((await red.getAttribute('aria-label'))!.match(/, ([\d,]+) placed/)![1].replace(/,/g, ''));
  expect(stake).toBeGreaterThan(0);

  const res = page.waitForResponse((r) => r.url().includes('/api/games/roulette/spin'));
  await expect(spin).toBeEnabled();
  await spin.click();
  expect((await res).status()).toBe(200);

  await expect(page.getByTestId('roulette-result')).toHaveText('32', { timeout: 30_000 });
  await expectHeaderBalance(page, before + stake);
  expect(await balanceOf(context.request)).toBe(before + stake);
});
