import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const artifactsDir = resolve(root, '.test-artifacts')
const host = '127.0.0.1'
const port = 4173
const baseUrl = `http://${host}:${port}`

await mkdir(artifactsDir, { recursive: true })

const server = spawn('npm', ['run', 'preview', '--', '--host', host, '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
})

let serverOutput = ''
server.stdout.on('data', (chunk) => {
  serverOutput += chunk.toString()
})
server.stderr.on('data', (chunk) => {
  serverOutput += chunk.toString()
})

async function waitForServer() {
  const started = Date.now()
  while (Date.now() - started < 15_000) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
    }
  }
  throw new Error(`Preview server did not start.\n${serverOutput}`)
}

function parsePng(buffer) {
  const signature = buffer.subarray(0, 8).toString('hex')
  if (signature !== '89504e470d0a1a0a') throw new Error('Screenshot is not a PNG.')
  let offset = 8
  let width = 0
  let height = 0
  let colorType = 0
  const idat = []

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      const bitDepth = data[8]
      colorType = data[9]
      if (bitDepth !== 8 || ![2, 6].includes(colorType)) {
        throw new Error(`Unsupported PNG format: bitDepth=${bitDepth} colorType=${colorType}`)
      }
    }
    if (type === 'IDAT') idat.push(data)
    if (type === 'IEND') break
    offset += 12 + length
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3
  const stride = width * bytesPerPixel
  const inflated = zlib.inflateSync(Buffer.concat(idat))
  const raw = Buffer.alloc(height * stride)
  let input = 0
  let output = 0
  const previous = Buffer.alloc(stride)

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[input]
    input += 1
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? raw[output + x - bytesPerPixel] : 0
      const up = previous[x]
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0
      const value = inflated[input + x]
      let unfiltered = value
      if (filter === 1) unfiltered = value + left
      if (filter === 2) unfiltered = value + up
      if (filter === 3) unfiltered = value + Math.floor((left + up) / 2)
      if (filter === 4) {
        const p = left + up - upLeft
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - upLeft)
        unfiltered = value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)
      }
      raw[output + x] = unfiltered & 255
    }
    raw.copy(previous, 0, output, output + stride)
    input += stride
    output += stride
  }

  return { width, height, data: raw, bytesPerPixel }
}

function assertNonBlankCanvas(buffer, label) {
  const png = parsePng(buffer)
  let brightPixels = 0
  let colorVariance = 0
  for (let index = 0; index < png.data.length; index += png.bytesPerPixel * 25) {
    const r = png.data[index]
    const g = png.data[index + 1]
    const b = png.data[index + 2]
    const brightness = r + g + b
    if (brightness > 70) brightPixels += 1
    colorVariance += Math.abs(r - g) + Math.abs(g - b)
  }
  if (png.width < 300 || png.height < 300 || brightPixels < 80 || colorVariance < 5000) {
    throw new Error(`${label} canvas looks blank or incorrectly sized.`)
  }
}

async function verifyViewport(page, viewport, label) {
  await page.setViewportSize(viewport)
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto(`${baseUrl}/?test=1`, { waitUntil: 'networkidle' })
  await page.locator('canvas').waitFor({ state: 'visible' })
  await page.getByRole('heading', { name: 'Flamethrow' }).waitFor()
  await page.waitForTimeout(900)

  const canvas = page.locator('canvas')
  const screenshot = await canvas.screenshot({ path: resolve(artifactsDir, `${label}-canvas.png`) })
  assertNonBlankCanvas(screenshot, label)

  const stats = await page.evaluate(() => window.__FLAMETHROW_TEST__?.snapshot())
  if (!stats || stats.phase !== 'ready' || stats.timeRemaining !== 90) {
    throw new Error(`${label} did not boot into a ready 90 second run.`)
  }

  if (label === 'desktop') {
    await page.evaluate(() => window.__FLAMETHROW_TEST__?.resetHighScore())
    await page.waitForTimeout(100)
    const box = await canvas.boundingBox()
    if (!box) throw new Error('Canvas missing bounding box.')

    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.64)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.46, box.y + box.height * 0.82, { steps: 8 })
    await page.mouse.up()
    let afterPull
    for (let index = 0; index < 16; index += 1) {
      await page.waitForTimeout(100)
      afterPull = await page.evaluate(() => window.__FLAMETHROW_TEST__?.snapshot())
      if (afterPull?.readyBallAvailable) break
    }
    if (!afterPull || afterPull.timeRemaining >= 90 || afterPull.phase === 'ready') {
      throw new Error('Pullback shot did not start the timed run.')
    }
    if (!afterPull.readyBallAvailable || afterPull.activeShots < 1) {
      throw new Error(`Ready ball did not respawn while the first shot was still active: ${JSON.stringify(afterPull)}`)
    }

    await page.getByRole('button', { name: 'Flick' }).click()
    await page.waitForTimeout(150)
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.68)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.38, { steps: 4 })
    await page.mouse.up()
    await page.waitForTimeout(500)

    await page.evaluate(() => window.__FLAMETHROW_TEST__?.forceMake(3))
    await page.waitForTimeout(200)
    const redTier = await page.evaluate(() => ({
      state: window.__FLAMETHROW_TEST__?.snapshot(),
      hudTier: document.querySelector('#hud-root')?.getAttribute('data-tier'),
    }))
    if (
      !redTier.state ||
      redTier.state.streak !== 3 ||
      redTier.state.multiplier !== 2 ||
      redTier.state.highScore !== redTier.state.score ||
      redTier.hudTier !== '3'
    ) {
      throw new Error(`Three-make red tier failed: ${JSON.stringify(redTier)}`)
    }

    await page.evaluate(() => window.__FLAMETHROW_TEST__?.forceMake(2))
    await page.waitForTimeout(200)
    const flameTier = await page.evaluate(() => ({
      state: window.__FLAMETHROW_TEST__?.snapshot(),
      hudTier: document.querySelector('#hud-root')?.getAttribute('data-tier'),
    }))
    if (
      !flameTier.state ||
      flameTier.state.streak !== 5 ||
      flameTier.state.multiplier !== 3 ||
      flameTier.state.highScore !== flameTier.state.score ||
      flameTier.hudTier !== '5'
    ) {
      throw new Error(`Five-make flame tier failed: ${JSON.stringify(flameTier)}`)
    }

    await page.evaluate(() => window.__FLAMETHROW_TEST__?.forceMake(15))
    await page.waitForTimeout(200)
    const inferno = await page.evaluate(() => window.__FLAMETHROW_TEST__?.snapshot())
    if (!inferno || inferno.streak !== 20 || inferno.multiplier !== 10 || inferno.score <= 0) {
      throw new Error(`Multiplier progression failed: ${JSON.stringify(inferno)}`)
    }
    if (inferno.highScore !== inferno.score) {
      throw new Error(`High score did not track current best score: ${JSON.stringify(inferno)}`)
    }
    if (inferno.level !== 1 || inferno.hoopDistance !== -5.1) {
      throw new Error(`Made baskets changed hoop depth before the timer gate: ${JSON.stringify(inferno)}`)
    }

    await page.evaluate(() => window.__FLAMETHROW_TEST__?.forceMiss())
    await page.waitForTimeout(100)
    const afterMiss = await page.evaluate(() => window.__FLAMETHROW_TEST__?.snapshot())
    if (!afterMiss || afterMiss.streak !== 0 || afterMiss.multiplier !== 1) {
      throw new Error('Miss did not reset streak and multiplier.')
    }

    await page.evaluate(() => window.__FLAMETHROW_TEST__?.forceRoundOver())
    await page.getByRole('heading', { name: 'Run Complete' }).waitFor()
    await page.getByRole('button', { name: 'Restart Run' }).click()
    await page.waitForTimeout(200)
    const restarted = await page.evaluate(() => window.__FLAMETHROW_TEST__?.snapshot())
    if (!restarted || restarted.phase !== 'ready' || restarted.score !== 0 || restarted.timeRemaining !== 90 || restarted.highScore !== inferno.highScore) {
      throw new Error(`Restart failed: ${JSON.stringify(restarted)}`)
    }

    await page.getByRole('button', { name: 'Restart', exact: true }).click()
    await page.waitForTimeout(200)
    const quickRestarted = await page.evaluate(() => window.__FLAMETHROW_TEST__?.snapshot())
    if (
      !quickRestarted ||
      quickRestarted.phase !== 'ready' ||
      quickRestarted.score !== 0 ||
      quickRestarted.timeRemaining !== 90 ||
      quickRestarted.highScore !== inferno.highScore
    ) {
      throw new Error(`Persistent restart failed: ${JSON.stringify(quickRestarted)}`)
    }
  }

  if (errors.length > 0) {
    await writeFile(resolve(artifactsDir, `${label}-console-errors.txt`), errors.join('\n'))
    throw new Error(`${label} console errors:\n${errors.join('\n')}`)
  }
}

async function verifyBasketCounterRule(page) {
  await page.setViewportSize({ width: 820, height: 1600 })
  await page.goto(`${baseUrl}/?test=1`, { waitUntil: 'networkidle' })
  await page.locator('canvas').waitFor({ state: 'visible' })
  await page.waitForTimeout(1000)

  const before = await page.evaluate(() => window.__FLAMETHROW_TEST__?.snapshot())
  await page.evaluate(() => window.__FLAMETHROW_TEST__?.dropThroughHoop())

  let made
  for (let index = 0; index < 30; index += 1) {
    await page.waitForTimeout(100)
    made = await page.evaluate(() => window.__FLAMETHROW_TEST__?.snapshot())
    if ((made?.score ?? 0) > (before?.score ?? 0)) break
  }

  if (!made || made.score <= (before?.score ?? 0) || made.streak < 1) {
    throw new Error(`Top-to-bottom hoop drop did not increment score: before=${JSON.stringify(before)} after=${JSON.stringify(made)}`)
  }

  await page.goto(`${baseUrl}/?test=1`, { waitUntil: 'networkidle' })
  await page.locator('canvas').waitFor({ state: 'visible' })
  await page.waitForTimeout(1000)

  const boardBefore = await page.evaluate(() => window.__FLAMETHROW_TEST__?.snapshot())
  await page.evaluate(() => window.__FLAMETHROW_TEST__?.dropAtBackboard())
  let boardAfter
  for (let index = 0; index < 30; index += 1) {
    await page.waitForTimeout(100)
    boardAfter = await page.evaluate(() => window.__FLAMETHROW_TEST__?.snapshot())
    if ((boardAfter?.activeShots ?? 0) === 0) break
  }

  if ((boardAfter?.score ?? 0) > (boardBefore?.score ?? 0)) {
    throw new Error(`Backboard-side drop incorrectly scored: before=${JSON.stringify(boardBefore)} after=${JSON.stringify(boardAfter)}`)
  }
}

async function verifyTimerLevels(page) {
  await page.setViewportSize({ width: 820, height: 1600 })
  await page.goto(`${baseUrl}/?test=1`, { waitUntil: 'networkidle' })
  await page.locator('canvas').waitFor({ state: 'visible' })
  await page.waitForTimeout(1000)

  const checkpoints = [
    { elapsed: 0, level: 1, basePoints: 2, hoopDistance: -5.1, hoopSpeed: 0.42 },
    { elapsed: 29.9, level: 1, basePoints: 2, hoopDistance: -5.1, hoopSpeed: 0.42 },
    { elapsed: 30.1, level: 2, basePoints: 2, hoopDistance: -6.17, hoopSpeed: 0.44 },
    { elapsed: 59.9, level: 2, basePoints: 2, hoopDistance: -6.17, hoopSpeed: 0.44 },
    { elapsed: 60.1, level: 3, basePoints: 5, hoopDistance: -7.23, hoopSpeed: 0.47 },
    { elapsed: 89, level: 3, basePoints: 5, hoopDistance: -7.23, hoopSpeed: 0.47 },
  ]

  for (const checkpoint of checkpoints) {
    await page.evaluate((elapsed) => window.__FLAMETHROW_TEST__?.setElapsedSeconds(elapsed), checkpoint.elapsed)
    await page.waitForTimeout(50)
    const state = await page.evaluate(() => window.__FLAMETHROW_TEST__?.snapshot())
    if (
      !state ||
      state.level !== checkpoint.level ||
      state.basePoints !== checkpoint.basePoints ||
      state.hoopDistance !== checkpoint.hoopDistance ||
      state.hoopSpeed !== checkpoint.hoopSpeed
    ) {
      throw new Error(`Timer level checkpoint failed: expected=${JSON.stringify(checkpoint)} actual=${JSON.stringify(state)}`)
    }
  }

  await page.goto(`${baseUrl}/?test=1`, { waitUntil: 'networkidle' })
  await page.locator('canvas').waitFor({ state: 'visible' })
  await page.waitForTimeout(1000)
  await page.evaluate(() => window.__FLAMETHROW_TEST__?.setElapsedSeconds(60.1))
  const before = await page.evaluate(() => window.__FLAMETHROW_TEST__?.snapshot())
  await page.evaluate(() => window.__FLAMETHROW_TEST__?.dropThroughHoop())
  let after
  for (let index = 0; index < 30; index += 1) {
    await page.waitForTimeout(100)
    after = await page.evaluate(() => window.__FLAMETHROW_TEST__?.snapshot())
    if ((after?.score ?? 0) > (before?.score ?? 0)) break
  }
  if (!after || after.score - (before?.score ?? 0) !== 5) {
    throw new Error(`Level 3 make did not score 5 base points: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
  }
}

let browser
try {
  await waitForServer()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await verifyViewport(page, { width: 1440, height: 900 }, 'desktop')
  await verifyViewport(page, { width: 390, height: 844 }, 'mobile')
  await verifyBasketCounterRule(page)
  await verifyTimerLevels(page)
  await page.close()
  console.log('Smoke test passed: desktop and mobile canvases rendered, controls worked, tiers progressed, and restart succeeded.')
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
