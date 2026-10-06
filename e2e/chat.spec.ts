import { test, expect } from './fixtures';

test.describe('Chat', () => {
  test('Open Chat: the global chat panel can be hidden and reopened from the top bar', async ({ page, player }) => {
    void player;
    await page.goto('/');
    const panel = page.getByTestId('chat-panel-panel');
    // Make the starting state explicit (the open/closed preference is persisted per device).
    if (await page.getByRole('button', { name: 'Show chat' }).isVisible()) await page.getByRole('button', { name: 'Show chat' }).click();
    await expect(panel).toBeVisible();

    await page.getByRole('button', { name: 'Hide chat' }).first().click();
    await expect(panel).toBeHidden();

    await page.getByRole('button', { name: 'Show chat' }).click();
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Global')).toBeVisible();
    await expect(panel.getByTestId('chat-log')).toBeVisible();
    await expect(panel.getByTestId('chat-input')).toBeEnabled();
  });

  test('Send Message: a signed-in player posts a message and sees it in the log', async ({ page, player }) => {
    await page.goto('/');
    const panel = page.getByTestId('chat-panel-panel');
    if (await page.getByRole('button', { name: 'Show chat' }).isVisible()) await page.getByRole('button', { name: 'Show chat' }).click();
    const input = panel.getByTestId('chat-input');
    await expect(input).toBeEnabled();

    const text = `hello from e2e ${Date.now().toString(36)}`;
    await input.fill(text);
    await expect(panel.getByTestId('chat-send')).toBeEnabled();
    await panel.getByTestId('chat-send').click();

    const mine = panel.getByTestId('chat-message').filter({ hasText: text });
    await expect(mine).toBeVisible();
    await expect(mine).toContainText(player.username, { ignoreCase: true });
    await expect(input).toHaveValue('');

    // Persisted server-side: still there after a reload.
    await page.reload();
    await expect(page.getByTestId('chat-panel-panel').getByTestId('chat-message').filter({ hasText: text })).toBeVisible();
  });
});
