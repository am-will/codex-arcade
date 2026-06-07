import { expect, type Page, test, type TestInfo } from '@playwright/test';
// @ts-expect-error Playwright runs this spec in Node, while the app tsconfig intentionally omits Node ambient types.
import { inflateSync as nodeInflateSync } from 'node:zlib';
import { TEST_HOOK_KEY, type SamaAmodiTestHooks, type TestHookInputAction, type TestHookMatchState } from '../src/game/testHooks';

const inflateSync: (data: Uint8Array) => Uint8Array = nodeInflateSync;
const PLAY_STAGE_IDS = ['neon-metropolis', 'tropic-cove'] as const;

type MenuFlowState = {
  readonly scene?: string;
  readonly playableModes?: readonly string[];
  readonly hasOneVsOneOption?: boolean;
  readonly labels?: readonly string[];
  readonly selectedStageId?: string;
  readonly selectedPlayerId?: string;
  readonly selectedCpuId?: string;
  readonly matchConfig?: {
    readonly stageId?: string;
    readonly playerCharacterId?: string;
    readonly cpuCharacterId?: string;
    readonly roundsToWin?: number;
    readonly roundTimeSeconds?: number;
  };
};

type CanvasMetrics = {
  readonly width: number;
  readonly height: number;
  readonly opaquePixels: number;
  readonly distinctColorBuckets: number;
  readonly hudBrightPixels: number;
  readonly hudColorBuckets: number;
};

test('renders readable desktop/mobile canvas and launches Match through the Play vs CPU menu flow', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page).toHaveTitle('MortalCodex');

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();

  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(300);
  expect(box?.height).toBeGreaterThan(160);
  expect((box?.width ?? 0) / (box?.height ?? 1)).toBeGreaterThan(1.4);

  await expect.poll(() => readScene(page)).toBe('MainMenu');

  const mainMenuState = await readMenuFlowState(page);
  expect(mainMenuState?.playableModes).toEqual(['Play vs CPU']);
  expect(mainMenuState?.hasOneVsOneOption).toBe(false);
  expect(mainMenuState?.labels?.join(' ')).not.toMatch(/1v1|1 v 1|versus player/i);

  await page.keyboard.press('Enter');
  await expect.poll(() => readScene(page)).toBe('CharacterSelect');

  const characterSelectState = await readMenuFlowState(page);
  expect(characterSelectState?.labels).toEqual(['Sama', 'Amodi']);
  expect(PLAY_STAGE_IDS).toContain(characterSelectState?.selectedStageId as (typeof PLAY_STAGE_IDS)[number]);
  expect(characterSelectState?.selectedPlayerId).toBe('sama');
  expect(characterSelectState?.selectedCpuId).toBe('amodi');

  await page.keyboard.press('Enter');
  await expect.poll(() => readScene(page)).toBe('Match');
  await waitForHooks(page);

  const launchState = await readMenuFlowState(page);
  expect(launchState?.matchConfig).toMatchObject({
    playerCharacterId: 'sama',
    cpuCharacterId: 'amodi',
    roundsToWin: 2,
    roundTimeSeconds: 60,
  });
  expect(PLAY_STAGE_IDS).toContain(launchState?.matchConfig?.stageId as (typeof PLAY_STAGE_IDS)[number]);

  await setDebugOverlay(page, true);
  await waitForFighting(page);

  const matchState = await readMatchState(page);
  expect(matchState).toMatchObject({
    phase: 'fighting',
    roundIndex: 1,
    player: { id: 'sama' },
    cpu: { id: 'amodi' },
  });
  expect(PLAY_STAGE_IDS).toContain(matchState?.stageId as (typeof PLAY_STAGE_IDS)[number]);
  expect(matchState?.timerSeconds).toBeGreaterThan(55);
  expect(matchState?.player.health).toBeGreaterThan(0);
  expect(matchState?.cpu.health).toBeGreaterThan(0);

  const screenshot = await attachCanvasScreenshot(page, testInfo, 'match-hud');
  const metrics = readCanvasMetrics(screenshot);
  expect(metrics.width).toBeGreaterThanOrEqual(640);
  expect(metrics.height).toBeGreaterThanOrEqual(360);
  expect(metrics.opaquePixels).toBeGreaterThan(metrics.width * metrics.height * 0.9);
  expect(metrics.distinctColorBuckets).toBeGreaterThan(24);
  expect(metrics.hudBrightPixels).toBeGreaterThan(30);
  expect(metrics.hudColorBuckets).toBeGreaterThan(10);
});

test('test hooks drive deterministic damage, block, and special behavior', async ({ page }) => {
  await launchMatchViaMenu(page);
  await setCpuEnabled(page, false);
  await movePlayerIntoRange(page);

  const beforeLight = await requireMatchState(page);
  await press(page, 'light');
  const afterLight = await waitForCpuHealthBelow(page, beforeLight.cpu.health);
  expect(afterLight.cpu.health).toBeLessThan(beforeLight.cpu.health);
  expect(afterLight.player.meter).toBeGreaterThan(beforeLight.player.meter);

  await waitFrames(page, 36);
  await startHookMatch(page, { seed: 17, match: { roundsToWin: 1, roundTimeSeconds: 30 } });
  await waitForFighting(page);
  await setCpuEnabled(page, false);
  await movePlayerIntoRange(page);
  await press(page, 'block');
  const guardReady = await requireMatchState(page);
  expect(guardReady.player.animation).toBe('block');
  expect(guardReady.player.frame).toBeGreaterThanOrEqual(1);
  await setCpuEnabled(page, true);

  const beforeBlock = await requireMatchState(page);
  const blockedState = await waitForPlayerHealthBelow(page, beforeBlock.player.health, 360);
  expect(blockedState.player.health).toBeLessThan(beforeBlock.player.health);
  expect(blockedState.player.health).toBeGreaterThanOrEqual(beforeBlock.player.health - 6);
  await release(page, 'block');
  await setCpuEnabled(page, false);

  await startHookMatch(page, { seed: 23, match: { roundsToWin: 1, roundTimeSeconds: 30 } });
  await waitForFighting(page);
  await setCpuEnabled(page, false);
  await movePlayerIntoRange(page);
  await forceMeter(page, 'sama', 100);
  await forceHealth(page, 'amodi', 15);

  const beforeSpecial = await requireMatchState(page);
  expect(beforeSpecial.player.meter).toBe(100);
  await press(page, 'special');
  const afterSpecial = await waitForCpuHealthBelow(page, beforeSpecial.cpu.health, 120);
  expect(afterSpecial.cpu.health).toBeLessThan(beforeSpecial.cpu.health);
  expect(afterSpecial.cpu.health).toBe(0);
  expect(afterSpecial.phase).toBe('fighting');
  expect(afterSpecial.player.animation).toBe('special');
  expect(afterSpecial.player.meter).toBeLessThan(beforeSpecial.player.meter);
  await waitForKnockdownBounce(page, 'cpu', afterSpecial.cpu.y);
});

test('timeout round-over reaches match-over and rematch resets state', async ({ page }) => {
  await launchMatchViaMenu(page);
  await startHookMatch(page, { seed: 31, match: { roundsToWin: 1, roundTimeSeconds: 15 } });
  await waitForFighting(page);
  await setCpuEnabled(page, false);
  await movePlayerIntoRange(page);

  const beforeDamage = await requireMatchState(page);
  await press(page, 'light');
  const damaged = await waitForCpuHealthBelow(page, beforeDamage.cpu.health);
  expect(damaged.cpu.health).toBeLessThan(beforeDamage.cpu.health);

  await forceRoundTimeout(page);
  await expect.poll(() => readMatchPhase(page)).toBe('roundOver');

  const roundOver = await requireMatchState(page);
  expect(roundOver.timerSeconds).toBe(0);
  expect(roundOver.winnerId).toBe('sama');

  await expect.poll(() => readMatchPhase(page), { timeout: 5_000 }).toBe('matchOver');
  await page.keyboard.press('KeyR');
  await expect.poll(() => readMatchPhase(page)).toBe('roundIntro');

  const rematch = await requireMatchState(page);
  expect(rematch).toMatchObject({
    roundIndex: 1,
    timerSeconds: 15,
    player: { id: 'sama', health: 100, meter: 0 },
    cpu: { id: 'amodi', health: 104, meter: 0 },
  });
  expect(rematch.winnerId).toBeUndefined();
});

async function launchMatchViaMenu(page: Page): Promise<void> {
  await page.goto('/');
  await expect.poll(() => readScene(page)).toBe('MainMenu');

  const mainMenuState = await readMenuFlowState(page);
  expect(mainMenuState?.playableModes).toEqual(['Play vs CPU']);
  expect(mainMenuState?.hasOneVsOneOption).toBe(false);
  expect(mainMenuState?.labels?.join(' ')).not.toMatch(/1v1|1 v 1|versus player/i);

  await page.keyboard.press('Enter');
  await expect.poll(() => readScene(page)).toBe('CharacterSelect');
  await page.keyboard.press('Enter');
  await expect.poll(() => readScene(page)).toBe('Match');
  await waitForHooks(page);
  await waitForFighting(page);
}

async function readMenuFlowState(page: Page): Promise<MenuFlowState | undefined> {
  return page.evaluate(() => {
    const host = globalThis as typeof globalThis & { __SAMA_V_AMODI_MENU_FLOW__?: MenuFlowState };
    return host.__SAMA_V_AMODI_MENU_FLOW__;
  });
}

async function readScene(page: Page): Promise<string | undefined> {
  return readMenuFlowState(page).then((state) => state?.scene);
}

async function waitForHooks(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const host = globalThis as unknown as Record<string, unknown>;
        return Boolean(host[key]);
      }, TEST_HOOK_KEY),
    )
    .toBe(true);
}

async function readMatchState(page: Page): Promise<TestHookMatchState | null> {
  return page.evaluate((key) => {
    const host = globalThis as unknown as Record<string, SamaAmodiTestHooks | undefined>;
    return host[key]?.getMatchState() ?? null;
  }, TEST_HOOK_KEY);
}

async function requireMatchState(page: Page): Promise<TestHookMatchState> {
  const state = await readMatchState(page);

  if (!state) {
    throw new Error('Expected Match hook state to be available.');
  }

  return state;
}

async function readMatchPhase(page: Page): Promise<TestHookMatchState['phase'] | undefined> {
  return readMatchState(page).then((state) => state?.phase);
}

async function waitForFighting(page: Page): Promise<void> {
  await expect.poll(() => readMatchPhase(page), { timeout: 5_000 }).toBe('fighting');
}

async function setCpuEnabled(page: Page, enabled: boolean): Promise<void> {
  await page.evaluate(
    ({ key, enabled: nextEnabled }) => {
      const host = globalThis as unknown as Record<string, SamaAmodiTestHooks | undefined>;
      host[key]?.setCpuEnabled(nextEnabled);
    },
    { key: TEST_HOOK_KEY, enabled },
  );
}

async function setDebugOverlay(page: Page, enabled: boolean): Promise<void> {
  await page.evaluate(
    ({ key, enabled: nextEnabled }) => {
      const host = globalThis as unknown as Record<string, SamaAmodiTestHooks | undefined>;
      host[key]?.setDebugOverlay(nextEnabled);
    },
    { key: TEST_HOOK_KEY, enabled },
  );
}

async function startHookMatch(page: Page, options: Parameters<SamaAmodiTestHooks['startMatch']>[0]): Promise<void> {
  await page.evaluate(
    ({ key, options: nextOptions }) => {
      const host = globalThis as unknown as Record<string, SamaAmodiTestHooks | undefined>;
      host[key]?.startMatch(nextOptions);
    },
    { key: TEST_HOOK_KEY, options },
  );
}

async function press(page: Page, action: TestHookInputAction, frames?: number): Promise<void> {
  await page.evaluate(
    ({ key, action: nextAction, frames: nextFrames }) => {
      const host = globalThis as unknown as Record<string, SamaAmodiTestHooks | undefined>;
      host[key]?.press(nextAction, nextFrames);
    },
    { key: TEST_HOOK_KEY, action, frames },
  );
}

async function release(page: Page, action: TestHookInputAction): Promise<void> {
  await page.evaluate(
    ({ key, action: nextAction }) => {
      const host = globalThis as unknown as Record<string, SamaAmodiTestHooks | undefined>;
      host[key]?.release(nextAction);
    },
    { key: TEST_HOOK_KEY, action },
  );
}

async function forceMeter(page: Page, characterId: string, meter: number): Promise<void> {
  await page.evaluate(
    ({ key, characterId: nextCharacterId, meter: nextMeter }) => {
      const host = globalThis as unknown as Record<string, SamaAmodiTestHooks | undefined>;
      host[key]?.forceMeter(nextCharacterId, nextMeter);
    },
    { key: TEST_HOOK_KEY, characterId, meter },
  );
}

async function forceHealth(page: Page, characterId: string, health: number): Promise<void> {
  await page.evaluate(
    ({ key, characterId: nextCharacterId, health: nextHealth }) => {
      const host = globalThis as unknown as Record<string, SamaAmodiTestHooks | undefined>;
      host[key]?.forceHealth(nextCharacterId, nextHealth);
    },
    { key: TEST_HOOK_KEY, characterId, health },
  );
}

async function forceRoundTimeout(page: Page): Promise<void> {
  await page.evaluate((key) => {
    const host = globalThis as unknown as Record<string, SamaAmodiTestHooks | undefined>;
    host[key]?.forceRoundTimeout();
  }, TEST_HOOK_KEY);
}

async function movePlayerIntoRange(page: Page): Promise<void> {
  await press(page, 'right', 118);
  await waitFrames(page, 126);
  await release(page, 'right');
}

async function waitForCpuHealthBelow(page: Page, health: number, maxFrames = 90): Promise<TestHookMatchState> {
  for (let frame = 0; frame < maxFrames; frame += 1) {
    await waitFrames(page, 1);
    const state = await requireMatchState(page);

    if (state.cpu.health < health) {
      return state;
    }
  }

  throw new Error(`Expected CPU health to drop below ${health}.`);
}

async function waitForPlayerHealthBelow(page: Page, health: number, maxFrames: number): Promise<TestHookMatchState> {
  for (let frame = 0; frame < maxFrames; frame += 1) {
    await waitFrames(page, 1);
    const state = await requireMatchState(page);

    if (state.player.health < health) {
      return state;
    }
  }

  throw new Error(`Expected player health to drop below ${health}.`);
}

async function waitForKnockdownBounce(page: Page, slot: 'player' | 'cpu', groundY: number): Promise<TestHookMatchState> {
  for (let frame = 0; frame < 240; frame += 1) {
    await waitFrames(page, 1);
    const state = await requireMatchState(page);
    const fighter = state[slot];

    if (state.phase === 'roundOver' && fighter.animation === 'knockdown' && fighter.y < groundY - 4) {
      return state;
    }
  }

  throw new Error(`Expected ${slot} to bounce into knockdown before landing.`);
}

async function waitFrames(page: Page, frames: number): Promise<void> {
  await page.evaluate(
    (frameCount) =>
      new Promise<void>((resolve) => {
        let remaining = frameCount;
        const tick = (): void => {
          remaining -= 1;

          if (remaining <= 0) {
            resolve();
            return;
          }

          requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
      }),
    frames,
  );
}

async function attachCanvasScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<Uint8Array> {
  const body = await page.locator('canvas').screenshot();
  await testInfo.attach(`${name}.png`, {
    body,
    contentType: 'image/png',
  });

  return body;
}

function readCanvasMetrics(png: Uint8Array): CanvasMetrics {
  const { width, height, rgba } = decodePngToRgba(png);
  let opaquePixels = 0;
  let hudBrightPixels = 0;
  const colorBuckets = new Set<string>();
  const hudBuckets = new Set<string>();
  const hudEndY = Math.floor(height * 0.22);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const red = rgba[index] ?? 0;
      const green = rgba[index + 1] ?? 0;
      const blue = rgba[index + 2] ?? 0;
      const alpha = rgba[index + 3] ?? 0;

      if (alpha > 8) {
        opaquePixels += 1;
      }

      if ((x + y) % 29 === 0 && alpha > 8) {
        colorBuckets.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
      }

      if (y <= hudEndY && alpha > 8) {
        if (red + green + blue > 420) {
          hudBrightPixels += 1;
        }

        if ((x + y) % 17 === 0) {
          hudBuckets.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
        }
      }
    }
  }

  return {
    width,
    height,
    opaquePixels,
    distinctColorBuckets: colorBuckets.size,
    hudBrightPixels,
    hudColorBuckets: hudBuckets.size,
  };
}

function decodePngToRgba(png: Uint8Array): { readonly width: number; readonly height: number; readonly rgba: Uint8Array } {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];

  for (const [index, byte] of signature.entries()) {
    if (png[index] !== byte) {
      throw new Error('Canvas screenshot was not a PNG.');
    }
  }

  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: Uint8Array[] = [];
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let offset = 8;

  while (offset < png.byteLength) {
    const length = view.getUint32(offset);
    offset += 4;
    const type = String.fromCharCode(png[offset] ?? 0, png[offset + 1] ?? 0, png[offset + 2] ?? 0, png[offset + 3] ?? 0);
    offset += 4;
    const dataStart = offset;
    offset += length;
    offset += 4;

    if (type === 'IHDR') {
      width = view.getUint32(dataStart);
      height = view.getUint32(dataStart + 4);
      bitDepth = png[dataStart + 8] ?? 0;
      colorType = png[dataStart + 9] ?? 0;
    } else if (type === 'IDAT') {
      chunks.push(png.slice(dataStart, dataStart + length));
    } else if (type === 'IEND') {
      break;
    }
  }

  if (width <= 0 || height <= 0 || bitDepth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG screenshot format: ${width}x${height}, bitDepth ${bitDepth}, colorType ${colorType}.`);
  }

  const compressed = concatChunks(chunks);
  const inflated = inflateSync(compressed);
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const rowLength = width * bytesPerPixel;
  const rgba = new Uint8Array(width * height * 4);
  let sourceOffset = 0;
  let previousRow = new Uint8Array(rowLength);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset] ?? 0;
    sourceOffset += 1;
    const row = new Uint8Array(rowLength);

    for (let x = 0; x < rowLength; x += 1) {
      const raw = inflated[sourceOffset + x] ?? 0;
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] ?? 0 : 0;
      const up = previousRow[x] ?? 0;
      const upLeft = x >= bytesPerPixel ? previousRow[x - bytesPerPixel] ?? 0 : 0;
      row[x] = (raw + pngFilterValue(filter, left, up, upLeft)) & 0xff;
    }

    sourceOffset += rowLength;

    for (let x = 0; x < width; x += 1) {
      const source = x * bytesPerPixel;
      const target = (y * width + x) * 4;
      rgba[target] = row[source] ?? 0;
      rgba[target + 1] = row[source + 1] ?? 0;
      rgba[target + 2] = row[source + 2] ?? 0;
      rgba[target + 3] = colorType === 6 ? row[source + 3] ?? 0 : 255;
    }

    previousRow = row;
  }

  return { width, height, rgba };
}

function concatChunks(chunks: readonly Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
}

function pngFilterValue(filter: number, left: number, up: number, upLeft: number): number {
  switch (filter) {
    case 0:
      return 0;
    case 1:
      return left;
    case 2:
      return up;
    case 3:
      return Math.floor((left + up) / 2);
    case 4:
      return paeth(left, up, upLeft);
    default:
      throw new Error(`Unsupported PNG filter ${filter}.`);
  }
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);

  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }

  return upDistance <= upLeftDistance ? up : upLeft;
}
