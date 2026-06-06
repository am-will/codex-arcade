import { expect, test } from '@playwright/test';

test('renders the scaffolded Phaser canvas', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('Sama v Amodi');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(300);
  expect(box?.height).toBeGreaterThan(160);
  expect((box?.width ?? 0) / (box?.height ?? 1)).toBeGreaterThan(1.4);
});
