#!/usr/bin/env node
/**
 * Browser check of the template editor (09-template-editor task 8).
 *
 * Needs a running `next dev`:
 *   pnpm -C apps/web exec next dev -p 3125
 *   node apps/web/scripts/editor-check.mjs [baseUrl] [--shots=<dir>]
 *
 * Loads /editor over the demo song at 1280x720 and 390x844, checks that the form and the player bar appear, edits the
 * accent color and a name, and checks that no horizontal scroll appears. Exits non-zero on a failure. Use
 * MW_ANGLE=vulkan if the world does not load.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith("--")) ?? "http://localhost:3125";
const shots = args.find((a) => a.startsWith("--shots="))?.slice("--shots=".length);
const executablePath =
  process.env.MW_CHROMIUM ?? join(homedir(), ".cache/ms-playwright/chromium-1248/chrome-linux64/chrome");
const angle = process.env.MW_ANGLE ?? "swiftshader";
const VIEWPORTS = [
  { name: "1280x720", width: 1280, height: 720 },
  { name: "390x844", width: 390, height: 844 },
];

const browser = await chromium.launch({
  executablePath,
  args: [`--use-angle=${angle}`, "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
let failed = false;
const fail = (message) => {
  console.log(`FAIL ${message}`);
  failed = true;
};
for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ locale: "en-US", viewport: { width: vp.width, height: vp.height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/editor`, { waitUntil: "networkidle" });
  const name = page.getByLabel("Template name");
  await name.waitFor({ state: "visible", timeout: 30000 });
  await page.getByRole("slider").first().waitFor({ state: "visible", timeout: 30000 }).catch(() => fail(`${vp.name}: player bar never appeared`));
  await name.fill("Editor check");
  await page.getByLabel("Accent, hex code").fill("#ff8800");
  await page.getByRole("button", { name: "Add a rule" }).click();
  await page.waitForTimeout(4000); // debounce (300 ms) + world rebuild, slow with software rendering
  const valid = await page.getByText("The template is valid.").isVisible();
  const status = valid ? "The template is valid." : await page.getByText(/problems? to fix/).first().textContent();
  if (!valid) fail(`${vp.name}: expected a valid template, got "${status}"`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) fail(`${vp.name}: horizontal scroll of ${overflow}px`);
  if (errors.length) fail(`${vp.name}: page errors ${errors.join(" | ")}`);
  console.log(`${vp.name}: status "${status}", overflow ${overflow}px, page errors ${errors.length}`);
  await page.getByLabel("Template name").scrollIntoViewIfNeeded();
  if (shots) await page.screenshot({ path: join(shots, `editor-${vp.name}.png`) });
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
