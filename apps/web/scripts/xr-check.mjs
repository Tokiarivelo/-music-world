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

// `MW_ANGLE=vulkan` renders on the GPU (frame time close to real); SwiftShader (default) works everywhere.
const angle = process.env.MW_ANGLE ?? 'swiftshader';
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
  args: [
    `--use-angle=${angle}`,
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    // Uncapped frame rate so the measured frame time is the cost of a frame, not the display refresh.
    '--disable-gpu-vsync',
    '--disable-frame-rate-limit',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const page = await browser.newPage({ locale: 'en-US', viewport: { width: 1280, height: 720 } });
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
async function press(hand, id, hold = 4) {
  await page.evaluate(([h, b]) => globalThis.__mwXRDevice.controllers[h].updateButtonValue(b, 1), [hand, id]);
  await frames(hold);
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

  await page.evaluate((h) => {
    const device = globalThis.__mwXRDevice;
    device.position.set(h.x, h.y, h.z);
    device.quaternion.set(0, Math.sin(h.yaw / 2), 0, Math.cos(h.yaw / 2));
  }, HEAD);
  const desktop = await anchorPose();
  await shot('desktop');

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
      `multiview: all ${multiview.programs} programs in VR (world, panel, controllers) compile and link with OVR_multiview2`,
      multiview.failures.length === 0 &&
        multiview.programs > 0 &&
        multiview.rewritten === multiview.programs &&
        multiview.windowShader,
      multiview.failures.length
        ? multiview.failures.slice(0, 2).join(' | ')
        : `${multiview.rewritten} rewritten incl. the window shader: ${multiview.names.join(', ')}`,
    );

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
  console.log(`INFO frame time in IWER (ANGLE ${angle}): ${JSON.stringify(frameTime)}`);

  // Spatial panel (requirement 4): aim the right controller ray at a button and pull the trigger.
  const panel = await page.evaluate(() => {
    const object = globalThis.__mwWorld.scene.getObjectByName('music-world-panel');
    return { visible: !!object?.visible, loaded: !!object?.children.length };
  });
  check(
    'panel: shown above the plate in VR and loaded from UIKitML',
    panel.visible && panel.loaded,
    JSON.stringify(panel),
  );

  /** Points the right controller from in front of the panel at the element and clicks it with the trigger. */
  async function clickPanel(id) {
    const hovered = await page.evaluate((elementId) => {
      const world = globalThis.__mwWorld;
      const object = world.scene.getObjectByName('music-world-panel');
      let target = null;
      object.traverse((o) => {
        if (!target && typeof o.getElementById === 'function') target = o.getElementById(elementId);
      });
      if (!target) return `element ${elementId} not found`;
      world.scene.updateMatrixWorld(true);
      const p = target.getWorldPosition(target.position.clone());
      const n = object.getWorldDirection(target.position.clone()); // panel front (+z)
      const from = { x: p.x + n.x * 0.25, y: p.y + n.y * 0.25, z: p.z + n.z * 0.25 };
      const d = { x: p.x - from.x, y: p.y - from.y, z: p.z - from.z };
      const len = Math.hypot(d.x, d.y, d.z);
      const b = { x: d.x / len, y: d.y / len, z: d.z / len };
      // Quaternion rotating the controller forward (0, 0, -1) onto b.
      const q = { x: b.y, y: -b.x, z: 0, w: 1 - b.z };
      const ql = Math.hypot(q.x, q.y, q.z, q.w);
      const controller = globalThis.__mwXRDevice.controllers.right;
      controller.position.set(from.x, from.y, from.z);
      controller.quaternion.set(q.x / ql, q.y / ql, q.z / ql, q.w / ql);
      return null;
    }, id);
    if (hovered) throw new Error(hovered);
    await frames(6);
    // A click needs pointerdown and pointerup within the pointer click threshold (300 ms): release on the next frame.
    await press('right', 'trigger', 1);
    await frames(2);
  }

  // pointerdown → pointerup must fit in the 300 ms click threshold: needs a few frames per second (GPU ANGLE).
  const canClick = frameTime.msPerFrame !== null && frameTime.msPerFrame < 120;
  if (!canClick)
    console.log('SKIP panel clicks — frame time too long for the click threshold; run with MW_ANGLE=vulkan');
  else {
    await clickPanel('mw-play');
    check('panel: Play button (controller ray + trigger) starts the song', (await playLabel()) === 'Pause');
    await page.waitForTimeout(500);
    const beforeForward = await songTime();
    await clickPanel('mw-forward');
    const afterForward = await songTime();
    check(
      'panel: +10 s button seeks forward',
      afterForward - beforeForward > 9 && afterForward - beforeForward < 13,
      `${beforeForward.toFixed(2)} → ${afterForward.toFixed(2)}`,
    );
    await clickPanel('mw-restart');
    check('panel: Restart seeks to the start', (await songTime()) < 3, `t = ${(await songTime()).toFixed(2)}`);
    await clickPanel('mw-play');
    check('panel: Play button pauses again', (await playLabel()) === 'Play');
    const panelText = await page.evaluate(() => {
      const object = globalThis.__mwWorld.scene.getObjectByName('music-world-panel');
      let doc = null;
      object.traverse((o) => {
        if (!doc && typeof o.getElementById === 'function') doc = o;
      });
      const text = (id) => doc.getElementById(id).properties.peek().text;
      return {
        title: text('mw-title'),
        time: text('mw-time'),
        play: text('mw-play'),
        tpl0: text('mw-tpl-0'),
        tpl1: text('mw-tpl-1'),
      };
    });
    check(
      'panel: title, time, play label and template picker reflect the player',
      panelText.title?.length > 0 &&
        /^\d+:\d\d \/ \d+:\d\d$/.test(panelText.time ?? '') &&
        panelText.play === 'Play' &&
        panelText.tpl0 === 'Neon Nocturne',
      JSON.stringify(panelText),
    );
    // 06-template-store: with the API running, the store's launch template joins the VR picker after the built-in.
    const storeUp = await page.evaluate(() =>
      fetch('/api/templates?limit=1').then(
        (r) => r.ok,
        () => false,
      ),
    );
    if (storeUp) {
      check(
        'panel: template picker lists the store templates',
        panelText.tpl1 === 'Kiroween Pumpkin Night',
        panelText.tpl1,
      );
    } else {
      console.log('SKIP panel: store templates (API not reachable from next dev)');
    }
  }
  // Look down at the table like a standing user (pitch −35°) for the screenshot.
  await page.evaluate(() => globalThis.__mwXRDevice.quaternion.set(Math.sin(-0.3054), 0, 0, Math.cos(-0.3054)));
  await frames(3);
  await shot('xr-panel');
  await page.evaluate(() => globalThis.__mwXRDevice.quaternion.set(0, 0, 0, 1));

  // Hand pinch (requirement 5): IWER hands, left-hand pinch toggles play; a partial pinch does nothing.
  await page.evaluate(() => {
    globalThis.__mwXRDevice.primaryInputMode = 'hand';
  });
  await frames(10);
  const pinchTo = async (value) => {
    await page.evaluate((v) => globalThis.__mwXRDevice.hands.left.setPinchValueImmediate(v), value);
    await frames(4);
    return page.evaluate(() => {
      const xr = globalThis.__mwWorld.input.xr;
      return { primary: xr.isPrimary('hand', 'left'), strength: xr.visualAdapters.hand.left.getPinchStrength() };
    });
  };
  const open = await pinchTo(0);
  check('hands: left hand is the primary input', open.primary, JSON.stringify(open));
  const before = await playLabel();
  // Find an IWER pinch value whose strength lies between the release and press thresholds (hand pose blend).
  let partial = null;
  for (let v = 0.5; v < 1 && !partial; v += 0.05) {
    const sample = await pinchTo(v);
    if (sample.strength >= 0.4 && sample.strength < 0.75) partial = { value: v, ...sample };
  }
  await pinchTo(0);
  if (!partial) console.log('SKIP partial pinch check — no IWER pinch value gives a strength in [0.4, 0.75)');
  else
    check(
      'hands: a partial pinch (0.4 ≤ strength < 0.75) does not toggle',
      (await playLabel()) === before,
      `IWER pinch ${partial.value.toFixed(2)} → strength ${partial.strength.toFixed(2)}`,
    );
  const full = await pinchTo(1);
  const afterPinch = await playLabel();
  await pinchTo(0);
  check(
    'hands: a full left pinch toggles play/pause',
    afterPinch !== before && full.strength >= 0.75,
    `${before} → ${afterPinch}, strength ${full.strength.toFixed(2)}`,
  );
  await pinchTo(1);
  await pinchTo(0);
  check('hands: a second pinch toggles back', (await playLabel()) === before);
  await page.evaluate(() => {
    globalThis.__mwXRDevice.primaryInputMode = 'controller';
  });
  await frames(10);

  // Memory (xr-verify step 4): geometries and textures stay stable over seeks in VR.
  const memory = () =>
    page.evaluate(() => {
      const { geometries, textures } = globalThis.__mwWorld.renderer.info.memory;
      return { geometries, textures };
    });
  const memBefore = await memory();
  await press('right', 'a-button');
  for (const x of [1, 1, -1]) await flick('right', x);
  await page.waitForTimeout(500);
  await press('right', 'a-button');
  const memAfter = await memory();
  const lateCalls = await page.evaluate(() => globalThis.__mwWorld.renderer.info.render.calls);
  check('budget: draw calls in VR with the panel and controllers < 100 (both eyes)', lateCalls < 100, `${lateCalls}`);
  check(
    'memory: no geometry or texture leak after 3 seeks while playing',
    memAfter.geometries === memBefore.geometries && memAfter.textures === memBefore.textures,
    `${JSON.stringify(memBefore)} → ${JSON.stringify(memAfter)}`,
  );

  // Exit through the panel (IWER's runtime layer covers the 2D page while a session runs).
  const pausedAt = await songTime();
  if (canClick) await clickPanel('mw-exit');
  else await page.getByRole('button', { name: 'Exit VR' }).evaluate((button) => button.click());
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
    (await playLabel()) === 'Play' && near(await songTime(), pausedAt, 0.05),
  );
  check('console: no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
