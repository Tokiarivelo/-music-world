#!/usr/bin/env node
/**
 * IWER check of the XR mode (07-xr-mode requirement 7.1, skill `xr-verify` steps 2–4 without a headset).
 *
 * Needs a running `next dev` (IWER is installed only in development):
 *   pnpm -C apps/web exec next dev -p 3125
 *   node apps/web/scripts/xr-check.mjs [baseUrl] [--shots=<dir>]
 *
 * Uses Playwright's Chromium with SwiftShader. Reads the development hooks `window.__mwWorld` (IWSDK world) and
 * `window.__mwXRDevice` (IWER device). Exits non-zero on the first failed check.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:3125';
const shots = args.find((a) => a.startsWith('--shots='))?.slice('--shots='.length);
const executablePath =
  process.env.MW_CHROMIUM ?? join(homedir(), '.cache/ms-playwright/chromium-1248/chrome-linux64/chrome');

const VR_DIORAMA_DISTANCE_M = 1.3; // xr/constants.ts
const VR_TABLE_HEIGHT_M = 0.85;
const HEAD = { x: 0.6, y: 1.6, z: 0.4, yaw: 0.5 }; // emulated head before entering VR

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) throw new Error(`check failed: ${name}`);
}

const near = (a, b, eps = 0.02) => Math.abs(a - b) <= eps;

const browser = await chromium.launch({
  executablePath,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('response', (r) => {
  if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
});
page.on('console', (m) => {
  // Failed requests are reported with their URL by the response listener.
  if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text());
});

async function shot(name) {
  if (shots) await page.screenshot({ path: join(shots, `${name}.png`) });
}

/** Steps the emulated device for a few XR frames. */
const frames = (n = 10) =>
  page.evaluate(async (count) => {
    const world = globalThis.__mwWorld;
    const start = world.renderer.info.render.frame;
    const t0 = performance.now();
    while (world.renderer.info.render.frame < start + count && performance.now() - t0 < 20000) {
      await new Promise((r) => setTimeout(r, 16));
    }
  }, n);

const anchorPose = () =>
  page.evaluate(() => {
    const anchor = globalThis.__mwWorld.scene.getObjectByName('music-world-anchor');
    return { x: anchor.position.x, y: anchor.position.y, z: anchor.position.z, yaw: anchor.rotation.y };
  });

const playLabel = () =>
  page.locator('button[aria-label="Play"], button[aria-label="Pause"]').getAttribute('aria-label');
const songTime = async () => Number(await page.locator('input[type=range]').inputValue());

/** Presses then releases an emulated controller button (IWER ids: a-button, x-button, squeeze, …). */
async function press(hand, id) {
  await page.evaluate(([h, b]) => globalThis.__mwXRDevice.controllers[h].updateButtonValue(b, 1), [hand, id]);
  await frames(4);
  await page.evaluate(([h, b]) => globalThis.__mwXRDevice.controllers[h].updateButtonValue(b, 0), [hand, id]);
  await frames(4);
}

/** Pushes a thumbstick fully to one side, then back to the centre. */
async function flick(hand, x) {
  await page.evaluate(([h, v]) => globalThis.__mwXRDevice.controllers[h].updateAxes('thumbstick', v, 0), [hand, x]);
  await frames(4);
  await page.evaluate((h) => globalThis.__mwXRDevice.controllers[h].updateAxes('thumbstick', 0, 0), hand);
  await frames(4);
}

try {
  await page.goto(`${base}/play/demo?perf=1`, { waitUntil: 'domcontentloaded' });
  const enter = page.getByRole('button', { name: 'Enter VR' });
  await enter.waitFor({ timeout: 120000 });
  await page.waitForFunction(() => globalThis.__mwWorld && globalThis.__mwXRDevice, null, { timeout: 60000 });
  await page.locator('button[aria-label="Play"]').waitFor({ timeout: 60000 });
  check('desktop: Enter VR button shown with IWER', true);
  await frames(5);

  // Multiview (requirement 6.4): super-three only takes its multiview path with OCULUS_multiview (Quest Browser), so
  // recompile every program the world uses with the same rewrite super-three applies (WebGLProgram.js, "Multiview"),
  // on an OVR_multiview2 context, and require each to compile and link.
  const multiview = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl || !gl.getExtension('OVR_multiview2')) return { skipped: 'OVR_multiview2 unavailable' };
    const world = globalThis.__mwWorld;
    const src = world.renderer.getContext();
    const head = (s) => s.indexOf('\n') + 1; // after "#version 300 es"
    const vertexBlock = [
      'uniform mat4 modelViewMatrix;',
      'uniform mat4 projectionMatrix;',
      'uniform mat4 viewMatrix;',
      'uniform mat3 normalMatrix;',
    ].join('\n');
    const toMultiviewVertex = (s) =>
      s.slice(0, head(s)) +
      '#extension GL_OVR_multiview2 : require\nlayout(num_views = 2) in;\n#define VIEW_ID gl_ViewID_OVR\n' +
      s
        .slice(head(s))
        .replace(
          vertexBlock,
          [
            'uniform mat4 modelViewMatrices[2];',
            'uniform mat4 projectionMatrices[2];',
            'uniform mat4 viewMatrices[2];',
            'uniform mat3 normalMatrices[2];',
            '#define modelViewMatrix modelViewMatrices[VIEW_ID]',
            '#define projectionMatrix projectionMatrices[VIEW_ID]',
            '#define viewMatrix viewMatrices[VIEW_ID]',
            '#define normalMatrix normalMatrices[VIEW_ID]',
          ].join('\n'),
        );
    const toMultiviewFragment = (s) =>
      s.slice(0, head(s)) +
      '#extension GL_OVR_multiview2 : require\n#define VIEW_ID gl_ViewID_OVR\n' +
      s
        .slice(head(s))
        .replace('uniform mat4 viewMatrix;', 'uniform mat4 viewMatrices[2];\n#define viewMatrix viewMatrices[VIEW_ID]');
    const failures = [];
    const names = [];
    let rewritten = 0;
    let windowShader = false;
    for (const program of world.renderer.info.programs) {
      const [vs, fs] = src
        .getAttachedShaders(program.program)
        .sort((a, b) => src.getShaderParameter(b, src.SHADER_TYPE) - src.getShaderParameter(a, src.SHADER_TYPE));
      const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        return shader;
      };
      if (src.getShaderSource(vs).includes(vertexBlock)) rewritten++;
      if (src.getShaderSource(fs).includes('mwHash')) windowShader = true; // building windows (city-materials.ts)
      const v = compile(gl.VERTEX_SHADER, toMultiviewVertex(src.getShaderSource(vs)));
      const f = compile(gl.FRAGMENT_SHADER, toMultiviewFragment(src.getShaderSource(fs)));
      const linked = gl.createProgram();
      gl.attachShader(linked, v);
      gl.attachShader(linked, f);
      gl.linkProgram(linked);
      names.push(program.type || program.name);
      if (!gl.getProgramParameter(linked, gl.LINK_STATUS)) {
        failures.push(
          `${program.name}: ${gl.getShaderInfoLog(v) || gl.getShaderInfoLog(f) || gl.getProgramInfoLog(linked)}`,
        );
      }
    }
    return { programs: names.length, rewritten, windowShader, names: [...new Set(names)], failures };
  });
  if (multiview.skipped) console.log(`SKIP multiview compile check — ${multiview.skipped}`);
  else
    check(
      `multiview: all ${multiview.programs} world programs compile and link with OVR_multiview2`,
      multiview.failures.length === 0 &&
        multiview.programs > 0 &&
        multiview.rewritten === multiview.programs &&
        multiview.windowShader,
      multiview.failures.length
        ? multiview.failures.slice(0, 2).join(' | ')
        : `${multiview.rewritten} rewritten incl. the window shader: ${multiview.names.join(', ')}`,
    );

  await page.evaluate((h) => {
    const device = globalThis.__mwXRDevice;
    device.position.set(h.x, h.y, h.z);
    device.quaternion.set(0, Math.sin(h.yaw / 2), 0, Math.cos(h.yaw / 2));
  }, HEAD);
  const desktop = await anchorPose();

  await enter.click();
  await page.getByRole('button', { name: 'Exit VR' }).waitFor({ timeout: 30000 });
  check('session: immersive-vr started, 2D button reads Exit VR', true);
  await frames(20);
  const placed = await anchorPose();
  const expected = {
    x: HEAD.x - Math.sin(HEAD.yaw) * VR_DIORAMA_DISTANCE_M,
    z: HEAD.z - Math.cos(HEAD.yaw) * VR_DIORAMA_DISTANCE_M,
  };
  check(
    'placement: plate in front of the head at table height, facing the user',
    near(placed.x, expected.x) &&
      near(placed.z, expected.z) &&
      near(placed.y, VR_TABLE_HEIGHT_M) &&
      near(placed.yaw, HEAD.yaw),
    JSON.stringify({ placed, expected }),
  );
  await shot('xr-entered');

  const info = await page.evaluate(() => {
    const { render, memory } = globalThis.__mwWorld.renderer.info;
    return {
      calls: render.calls,
      triangles: render.triangles,
      geometries: memory.geometries,
      textures: memory.textures,
    };
  });
  check('budget: draw calls in VR < 100 (both eyes)', info.calls < 100, JSON.stringify(info));

  // Playback from the controllers (requirement 3): A toggles, thumbstick seeks, X toggles, squeeze recenters.
  await press('right', 'a-button');
  check('controls: A starts the song (2D bar shows Pause)', (await playLabel()) === 'Pause');
  await page.waitForTimeout(1500);
  await press('left', 'x-button');
  check('controls: X pauses the song', (await playLabel()) === 'Play');
  const paused = await songTime();
  check('clock: time advanced while playing', paused > 0.5, `t = ${paused.toFixed(2)} s`);
  await page.waitForTimeout(800);
  check('clock: time frozen while paused', Math.abs((await songTime()) - paused) < 1e-6);
  await flick('right', 1);
  const forward = await songTime();
  check(
    'controls: thumbstick right seeks +5 s',
    near(forward - paused, 5, 0.05),
    `${paused.toFixed(2)} → ${forward.toFixed(2)}`,
  );
  await flick('left', -1);
  check('controls: thumbstick left seeks −5 s', near(await songTime(), paused, 0.05));

  await page.evaluate(() => globalThis.__mwXRDevice.quaternion.set(0, 0, 0, 1));
  await frames(4);
  const beforeRecenter = await anchorPose();
  await press('left', 'squeeze');
  const recentered = await anchorPose();
  check(
    'controls: squeeze recenters the plate in front of the current head pose',
    near(recentered.yaw, 0) && near(recentered.x, HEAD.x) && near(recentered.z, HEAD.z - VR_DIORAMA_DISTANCE_M),
    JSON.stringify({ beforeRecenter, recentered }),
  );

  const frameTime = await page.evaluate(async () => {
    const world = globalThis.__mwWorld;
    const f0 = world.renderer.info.render.frame;
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 3000));
    const n = world.renderer.info.render.frame - f0;
    return { frames: n, msPerFrame: n ? (performance.now() - t0) / n : null };
  });
  console.log(`INFO frame time in IWER (SwiftShader, CPU raster): ${JSON.stringify(frameTime)}`);

  // IWER's runtime layer covers the page while a session runs: click the 2D button programmatically.
  await page.getByRole('button', { name: 'Exit VR' }).evaluate((button) => button.click());
  await page.getByRole('button', { name: 'Enter VR' }).waitFor({ timeout: 30000 });
  await frames(5).catch(() => undefined);
  await page.waitForTimeout(500);
  const restored = await anchorPose();
  check(
    'exit: desktop placement restored',
    near(restored.x, desktop.x, 1e-6) && near(restored.z, desktop.z, 1e-6) && near(restored.yaw, 0, 1e-6),
    JSON.stringify(restored),
  );
  check(
    'player: leaving VR keeps the song state (paused at the same time)',
    (await playLabel()) === 'Play' && near(await songTime(), paused, 0.05),
  );
  check('console: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
