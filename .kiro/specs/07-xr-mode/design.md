# Design Document — 07 XR Mode

## Overview

Sources: `PROJECT.md` §7, `xr-iwsdk.md`, `tech.md` (IWSDK inside Next.js, performance budget), skill `xr-verify`.
IWSDK 1.1.0 API names below were checked against the installed typings (`node_modules/@iwsdk/core/dist`,
`@iwsdk/xr-input/dist`) and the Meta IWSDK skill references.

```text
React (DemoPlayback / ProjectPlayback)
  └─ WorldView ─► WorldCanvas ─► xr/world-host.ts  (WorldHandle: load, enterVR, exitVR, onSessionChange)
                                     │ WorldScene { analysis, template, seed, clock, controls? }
                                     ▼
IWSDK world ─ ClockSystem ─► view systems (terrain, staff, structures, fx)       — unchanged
            ─ XRPlacementSystem: tabletop pose on session start / recenter; desktop pose on exit
            ─ XRControlSystem:   controller buttons + left-hand pinch ─► XRCommand ─► controls
            ─ XRPanelSystem:     UIKitML PanelUI (time, progress, buttons, template picker)
```

Scene graph: `anchor` (transform entity; position + yaw, unit scale) → `root` (diorama, scaled to 1.5 m, views
attach here) and `panel` (PanelUI entity, metres). Moving the anchor moves plate and panel together.

## Session (requirement 1)

- `World.create(container, { xr: { sessionMode: ImmersiveVR, referenceSpace: LocalFloor, offer: 'none',
  features: { handTracking: true } } })` (`XRFeatureOptions.handTracking`: optional feature flag).
- `WorldHandle.enterVR()` → `world.launchXR()`, `exitVR()` → `world.exitXR()`.
- `world.visibilityState` (signal, `VisibilityState.NonImmersive` outside XR) drives the 2D button label through
  `WorldHandle.onSessionChange(cb)` (subscribe with `signal.subscribe`) and the XR systems.
- IWSDK restores `world.camera` to its pre-XR transform on session end (`XROptions` camera restore, default on).
- The song is untouched: the world only reads `clock.now()`; the plan is not rebuilt.

## Placement (requirement 2)

`xr/xr-placement.ts` (pure):

- `yawFromQuaternion(q)`: heading of the head's forward vector projected on the floor (`atan2(-f.x, -f.z)` with
  `f = q · (0, 0, −1)`), so pitch and roll are ignored.
- `tabletopPose(head, yaw)`: position = head (x, z) + `VR_DIORAMA_DISTANCE_M` along the horizontal forward
  `(−sin yaw, 0, −cos yaw)`, `y = VR_TABLE_HEIGHT_M`; rotation `yaw` (the plate's +z edge faces the user).
- `XRPlacementSystem`: when `visibilityState` leaves `NonImmersive`, waits until the head pose is valid
  (`world.player.head` updated from the viewer pose, non-zero height) then places the anchor; on `recenter` it
  places it again; on session end it restores `DIORAMA_POSITION`, yaw 0.

## Input (requirements 3, 5)

`xr/xr-input-map.ts` (pure): `commandsFromPads(snapshot)` maps edges to `XRCommand`s —
`A`/`X` down → `toggle`, thumbstick entering left/right → `seek −5 / +5`, squeeze down → `recenter`.
The snapshot is read in `XRControlSystem` from `world.input.xr.gamepads.{left,right}` (`StatefulGamepad`:
`getButtonDown(InputComponent.A_Button | X_Button | Squeeze)`, `getAxesEnteringLeft/Right(InputComponent.Thumbstick)`).
The trigger is left to IWSDK's ray pointer (panel clicks).

`xr/pinch.ts` (pure): `PinchGesture.update(strength)` returns `'press' | 'release' | null`; press at
`PINCH_PRESS = 0.75`, release at `PINCH_RELEASE = 0.6`. Strength comes from
`world.input.xr.visualAdapters.hand.left.getPinchStrength()` (0 open at 5 cm, 1 at IWSDK's 8 mm commit distance), read
only while the left primary source is a hand (`input.xr.isPrimary('hand', 'left')`). A press toggles play unless the
panel entity has the `Hovered` tag.

Commands are executed through `WorldControls` (given by React with the scene): `toggle()`, `seekBy(sec)`,
`seek(sec)`, `selectTemplate(id)`, plus `title`, `duration()`, `templates` — the same functions the 2D
`PlayerBar` calls (`useSongPlayer`), so the clock stays unique.

## Spatial panel (requirement 4)

- Markup: `apps/web/public/ui/xr-panel.uikitml` (IWSDK 1.1.0 fetches and parses `.uikitml` at runtime:
  `PanelUISystem.loadPanel` → `loadUIKitMLComponent`; no Vite compile step needed in Next.js). Plain HTML tags
  (`div`, `span`, `button`) with ids, bundled MSDF font (inter), default `horizon` kit.
- Entity: `world.createTransformEntity(group, { parent: anchorEntity })` + `PanelUI { config }` +
  `RayInteractable` + `PokeInteractable`. After `PanelDocument` appears, `document.setTargetDimensions(w, h)` sets
  the size in metres; buttons get `addEventListener('click', …)`.
- Pose: above the plate's front edge (`VR_PANEL_OFFSET`), tilted back `VR_PANEL_TILT_DEG`; hidden
  (`object3D.visible = false`) while non-immersive.
- Time label and progress bar update only when the displayed second / progress percent changes
  (`setProperties`), never every frame.
- Template picker: up to `VR_PANEL_TEMPLATE_SLOTS` buttons; unused slots get `display: none`. Selecting a template
  calls `controls.selectTemplate(id)`; React rebuilds the scene and `WorldHandle.load` swaps the plan (views rebuilt
  once, clock unchanged). Until the template store (`06-template-store`) lands, the list holds the default template.

## Performance (requirement 6)

- Panel: UIKit batches panels and glyphs (one instanced panel mesh + one text mesh per font/material); budget check
  with `?perf=1` in VR.
- Multiview: IWSDK creates the renderer with `multiviewStereo: true`. The building window shader only appends GLSL
  after `#include <begin_vertex>` / `#include <color_fragment>` and declares varyings at the top of the chunk; three.js
  puts its own prefix (`#extension GL_OVR_multiview2`, `layout(num_views = 2) in;`, view-matrix defines) before the
  material code, and the chunk never reads `viewMatrix` / `projectionMatrix`, so it is multiview-safe. Checked by
  compiling the materials with an `OVR_multiview2` render target when the extension exists (see § As built).

## Verification (requirement 7)

- Unit tests: placement, yaw extraction, pinch hysteresis, command map, panel time formatting.
- `apps/web/scripts/xr-check.mjs`: Playwright + Chromium (SwiftShader) against `next dev` (IWER is installed only in
  development). The dev host exposes the emulated device as `window.__mwXRDevice` (development only) so the script can
  press A, push the thumbstick and switch to hands. It records placement, play state, `renderer.info` and frame time.
- Quest 3 steps (human): see § Human checks.

## As built (Phase 7, 2026-11-25)

- Task 2: `xr/xr-placement.ts` + property tests; `xr/systems/xr-systems.ts` (`XRRigComponent`,
  `XRPlacementSystem`); `installMusicSystems` now returns `anchor` (transform entity, position + yaw) with the scaled
  `root` as a plain child. `WorldHandle.onSessionChange` drives the 2D "Enter VR" / "Exit VR" label.
- Development hooks (only when `NODE_ENV === 'development'`): `window.__mwWorld`, `window.__mwXRDevice`, read by
  `apps/web/scripts/xr-check.mjs` (`playwright-core` dev dependency, Chromium from `~/.cache/ms-playwright`).
- IWER pitfall: while a session runs, IWER's runtime layer covers the page, so the 2D "Exit VR" button cannot be
  clicked with the mouse in the emulator (the script clicks it programmatically; the spatial panel offers Exit VR).
- Task 3: `xr/xr-input-map.ts` (pure bindings), `XRControlSystem` (edges read from `input.xr.gamepads`, no
  allocation when no edge), `WorldScene.controls` = `{ toggle, seekBy }` of `useSongPlayer`, so the 2D bar shows the
  state set in VR. Audio: the AudioContext is resumed in `toggle`; Chrome's sticky user activation (the Enter VR click)
  lets a later A-button toggle resume it.
- Multiview: super-three uses its multiview path only with `OCULUS_multiview` (Quest Browser), absent on desktop. The
  check script therefore takes every compiled program of the world, applies super-three's multiview rewrite
  (`WebGLProgram.js` § Multiview, with `GL_OVR_multiview2`) and compiles + links it on an `OVR_multiview2` context
  (SwiftShader exposes it): 14/14 programs pass, including the building window shader.
- Task 4: `public/ui/xr-panel.uikitml` (validated with `@drawcall/uikitml validate --kit horizon`),
  `xr/systems/xr-panel-system.ts` (`installXRPanel`, `XRPanelSystem`), `xr/panel-format.ts`. Deviation from the
  first design: player commands are no longer part of `WorldScene`; `WorldHandle.setControls(controls)` takes them
  (`WorldView` / `WorldCanvas` prop `controls`), so a new duration or template selection never rebuilds the plan by
  accident. `useWorldControls` + `useTemplateChoice` (player feature) build them; `BUILTIN_TEMPLATES` lists the
  picker's templates (only `neon-nocturne` until the template store lands, so a live template switch is not yet
  exercised in IWER).
- Panel clicks in IWER need `pointerdown` → `pointerup` within the 300 ms click threshold of the pointer events:
  SwiftShader renders a stereo frame in ≈ 250 ms, so the script skips panel clicks unless `MW_ANGLE=vulkan` (GPU).
  The panel text uses the bundled MSDF Inter font: avoid characters it lacks (U+2212 minus rendered as a box).
- Task 5: `xr/pinch.ts` (`PinchGesture`, press 0.75 / release 0.6, property-tested), driven in `XRControlSystem` from
  `visualAdapters.hand.left.getPinchStrength()` while the left primary source is a hand; skipped while the panel
  entity has `Hovered` (`rig.panel`). IWER check: `primaryInputMode = 'hand'`, `hands.left.setPinchValueImmediate(v)`
  (IWER pinch 0.70 → strength 0.40: no toggle; 1.0 → strength 1.0: toggle, twice).
- Task 6 (steady state): `ClockSystem` keeps the previous `WorldState` while `t` and the plan are unchanged (paused:
  no allocation); `StaffView` and `FxView` skip their update when `t` is unchanged (like `StructureView`), and
  `StaffView` reuses its glyph counter map; the panel rebuilds its time text only when the displayed second changes
  and its title / template buttons only when the controls object changes. Unit test: no instance buffer re-upload
  while paused (`views.test.ts`).

## Performance (requirement 6)

IWER (Meta Quest 3 profile), headless Chromium 1248, `next dev`, `/play/demo`, 2026-11-25,
`MW_ANGLE=vulkan node apps/web/scripts/xr-check.mjs` (GTX 960M laptop, vsync and frame-rate limit off):

| Measure | Value |
|---|---|
| Draw calls in VR, both eyes, no multiview (IWER) | 40 at entry · 46 with the panel, controllers and hands |
| Draw calls per eye (≈ multiview count on Quest) | ≈ 20–23 (budget < 100) |
| Triangles (both eyes) | ≈ 145 k |
| Frame time (stereo, uncapped, GPU) | ≈ 6.2 ms |
| Frame time (SwiftShader CPU raster) | ≈ 250–300 ms (not representative; panel clicks skipped) |
| Memory after 3 seeks while playing | 26 geometries / 12 textures before and after |
| Multiview compile check | 17–18 programs (world, panel, controllers) compile and link with `OVR_multiview2` |

Script result: 27/27 checks with `MW_ANGLE=vulkan`, 21/21 (+ panel clicks skipped) with SwiftShader.

## Human checks (Quest 3, not done — needs a headset)

1. `pnpm -C apps/web exec next dev --experimental-https -p 3125 -H 0.0.0.0`; open `https://<laptop-ip>:3125/play/demo`
   in Quest Browser (same Wi-Fi, accept the certificate), or the deployed URL after Phase 8.
2. Press Play once in 2D (unlocks audio), then Enter VR. Check: plate at table height ≈ 1.3 m ahead, panel above its
   front edge, A/X play-pause, thumbstick ±5 s, grip recenters, panel buttons with the trigger ray and with a poke.
3. Put the controllers down (hand tracking): left pinch toggles play; pinch while pointing at the panel clicks it
   instead; light pinches (pointing) must not toggle.
4. fps: Quest Browser performance HUD (or `metavr` perf tools) on the demo song: ≥ 72 fps for the whole song; then try
   `session.updateTargetFrameRate(90)` and keep it only if 90 holds. Check the building windows render in both eyes
   (multiview) and glyph readability at 1 m.
5. Record date, device, fps, draw calls here and in `docs/handoff.md`; then tick `03-world-engine-core` task 7.

## Keyboard in VR (2026-11-24)

The keyboard also works during an immersive session (emulator on a desktop, or a Quest with a Bluetooth keyboard), through
`xr/keyboard-pad.ts`. It follows the IWER emulator's mapping (source: the IWSDK testing guide of the Meta docs: `W A S D`
= left thumbstick, arrows = right thumbstick, `Q` / `E` = left trigger / squeeze, `Left Shift` + `W A S D` moves the
emulated headset) and adds the commands a headset without controllers needs:

| Keys | Action |
|---|---|
| `W A S D` | glide in the immersive scale (left stick) |
| `←` `→` or `Q` `E` | snap turn 30° (right stick) |
| `Space` | play / pause |
| `[` `]` | seek back / forward 5 s |
| `R` | recenter the spatial panel |
| `G` or `B` | diorama ↔ world around you (the B / Y button) |

Controller sticks and keys are merged by taking the larger value per axis, so in the emulator, where the same keys also move
the emulated sticks, nothing moves twice. Outside a session the keys belong to the page (the desktop navigation keys are
unchanged) and Space is not captured. Text fields and Ctrl / Alt / Meta shortcuts are ignored.
