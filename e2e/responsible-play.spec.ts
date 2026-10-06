import { test, expect, apiPost, balanceOf, rid } from './fixtures';

test.describe('Responsible play', () => {
  test('Set Daily Wager Limit: lowering from "no limit" applies immediately', async ({ page, player }) => {
    void player;
    await page.goto('/responsible-play');
    await expect(page.getByTestId('current-DAILY_WAGER')).toHaveText('No limit');

    await page.getByTestId('input-DAILY_WAGER').fill('1000');
    await expect(page.getByText('More restrictive — applies immediately.')).toBeVisible();
    const save = page.getByTestId('save-DAILY_WAGER');
    await expect(save).toHaveText('Apply limit now');
    await save.click();

    await expect(page.getByText('Limit updated')).toBeVisible();
    await expect(page.getByTestId('current-DAILY_WAGER')).toHaveText('1,000');
    await page.reload();
    await expect(page.getByTestId('current-DAILY_WAGER')).toHaveText('1,000');
  });

  test('Trigger Limit: a wager above the daily limit is rejected with a friendly message', async ({ page, context, baseURL, player }) => {
    void player;
    await apiPost(context.request, baseURL!, '/api/responsible-play/limits', { limitType: 'DAILY_WAGER', value: 500 });
    const before = await balanceOf(context.request);

    await page.goto('/casino/blackjack');
    const betInput = page.getByLabel('Bet amount').first();
    await betInput.fill('1000');
    await betInput.press('Enter');
    await expect(betInput).toHaveValue('1,000');

    const res = page.waitForResponse((r) => r.url().includes('/api/games/blackjack/deal'));
    await page.getByTestId('bj-deal').click();
    const body = await (await res).json();
    expect(body.error.code).toBe('DAILY_WAGER_LIMIT');

    await expect(page.getByText('Daily wager limit reached')).toBeVisible();
    await expect(page.getByText('500 Credits remaining today.', { exact: false })).toBeVisible();
    // No raw server error copy, no charge.
    expect(await balanceOf(context.request)).toBe(before);
    await expect(page.getByTestId('bj-deal')).toBeEnabled();
  });

  test('Activate Cooldown: a 24-hour break is confirmed and shown as the active restriction', async ({ page, player }) => {
    void player;
    await page.goto('/responsible-play');
    await page.getByTestId('option-COOLDOWN_24H').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Take a 24-hour break');
    const submit = dialog.getByTestId('exclusion-submit');
    await expect(submit).toBeDisabled();
    await dialog.getByTestId('exclusion-phrase').fill('confirm');
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(dialog).toBeHidden();
    const active = page.getByTestId('active-restriction');
    await expect(active).toContainText('Active now · Play disabled');
    await expect(active).toContainText('Casino play is disabled until');
    await expect(page.getByTestId('restriction-remaining')).toContainText(/\d/);
  });

  test('Confirm Game Access Blocked: game pages show PLAY CURRENTLY DISABLED during a break', async ({ page, context, baseURL, player }) => {
    void player;
    await apiPost(context.request, baseURL!, '/api/responsible-play/exclusions', { type: 'COOLDOWN_24H', confirmation: 'CONFIRM' });

    for (const path of ['/casino/roulette', '/casino/blackjack']) {
      await page.goto(path);
      const gate = page.getByTestId('play-disabled');
      await expect(gate).toBeVisible();
      await expect(gate.getByRole('heading', { name: /play currently disabled/i })).toBeVisible();
      await expect(gate).toContainText('You are taking a');
      await expect(page.getByTestId('roulette-spin').or(page.getByTestId('bj-deal'))).toHaveCount(0);
    }

    // Server enforces independently of the UI.
    const res = await context.request.post('/api/games/roulette/spin', {
      data: { bets: [{ type: 'RED', numbers: [], amount: 100 }], requestId: rid('spin') },
      headers: { Origin: new URL(baseURL!).origin, 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect((await res.json()).error.code).toBe('COOLDOWN_ACTIVE');
  });
});
