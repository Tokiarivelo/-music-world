#!/usr/bin/env node
/**
 * Layout check of the play page nav (docs/improvements/i1-back-to-upload.md requirement 1).
 *
 * Needs a running `next dev`:
 *   pnpm -C apps/web exec next dev -p 3125
 *   node apps/web/scripts/play-layout.mjs [baseUrl] [--shots=<dir>]
 *
 * At 1280x720 and 390x844, loads /play/demo and checks that the nav box overlaps neither the navigation controls
 * (top-right), the language switch (top-centre) nor the player bar (bottom). Exits non-zero on an overlap or when
 * one of them never appears (so the check cannot pass vacuously). Use MW_ANGLE=vulkan if the world does not load.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3125";
const shots = args
  .find((a) => a.startsWith("--shots="))
  ?.slice("--shots=".length);
const executablePath =
  process.env.MW_CHROMIUM ??
  join(homedir(), ".cache/ms-playwright/chromium-1248/chrome-linux64/chrome");
const angle = process.env.MW_ANGLE ?? "swiftshader";
const VIEWPORTS = [
  { name: "1280x720", width: 1280, height: 720 },
  { name: "390x844", width: 390, height: 844 },
];

const overlaps = (a, b) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

const browser = await chromium.launch({
  executablePath,
  args: [
    `--use-angle=${angle}`,
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});
let failed = false;
for (const vp of VIEWPORTS) {
  const page = await browser.newPage({
    locale: "en-US",
    viewport: { width: vp.width, height: vp.height },
  });
  await page.goto(`${base}/play/demo`, { waitUntil: "networkidle" });
  const nav = page.getByRole("navigation", { name: /site navigation/i });
  const navBox = await nav.boundingBox();
  const others = [];
  for (const [label, locator] of [
    ["player bar", page.getByRole("slider")],
    [
      "navigation controls",
      page.locator('div[role="group"][class*="right-4"]'),
    ],
    ["language switch", page.getByRole("combobox", { name: "Language" })],
  ]) {
    try {
      await locator.first().waitFor({ state: "visible", timeout: 30000 });
      others.push([label, await locator.first().boundingBox()]);
    } catch {
      console.log(`${vp.name}: ${label} never appeared`);
      failed = true;
    }
  }
  const hits = navBox
    ? others.filter(([, box]) => overlaps(navBox, box)).map(([label]) => label)
    : ["(nav missing)"];
  console.log(
    `${vp.name}: nav ${navBox ? JSON.stringify(navBox) : "missing"}; checked ${others.length}; overlaps ${hits.join(", ") || "none"}`,
  );
  if (hits.length) failed = true;
  if (shots)
    await page.screenshot({ path: join(shots, `play-${vp.name}.png`) });
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
