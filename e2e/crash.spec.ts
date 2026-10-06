import { test, expect, balanceOf } from './fixtures';

/**
 * Crash is a shared multiplayer loop, so the dev overrides are global:
 *   • the countdown is shortened (and restored afterwards);
 *   • the next round's crash point is forced to 20× so a manual cash-out is
 *     guaranteed to land well before the crash.
 * We wait until the forced point has been consumed by a newly created round,
 * then bet during that round's betting window.
 */
test('Bet and Cash Out Crash: bet in the betting window, cash out while running', async ({ page, context, player, dev }) => {
  void player;
  test.setTimeout(240_000);
  const initial = await dev.status();
  await dev.crashCountdown(8000);
  try {
    await page.goto('/casino/crash');
    await expect(page.getByTestId('crash-panel-0')).toBeVisible();

    await dev.force('crash', { crashPointX100: 2000 });
    // The forced point is consumed when the next round is created (after the current one crashes).
    await expect.poll(async () => (await dev.status()).forced.crash, { timeout: 150_000, intervals: [250] }).toBeNull();

    const before = await balanceOf(context.request);
    const panel = page.getByTestId('crash-panel-0');
    const bet = page.getByTestId('crash-bet-0');
    await expect(bet).toBeVisible({ timeout: 10_000 });
    const amount = Number((await panel.getByLabel('Bet amount').inputValue()).replace(/[^\d]/g, ''));
    await bet.click();
    await expect(panel.getByText('Waiting for launch…')).toBeVisible();

    const cashout = page.getByTestId('crash-cashout-0');
    await expect(cashout).toBeVisible({ timeout: 20_000 });
    await cashout.click();

    const won = panel.getByText(/Cashed out/);
    await expect(won).toBeVisible();
    await expect.poll(async () => balanceOf(context.request)).toBeGreaterThan(before - amount);
    const after = await balanceOf(context.request);
    // Cash-out at ≥ 1.00× returns at least the stake; with a 20× forced point and an immediate click, it is a profit or break-even.
    expect(after).toBeGreaterThanOrEqual(before);
  } finally {
    await dev.crashCountdown(initial.crashCountdownMs);
  }
});
