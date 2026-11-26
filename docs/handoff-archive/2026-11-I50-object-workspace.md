# Archived session 2026-11-26 (phase I50)

## 2. Last session (2026-11-26, Claude Code, phase I50 `phase-I50-object-workspace`)

- Why: in the template editor the inventory thumbnails showed generic procedural shapes (letters for objects with a 3D model)
  and editing a part meant a small 2D canvas in the sidebar.
- 6.1 Thumbnails draw the authored GLB the world uses (`lib/model-mesh.ts`).
- 6.2 `lib/object-stage.ts`: framework-free WebGL stage (three OrbitControls + TransformControls, no new package); pure
  `lib/gizmo-math.ts` turns a gizmo pose into local node fields. 6.3 `ObjectWorkspace` (full screen): tool shelf, outliner,
  properties, view options (views, ortho, solid / wire / x-ray, snap, isolate), status bar, Blender-like shortcuts (`?`).
- 6.4 New tools: radial array, reset transform, drop to floor, centre on axis. i18n en/fr/mg (`workspace.*`).
- Removed: `ObjectEditor`, `PartTreePanel`, `ObjectViewport` (+ tests). The world preview is unmounted while the workspace is open.
- Deviations / limits: single selection, no re-parenting in the outliner, scale gizmo changes the part's size only. The
  stage has no unit test (no WebGL in jsdom): checked in headless Chromium (screenshot of a house with the move gizmo).
- Checks: see section 1.
