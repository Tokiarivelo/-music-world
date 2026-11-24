#!/usr/bin/env node
/**
 * Blank-ratio check of the full-screen world (docs/improvements/i2-fullscreen-world.md requirement 3).
 *
 * Needs a running `next dev`:
 *   pnpm -C apps/web exec next dev -p 3125
 *   node apps/web/scripts/blank-ratio.mjs [baseUrl] [--shots=<dir>] [--min=0.99]
 *
 * For five aspect ratios, loads /play/demo, screenshots the canvas and reports the share of pixels that differ from
 * `palette.background` by more than a small threshold. Exits non-zero when a ratio is below `--min` (default 0.99).
 * Use `--baseline` to only print the numbers.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:3125';
const shots = args.find((a) => a.startsWith('--shots='))?.slice('--shots='.length);
const min = Number(args.find((a) => a.startsWith('--min='))?.slice('--min='.length) ?? 0.99);
const baselineOnly = args.includes('--baseline');
const executablePath =
  process.env.MW_CHROMIUM ?? join(homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome');
const angle = process.env.MW_ANGLE ?? 'swiftshader';

/** `palette.background` of the default template (neon-nocturne) and the per-channel tolerance (0–255). */
const BACKGROUND = [0x07, 0x05, 0x1a];
const THRESHOLD = 6;
const RATIOS = [
  { name: '16x9', width: 1280, height: 720 },
  { name: '21x9', width: 1260, height: 540 },
  { name: '4x3', width: 1024, height: 768 },
  { name: '1x1', width: 800, height: 800 },
  { name: '9x16', width: 450, height: 800 },
];

const browser = await chromium.launch({
  executablePath,
  args: [`--use-angle=${angle}`, '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

/** Share of pixels of a PNG (base64) that differ from the background by more than THRESHOLD on any channel. */
async function filledShare(page, pngBase64) {
  return page.evaluate(
    async ([data, bg, threshold]) => {
      const blob = await (await fetch(`data:image/png;base64,${data}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const px = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      let filled = 0;
      for (let i = 0; i < px.length; i += 4) {
        if (
          Math.abs(px[i] - bg[0]) > threshold ||
          Math.abs(px[i + 1] - bg[1]) > threshold ||
          Math.abs(px[i + 2] - bg[2]) > threshold
        ) {
          filled++;
        }
      }
      return filled / (px.length / 4);
    },
    [pngBase64, BACKGROUND, THRESHOLD],
  );
}

let failed = false;
try {
  for (const ratio of RATIOS) {
    const page = await browser.newPage({ locale: 'en-US', viewport: { width: ratio.width, height: ratio.height } });
    await page.goto(`${base}/play/demo`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => globalThis.__mwWorld, null, { timeout: 120000 });
    await page.waitForTimeout(4000); // plan built, a few frames rendered
    const canvasBox = await page.evaluate(() => {
      const r = globalThis.__mwWorld.renderer.domElement.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    // Capture the page without the overlays: only the WebGL canvas matters for the blank ratio.
    await page.addStyleTag({ content: 'body > *:not(:has(canvas)) , [class*="absolute"]:not(:has(canvas)) { visibility: hidden !important }' });
    const png = await page.screenshot({ clip: canvasBox });
    if (shots) await page.screenshot({ path: join(shots, `${ratio.name}.png`) });
    const share = await filledShare(page, png.toString('base64'));
    const covers =
      Math.abs(canvasBox.width - ratio.width) < 1.5 && Math.abs(canvasBox.height - ratio.height) < 1.5;
    const ok = share >= min && covers;
    if (!ok) failed = true;
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${ratio.name} ${ratio.width}x${ratio.height} filled=${(share * 100).toFixed(1)}% ` +
        `canvas=${Math.round(canvasBox.width)}x${Math.round(canvasBox.height)}`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
if (failed && !baselineOnly) process.exit(1);
