import { test, expect, balanceOf, expectHeaderBalance } from './fixtures';

/**
 * One paid spin on each machine. Outcomes are forced to LOSS so the expected
 * balance is exact. Assertions use only the shared slot hooks (slot-stage,
 * slot-spin) and the server response, so they survive theme restyles.
 */
const SLOTS = ['gilded-vault', 'overcharge', 'starforged-relics'] as const;

test.describe('Spin all three slots', () => {
  for (const slotId of SLOTS) {
    test(`Spin ${slotId}`, async ({ page, context, player, dev }) => {
      void player;
      await dev.force('slots', { slotId, trigger: 'LOSS' });
      const before = await balanceOf(context.request);

      await page.goto(`/casino/slots/${slotId}`);
      await expect(page.getByTestId('slot-stage')).toBeVisible({ timeout: 30_000 });
      const spin = page.getByTestId('slot-spin').filter({ visible: true });
      await expect(spin).toBeEnabled({ timeout: 30_000 });

      const resP = page.waitForResponse((r) => r.url().includes(`/api/games/slots/${slotId}/spin`) && r.request().method() === 'POST');
      await spin.click();
      const res = await resP;
      expect(res.status()).toBe(200);
      const body = (await res.json()) as { spin: { bet: number; payout: number; forced: boolean; isFreeSpin: boolean }; balance: number };
      expect(body.spin.forced).toBe(true);
      expect(body.spin.isFreeSpin).toBe(false);
      expect(body.spin.bet).toBeGreaterThan(0);
      expect(body.spin.payout).toBe(0);
      expect(body.balance).toBe(before - body.spin.bet);

      // The reels settle and the machine is ready for another spin; the header shows server truth.
      await expect(spin).toBeEnabled({ timeout: 30_000 });
      await expectHeaderBalance(page, before - body.spin.bet);
      expect(await balanceOf(context.request)).toBe(before - body.spin.bet);
    });
  }
});
