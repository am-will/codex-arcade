import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import { chromium } from 'playwright';

const url = 'http://127.0.0.1:4175/';

function runServer() {
  const child = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4175'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  return child;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await wait(250);
    }
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function sampleCanvas(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('Missing canvas');
    const probe = document.createElement('canvas');
    probe.width = 64;
    probe.height = 64;
    const context = probe.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Missing 2D context');
    context.drawImage(canvas, 0, 0, probe.width, probe.height);
    const data = context.getImageData(0, 0, probe.width, probe.height).data;
    let visible = 0;
    let varied = 0;
    const first = [data[0], data[1], data[2], data[3]];
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] > 0 && (data[index] > 8 || data[index + 1] > 8 || data[index + 2] > 8)) {
        visible += 1;
      }
      if (
        Math.abs(data[index] - first[0]) > 8 ||
        Math.abs(data[index + 1] - first[1]) > 8 ||
        Math.abs(data[index + 2] - first[2]) > 8
      ) {
        varied += 1;
      }
    }
    return { visible, varied };
  });
}

const server = runServer();
let browser;

try {
  await waitForServer();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url);
  await page.waitForSelector('.track-card');
  await page.locator('.track-card').first().click();
  await page.waitForSelector('.countdown:not(.countdown--hidden)');
  await page.waitForTimeout(3600);
  await page.keyboard.down('w');
  await page.keyboard.down('d');
  await page.keyboard.press('Space');
  await page.waitForTimeout(350);
  await page.keyboard.down('Space');
  await page.waitForTimeout(700);
  await page.keyboard.up('Space');
  await page.keyboard.up('d');
  await page.keyboard.up('w');
  const desktopSample = await sampleCanvas(page);
  if (desktopSample.visible < 1000 || desktopSample.varied < 200) {
    throw new Error(`Canvas sample too empty: ${JSON.stringify(desktopSample)}`);
  }
  const speedText = await page.locator('.speed-ring strong').textContent();
  if (!speedText || Number.parseInt(speedText, 10) <= 0) {
    throw new Error(`Expected car speed to increase, got ${speedText}`);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) throw new Error('Mobile viewport has horizontal overflow');
  const mobileSample = await sampleCanvas(page);
  if (mobileSample.visible < 1000 || mobileSample.varied < 200) {
    throw new Error(`Mobile canvas sample too empty: ${JSON.stringify(mobileSample)}`);
  }

  console.log('Smoke test passed');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
