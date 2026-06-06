import { expect, test } from '@playwright/test';

type MenuFlowState = {
  readonly scene?: string;
  readonly playableModes?: readonly string[];
  readonly hasOneVsOneOption?: boolean;
  readonly labels?: readonly string[];
  readonly selectedCpuId?: string;
  readonly matchConfig?: {
    readonly stageId?: string;
    readonly playerCharacterId?: string;
    readonly cpuCharacterId?: string;
    readonly roundsToWin?: number;
    readonly roundTimeSeconds?: number;
  };
};

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

test('launches placeholder match through the 1vCPU-only menu flow', async ({ page }) => {
  await page.goto('/');
  const readMenuFlowState = (): Promise<MenuFlowState | undefined> =>
    page.evaluate(() => {
      const host = globalThis as typeof globalThis & { __SAMA_V_AMODI_MENU_FLOW__?: MenuFlowState };
      return host.__SAMA_V_AMODI_MENU_FLOW__;
    });
  const readScene = (): Promise<string | undefined> => readMenuFlowState().then((state) => state?.scene);

  await expect.poll(readScene).toBe('MainMenu');

  const mainMenuState = await readMenuFlowState();
  expect(mainMenuState?.playableModes).toEqual(['1vCPU']);
  expect(mainMenuState?.hasOneVsOneOption).toBe(false);
  expect(mainMenuState?.labels?.join(' ')).not.toMatch(/1v1|1 v 1|versus player/i);

  await page.keyboard.press('Enter');
  await expect.poll(readScene).toBe('StageSelect');

  await page.keyboard.press('Enter');
  await expect.poll(readScene).toBe('CharacterSelect');

  const characterSelectState = await readMenuFlowState();
  expect(characterSelectState?.labels).toEqual(['Sama', 'Amodi']);
  expect(characterSelectState?.selectedCpuId).toBe('amodi');

  await page.keyboard.press('Enter');
  await expect.poll(readScene).toBe('Placeholder');

  const launchState = await readMenuFlowState();
  expect(launchState?.matchConfig).toMatchObject({
    stageId: 'byte-boardroom',
    playerCharacterId: 'sama',
    cpuCharacterId: 'amodi',
    roundsToWin: 2,
    roundTimeSeconds: 60,
  });
});
