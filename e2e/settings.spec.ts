import { test, expect } from './fixtures';

const readPrefs = (page: import('@playwright/test').Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('nova.audio.v1') ?? '{}') as { muted?: boolean; master?: number });

test('Change Sound Settings: volume and mute persist and apply to game pages', async ({ page, player }) => {
  void player;
  await page.goto('/settings');
  const sound = page.getByTestId('settings-sound');
  await expect(sound).toBeVisible();

  // Master volume: keyboard-drive the slider down to 0 then up by 3 steps.
  const master = sound.getByRole('slider', { name: 'Master volume' });
  await master.focus();
  await master.press('Home');
  for (let i = 0; i < 3; i++) await master.press('ArrowRight');
  await expect(master).toHaveAttribute('aria-valuenow', '3');
  await expect(sound.getByText('3%', { exact: true })).toBeVisible();
  await expect.poll(async () => (await readPrefs(page)).master).toBeCloseTo(0.03);

  // Mute all.
  const mute = sound.getByRole('switch', { name: 'Mute all sounds' });
  await expect(mute).toHaveAttribute('aria-checked', 'false');
  await mute.click();
  await expect(mute).toHaveAttribute('aria-checked', 'true');
  await expect(sound.getByTestId('test-sound')).toBeDisabled();
  await expect.poll(async () => (await readPrefs(page)).muted).toBe(true);

  // Persisted across reloads…
  await page.reload();
  await expect(page.getByTestId('settings-sound').getByRole('switch', { name: 'Mute all sounds' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('settings-sound').getByRole('slider', { name: 'Master volume' })).toHaveAttribute('aria-valuenow', '3');

  // …and reflected by the in-game mute control, which can toggle it back.
  await page.goto('/casino/roulette');
  const gameMute = page.getByTestId('game-mute');
  await expect(gameMute).toHaveAccessibleName('Unmute sound');
  await gameMute.click();
  await expect(gameMute).toHaveAccessibleName('Mute sound');
  await expect.poll(async () => (await readPrefs(page)).muted).toBe(false);
});
