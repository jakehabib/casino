import { test, expect, balanceOf, expectHeaderBalance } from './fixtures';

test('Claim Credits: daily reward is credited once and then cools down', async ({ page, context, player }) => {
  void player;
  const before = await balanceOf(context.request);

  await page.goto('/rewards');
  const daily = page.getByTestId('reward-daily');
  await expect(daily).toContainText('Ready to claim');
  const claim = daily.getByRole('button', { name: /^Claim / });
  const amount = Number((await claim.innerText()).replace(/[^\d]/g, ''));
  expect(amount).toBeGreaterThan(0);

  await claim.click();

  await expect(daily.getByRole('button', { name: 'Claimed' })).toBeDisabled();
  await expect(daily).toContainText('Next claim in');
  await expectHeaderBalance(page, before + amount);
  expect(await balanceOf(context.request)).toBe(before + amount);

  // Reload: state is server-backed, not optimistic.
  await page.reload();
  await expect(page.getByTestId('reward-daily').getByRole('button', { name: 'Claimed' })).toBeDisabled();
});
