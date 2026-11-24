# I7 — Immersion and explore mode: you stand inside the world

## Goal

"In immersive mode we are very big compared to the scenery: I want to be completely bathed in the universe. Same for the
3D explore mode." The listener must feel small and inside the world (streets, trees, aurora overhead), not like a
giant looking down at a miniature.

## Current state

- The world is a **diorama**: `DIORAMA_WIDTH_M = 1.5` placed at `DIORAMA_POSITION (0, 0.85, -1.3)` in front of the
  user in VR (`xr/constants.ts`), so the user looms over a table-top model.
- The desktop cinematic camera looks at the plate from 2.5 m with a 20° FOV; the explore mode (`08-navigation-mode`)
  orbits around the plate, with the camera clamped above it (`clampPose`).
- Structure heights and footprints are normalized to the plate; there is no eye-level reference.

## Requirements

1. A **scale mode** SHALL exist per session: `diorama` (today, default for the cinematic desktop view and the
   reference screenshot) and `immersive` (new default in VR and in a new explore "Walk" mode). In `immersive` the
   plate is about 60–120 m wide in real units; the user's eye is at 1.6 m (VR: tracked floor height) inside it, and
   buildings are 4–40 m tall.
2. IN VR the user SHALL start on the ground near the plate's edge looking toward the center, can teleport (controller
   thumbstick or pinch-and-point) or glide slowly (≤ 2 m/s, vignette while moving), and may switch back to a diorama on
   the table with the panel button. Snap or smooth turn: setting, default snap 30°.
3. THE explore mode SHALL gain "Walk": first-person on the ground (WASD + mouse look, touch joystick on phones),
   eye height 1.6 m, collisions with structures (simple 2D footprint circles from the spawn plan), clamped to the
   plate plus margin; "Orbit" (today) remains; a toggle switches both, keeping position.
4. SCALE SHALL be applied by the **view**, not the engine: `worldStateAt` and layout keep normalized units; a single
   `worldScale` transform (and a camera / rig offset) maps them to meters. Tests: state equality in both modes.
5. THE environment (I2) and the aurora (I6) SHALL be scaled to match (sky dome beyond the plate, curtains 40–120 m
   high, fog tuned to the distance) and the audio SHALL stay stereo (no spatialization requirement in this phase).
6. COMFORT: no forced camera motion; vignette on continuous motion; reduced motion disables glide; head-locked UI only
   as small panels; the spatial panel follows `xr-iwsdk.md` placement rules.
7. PERFORMANCE: instancing, culling and LOD: structures beyond 60 m use the lowest recipe detail or are replaced by a
   billboard; stay < 100 draw calls and ≥ 72 fps on Quest 3 (tier switch from I6 reused).
8. Settings (scale mode, locomotion, turn style, vignette) SHALL persist per browser and be reachable from the VR panel
   and the 2D menu; labels from the locale files (I3).

## Design

- `xr/scale.ts`: `WORLD_SCALE = { diorama: 1, immersive: 80 }`, `applyScale(root, mode)`; positions of nodes and
  meshes are scaled by the root transform, the lighting and shadow distances recomputed.
- `xr/systems/locomotion-system.ts`: teleport arc + glide + snap turn (IWSDK locomotor if available — check the
  `hz-iwsdk-webxr` skill — otherwise a small custom system), `WalkController` for desktop and touch.
- Collision: circle footprints from `spawn-plan` (pure), push-out resolution in 2D; unit tested.
- Camera rig: in VR the `player` rig sits at the start point on the ground; the plate's floor is y = 0.
- Terrain mountains and hills (I2) are scaled with the plate so the horizon is far.

## Tasks (one commit each)

1. `xr/scale.ts` and the `worldScale` root transform; tests that state is mode-independent; diorama unchanged
   (screenshot equality at the default pose).
2. Re-tuned lights, fog, shadow distance and near/far planes for the immersive scale; budget tests.
3. VR rig: start pose, teleport, glide with vignette, snap turn; panel toggle Diorama / Immersive; xr-check in IWER.
4. Walk mode on desktop and touch; collisions with footprints (pure, property tests); toggle with Orbit.
5. LOD for distant structures; draw-call/frame tests.
6. Settings persistence and UI; docs (`xr-iwsdk.md`, README, `PROJECT.md` §7).
7. Quest 3 check (human): comfort, scale feel, fps, hands and controllers.

## Verification

IWER scripted session (start pose, teleport, snap turn), Vitest for collision/scale, Playwright walk screenshots,
Quest 3 for comfort. Record fps and draw calls in `design.md` § As built.

## Risks

Motion sickness: keep glide optional and slow. Depends on I2 (environment) and I6 (sky scale), so do I2 first.
