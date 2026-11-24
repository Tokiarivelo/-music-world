# Design Document — 08 Navigation Mode

## Overview

Sources: `xr-iwsdk.md`, `frontend.md`, `07-xr-mode/design.md`, and the author's `mitsinjo-grid` project (MIT, same
author), read-only: `features/microgrid-3d/ui/camera-controller.tsx` and `features/simulation/ui/village-viewport.tsx`.

What the reference does (React Three Fiber + Drei `OrbitControls`): left drag orbits, right drag pans, wheel / middle
dollies; touch one finger orbits, two fingers dolly + pan; a "hand tool" swaps pan and orbit; `maxPolarAngle ≈ π/2.15`
and min / max distance; `screenSpacePanning = false` (pan along the ground, never under the terrain); damping; six
named camera presets with a wall-time-capped tween; a reset button; orbit `enabled = !xrActive`, camera parented to a
rig in XR; preset bar hidden in XR; keyboard handlers ignore `<input>` / `<textarea>`.

What we adopt: the same gestures, ground-plane pan, pitch / distance clamps, named presets + reset, easing capped in
time, input off in XR, buttons hidden in XR, editable-target guard. What we change: no R3F / Drei (forbidden by
`tech.md`); the camera math is our own pure module (property-tested) instead of `OrbitControls`, because the pose must
be clamped against the diorama, eased between presets and gated by the IWSDK session state in one place. IWSDK 1.1.0
has no desktop orbit camera: its typings (`init/world-initializer.d.ts`, `locomotion.browserControls`) state that
"camera ownership remains app-controlled: rotate `world.camera` yourself for pointer-lock, orbit, touch-look"; its
locomotion moves `world.player` and needs locomotion environments + physics (kept off, `tech.md`).

```text
React  WorldCanvas ─ NavigationControls (Explore toggle, presets, reset; hidden in VR)
                   └ useNavigationShortcuts (N, R, 1–4; editable-target guard)
          │ WorldHandle: setCameraMode(mode) · setViewPreset(id) · resetView() · onNavigationChange(cb)
          ▼
xr/world-host.ts ─ NavigationRig { mode, preset, pose, goal, input, reducedMotion }
          │
          ├─ navigation/navigation-input.ts  DOM pointer / wheel / key events → NavigationInput (accumulated deltas)
          ├─ navigation/orbit-camera.ts      pure: OrbitPose, poseToCamera, orbit, pan, zoom, fly, clampPose,
          │                                  approachPose, VIEW_PRESETS, cinematicPose
          └─ systems/navigation-system.ts    IWSDK system: drain input → pose → world.camera (skipped in XR)
```

## Camera pose (requirements 1, 2, 4)

`OrbitPose = { target: {x,y,z}, yaw, pitch, distance }` in world metres / radians. Camera position =
`target + distance · (cos pitch · sin yaw, sin pitch, cos pitch · cos yaw)` — the same convention as
`desktopCameraPose()` (azimuth = yaw, elevation = pitch), so `cinematicPose()` reproduces it exactly.

- `orbit(pose, dxPx, dyPx)`: `yaw -= dx · k`, `pitch += dy · k` (`k = NAV_ROTATE_RAD_PER_PX`).
- `pan(pose, dxPx, dyPx, viewportPx, fovDeg)`: metres per pixel at the target =
  `2 · distance · tan(fov / 2) / viewportPx`; target moves along the ground right vector `(cos yaw, 0, −sin yaw)` and
  forward vector `(−sin yaw, 0, −cos yaw)` so the plate follows the pointer ("grab" pan).
- `zoom(pose, factor)`: `distance · factor` (wheel: `exp(deltaY · NAV_WHEEL_ZOOM)`, pinch: previous / current spread).
- `fly(pose, keys, dtSec)`: ground move at `NAV_FLY_SPEED · distance` m/s (×3 with Shift), turn at
  `NAV_TURN_SPEED` rad/s, zoom at `NAV_KEY_ZOOM_RATE`; `dt` capped at 0.1 s.
- `clampPose`: pitch [5°, 85°], distance [0.35, 6] m, target within 0.9 m of the plate centre on x / z and between
  the plate top and 0.6 m above it on y; yaw wrapped to (−π, π]. Every op returns a clamped pose (property tests).
- `approachPose(current, goal, dtSec)`: exponential easing (`NAV_EASE_PER_SEC`) with the shortest yaw path, snaps
  when within epsilon or after `NAV_EASE_MAX_SEC` (like the reference's capped tween).

Presets (offsets from the diorama centre; the city zones of `neon-nocturne` lie on the −x side):

| Id | Target offset (m) | Yaw | Pitch | Distance |
|---|---|---|---|---|
| `overview` | cinematic (`DESKTOP_CAMERA_*`) | 27° | 31° | 2.5 m |
| `staff` | (0, 0.1, 0) | 27° | 20° | 1.1 m |
| `city` | (−0.38, 0.12, −0.2) | −40° | 24° | 1.2 m |
| `top` | (0, 0, 0) | 0° | 85° | 3.2 m |

## Input (requirements 2, 3)

`NavigationInput` is a plain class (no DOM, unit-tested) that turns pointer / wheel / key calls into accumulated
deltas: `pointerDown(id, x, y, button, shift)`, `pointerMove`, `pointerUp`, `wheel(deltaY)`, `key(code, down)`,
`blur()`, and `drain(out)` returns orbit / pan / zoom since the last frame and the held keys. One pointer orbits (or
pans with right / middle button or Shift); two pointers pinch-zoom by spread ratio and pan by midpoint motion. Any
user motion marks `moved` (clears the selected preset).

`bindNavigationInput(canvas, input, isEnabled)` attaches `pointerdown/move/up/cancel`, `wheel` (passive: false,
`preventDefault` only while enabled), `contextmenu` (blocked while enabled) on the canvas and `keydown/keyup/blur` on
the window; key events go through `isEditableTarget` and ignore Ctrl / Alt / Meta. It returns an unbind function
called by `WorldHandle.dispose()`. `touch-action: none` is set on the canvas only in the explore mode. The 2D overlays
are siblings above the canvas, so their pointer events never reach it.

The React shortcuts (`N`, `R`, `1`–`4`) live in `useNavigationShortcuts` (world-view feature) with the same
`isEditableTarget` guard; held movement keys are read by the xr input binding. Arrows and space stay with the player.

## System (requirements 1, 4, 5, 6)

`NavigationSystem` (registered after the XR systems) runs each frame:

1. If immersive (`isImmersive(world)`): `input.clear()`, return — the headset owns the camera; IWSDK restores the
   pre-session camera transform on exit, then the next desktop frame writes the current pose again.
2. In the explore mode: apply drained orbit / pan / zoom / keys to `rig.goal` (clamped); if the user moved, set
   `rig.pose = rig.goal` (direct manipulation, no lag) and clear the preset.
3. `rig.pose = approachPose(rig.pose, rig.goal, delta)` (snap when `reducedMotion`); in the cinematic mode the goal is
   `cinematicPose()` and input is discarded.
4. Write `world.camera.position` and `lookAt(target)` only when the pose changed (reused vectors, no allocation).

The camera is never read by the engine; the audio clock and `worldStateAt` are untouched.

## Verification (requirements 5.4, 6.2)

- Vitest: `xr/navigation/*.test.ts` (pure math + property tests, input reducer, DOM binding with synthetic events),
  `xr/world-host.test.ts` (commands, listener removal on dispose), `features/world-view/__tests__` (toggle, presets,
  reset, shortcuts, editable-target guard, hidden in VR).
- Headless Chromium (Playwright, `--use-angle=vulkan`) on `next dev`: screenshots of cinematic, explore after a drag,
  each preset, mobile width; `renderer.info.render.calls`.
- `MW_ANGLE=vulkan node scripts/xr-check.mjs` once.

## As built

- `xr/navigation/navigation-controller.ts` holds the state (mode, preset, pose, goal, ease); `systems/navigation-system.ts`
  only feeds it frame time and copies the pose to `world.camera` when the pose object changes (poses are immutable, so
  an identity check is enough; no per-frame allocation). The host (`world-host.ts`) binds the input to the canvas, sets
  `touch-action: none` only while exploring, reads `prefers-reduced-motion`, and unbinds on `dispose()`.
- `WorldHandle` commands: `setCameraMode`, `setViewPreset`, `resetView`, `onNavigationChange`.
- UI: `NavigationControls` sits top-right under the Enter VR button (a bottom placement was covered by the player bar:
  found by the headless check). Hidden in VR; `useNavigationShortcuts` ignores editable targets, modifiers and repeats.
- Headless Chromium (`--use-angle=vulkan`, `/play/demo`, 1280×720 and 390×760): a drag in the cinematic mode leaves the
  camera at `(0.973, 2.228, 0.609)`; in explore the same drag moves it; Staff / City / Top / Overview reach their
  presets after the ease, `R` then `N` return to the cinematic pose; draw calls stay at 15 in all states; no page error.
- `MW_ANGLE=vulkan node scripts/xr-check.mjs`: every XR check passes (46 draw calls in VR); the final console check
  fails only on `500` from `/api/*` because no backend ran during the check (run with the API up, or `DEV_API_URL`).
