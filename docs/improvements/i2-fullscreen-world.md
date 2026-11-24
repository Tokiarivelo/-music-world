# I2 — The 3D space fills the whole screen

## Goal

"The 3D space must fully fill the screen: there are black areas everywhere, complete them." The world must have no
empty black margin on any screen shape; what is beyond the plate must look like a place (sky, horizon, ground).

## Current state (to confirm with screenshots in task 1)

- `WorldCanvas` is `h-full w-full`, but the page may not give it `100dvh` (player bar, padding), so bands appear.
- The camera has a narrow FOV (20°) at 2.5 m looking at a plate of ~12 m (`xr/constants.ts`
  `DESKTOP_CAMERA_*`); the plate is a floating slab in a single flat color (`scene.background =
  palette.background`, `world-systems.ts`). Everything outside the plate is that flat dark color.
- `DIORAMA_WIDTH_M = 1.5` and the "cinematic" pose are tuned for one aspect ratio.

## Requirements

1. THE world container SHALL cover the whole viewport (`100dvh` × `100vw`, safe-area insets on phones), under the
   overlays; the canvas SHALL resize with the window and device pixel ratio (capped at 2).
2. THE view SHALL contain an environment beyond the plate: a sky gradient (zenith → horizon from the palette), a
   horizon glow, distant terrain (a ring of low hills), a ground plane that fades into fog, and stars or soft clouds
   (still, view-only, seeded).
3. NO pixel row or column of the canvas SHALL be pure background color: measured by a screenshot test, ≥ 99 % of
   pixels differ from `palette.background` by more than a small threshold for five aspect ratios (16:9, 21:9, 4:3, 1:1,
   9:16).
4. THE cinematic camera SHALL adapt to the aspect ratio (fit the plate in width on portrait, in height on landscape)
   without changing the default framing at 16:9.
5. THE environment SHALL cost ≤ 6 draw calls and ≤ 5 k triangles, with no texture bigger than 1024² (shader gradients
   preferred), and it SHALL NOT affect `worldStateAt` (view only).
6. IN VR the same environment surrounds the user (sky dome, ground), see I7 for scale.
7. `prefers-reduced-motion`: no animated clouds or star twinkle.

## Design

- `xr/views/environment-view.ts`: `EnvironmentView` with a sky dome (large inverted sphere, `ShaderMaterial` gradient
  with 3 palette stops + horizon glow + optional star noise), a ground disc (radius 60 m, vertex color fade to fog),
  `Fog` on the scene matching the horizon color, a hills ring (one merged geometry, seeded by the template seed).
- Palette → environment colors via `palette.ts` helpers; I4 later re-colors it without code change.
- Camera: `desktopCameraPose(aspect)` pure function; distance/FOV adjusted so the plate's bounding box fits;
  unit-tested on the five aspect ratios.
- Layout: the play page gives the canvas `fixed inset-0`; overlays are absolutely positioned.

## Tasks (one commit each)

1. Reproduce: Playwright screenshots at the five ratios, a `blank-ratio` helper, record the baseline in `design.md`.
2. Full-viewport container and resize handling (`ResizeObserver`, DPR cap); safe-area CSS; test.
3. `desktopCameraPose(aspect)` and its property tests; wire into the navigation cinematic pose.
4. `EnvironmentView` (sky, ground, fog, hills) with draw-call/triangle budget tests.
5. Screenshot test of the blank ratio on the five aspect ratios; fix what remains; docs (`frontend.md`, README).

## Verification

`blank-ratio ≥ 99 %` at five ratios; draw calls recorded; xr-check headless run; Quest check with I7.

## Risks

Fog and sky must keep the staff and notes readable (contrast test with the staff color). Vulkan flag needed for
headless rendering (`MW_ANGLE=vulkan`).

## Baseline (task 1, before any change)

`node apps/web/scripts/blank-ratio.mjs --baseline` against `next dev`, SwiftShader, demo song, share of canvas pixels
that differ from `palette.background` (`#07051a`) by more than 6 per channel:

| Ratio | Viewport | Filled | Cause |
|---|---|---|---|
| 16:9 | 1280×720 | 70.7 % | plate corner and sky band stay flat |
| 21:9 | 1260×540 | 57.9 % | plate does not reach the top and left |
| 4:3 | 1024×768 | 76.4 % | same |
| 1:1 | 800×800 | 78.8 % | same |
| 9:16 | 450×800 | 81.0 % | plate wider than the view (cropped), flat band on top |

The canvas already covers the viewport in these runs (`h-dvh`); the black areas are the scene behind the plate.

## As built (2026-11-24, branch `phase-I2-fullscreen-world`)

- **Layout / resize** (task 2): `WorldCanvas` root is `fixed inset-0`; `world-host.ts` `fit()` runs on mount and from a
  `ResizeObserver` (`renderer.setPixelRatio(min(dpr, 2))`, `setSize`, `camera.aspect`); skipped while an XR session runs
  and redone when it ends. `viewport-fit=cover` in `app/layout.tsx`; the Enter VR button uses the safe-area insets.
- **Camera** (task 3): `cinematicDistance(aspect) = 2.5 m × max(1, (16/9) / aspect)`: 16:9 and wider keep the exact
  framing, narrower views move back so the plate width stays visible. The distance is the only thing that changes (same
  azimuth, elevation, FOV). `NavigationController.setAspect` re-fits the cinematic / overview pose at once and leaves
  an explored pose alone. `NAV_DISTANCE_MAX_M` 6 → 9 so 9:16 (7.9 m) stays inside the clamp.
- **Environment** (task 4): `EnvironmentView`, a world-fixed child of the scene (not the scaled diorama, so it also
  surrounds the user in VR): sky dome (shader gradient zenith → mid → horizon, horizon glow, hashed still stars), a
  ground disc (radius 60 m, vertex colors fading to the horizon color), two seeded hill rings, `Fog` of the horizon color
  (14–58 m). `environmentColors(palette)` derives every color. 3 draw calls, ≈ 1.8 k triangles, no texture. Camera far
  plane raised to 300 m. Nothing is animated, so `prefers-reduced-motion` needs no special case.
- **Plate sides** (task 5): `PLATE_SIDE_LIGHT` 0.55 → 0.8; the plate's side faces were almost exactly `#07051a` and
  counted as blank (≈ 2 % of the view). They are still the darkest part of the plate.

### Results (`blank-ratio.mjs`, SwiftShader, demo song)

| Ratio | Before | After |
|---|---|---|
| 16:9 | 70.7 % | 99.9 % |
| 21:9 | 57.9 % | 99.9 % |
| 4:3 | 76.4 % | 99.9 % |
| 1:1 | 78.8 % | 100.0 % |
| 9:16 | 81.0 % | 100.0 % |

`xr-check.mjs` with `MW_ANGLE=vulkan`: all checks pass (46 draw calls in VR without panel, 52 with; the only failure is
the documented `500` from `/api/*` without a backend). With SwiftShader the check "leaving VR keeps the song state"
failed once at ≈ 750 ms/frame (timing); it passes on the GPU. Not done: a Quest check (I7), a horizon view in the
cinematic pose (the camera looks down 31°, so sky and hills show only when exploring or in VR).
