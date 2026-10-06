import { test, expect, registerViaApi, apiPost, rid } from './fixtures';

test('View Player Profile: a player opens another player’s public profile', async ({ page, player, request, baseURL }) => {
  void player;
  // A second, independent player with one settled round so their stats are non-empty.
  const other = await registerViaApi({ request }, baseURL!, 'prof');
  await apiPost(request, baseURL!, '/api/games/roulette/spin', { bets: [{ type: 'RED', numbers: [], amount: 100 }], requestId: rid('spin') });

  await page.goto(`/u/${other.username}`);
  const profile = page.getByTestId('public-profile');
  await expect(profile).toBeVisible();
  const hero = profile.getByTestId('profile-hero');
  await expect(hero).toContainText(`@${other.username}`, { ignoreCase: true });

  // Unknown players get a native not-found state, not an error page.
  await page.goto('/u/zz_no_such_player_x');
  await expect(page.getByText('There’s no player called @zz_no_such_player_x.')).toBeVisible();
});

test('View own profile: the profile page shows the signed-in player and XP progress', async ({ page, player }) => {
  await page.goto('/profile');
  const own = page.getByTestId('own-profile');
  await expect(own).toBeVisible();
  await expect(own.getByTestId('profile-hero')).toContainText(player.username, { ignoreCase: true });
  await expect(own.getByTestId('xp-progress')).toBeVisible();
});
