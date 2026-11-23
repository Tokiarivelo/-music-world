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
