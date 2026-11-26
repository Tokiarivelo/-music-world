# Design — 12 object editor

- Extend `ShapeRecipe` (see `shape-kind` skill) from a flat op list to a **part tree**: `{ id, name, primitive, transform,
  material: { colorRole | hex, emissive, roughness, texture }, children }`. Stock builtin shapes (house-shapes.ts) are
  expressed as recipes so they open in the editor; geometry is built by one pure `buildRecipeGeometry`.
- Editor UI under `features/template-editor/` (feature-first): inventory panel, part tree, inspector, viewport
  (IWSDK scene reused in a small canvas), toolbar. History is a command stack (like `useNoteEdits`).
- Textures: procedural shaders keyed by name first (no downloads), then an optional CC0 atlas.
- Budgets reuse `docs/` perf numbers (draw calls, triangles) and show them in the inspector.

## As built (phase 1, part tree)

- `PartNode` is a **flat list with `parent` ids** (parents first, ≤ 48 nodes, depth ≤ 4), not nested children: the JSON
  schema stays non-recursive and the outliner order is the list order. `nodes` lives beside the legacy `parts`; both are
  built into one geometry by `buildRecipeGeometry`. `recipeToNodes` migrates operations (a spike gains a bottom cap).
- Triangle mirror in `shape.py` (`node_primitive_triangles`), parity fixtures in `apps/api/tests/fixtures/shape-recipes.json`.
- Deviation: the runtime builtin kinds (`house-shapes.ts`, `object-shapes.ts`) keep their lit, shader-driven geometry;
  `xr/shapes/stock-recipes.ts` holds simplified editable copies. Replacing the runtime kinds by recipes is a later step
  (needs normals and colour roles in nodes, phase 4).

## As built (phase 2, inventory, part tree, inspector)

- All under `features/template-editor/`. Pure models first: `lib/inventory-model.ts` (`templateObjects`: every kind with
  role, origin recipe/builtin, city kind, authored-model flag, usage counts of rules, scenery and zones),
  `lib/node-model.ts` (immutable part tree edits: rename, hide, duplicate with subtree, delete with subtree, add under a
  parent, primitive swap, clamped numbers; limits 48 nodes and depth 4 mirror `shape.py`), `lib/object-source.ts`
  (recipe of an object, stock copy), `lib/thumbnail.ts` (software isometric flat-shaded projection, `sceneFaces`).
- Thumbnails and the object viewport are **2D canvas drawings of the built geometry**, not WebGL: no GL context per
  list item, deterministic, testable. The viewport orbits by drag or arrow keys and highlights the selected part. It is
  an editor view, not the lit world view (the map-creator preview in phase 3 uses the real engine).
- Builtin kinds with a stock recipe (building, tree, conifer, car) open read-only; "Edit a copy" adds the stock recipe to
  `template.recipes` under a fresh name. It does not rewire mappings: pick the new kind in the rules. Authored models
  and effects have no editable shape yet.
- Components: `InventoryPanel`, `ObjectThumb`, `ObjectEditor` (viewport + `PartTreePanel` + `PartInspector`), wired in
  `EditorShell` above the form. Strings in `editor.json` (en, fr, mg): `inventory.*`, `parts.*`, `inspector.*`, `viewport.*`.
- Editor layout: the world preview fills the page; the form is a toggleable **glass panel** over it (translucent
  `--mw-bg`, `backdrop-blur-2xl`, rounded, slide-in; `inert` + `aria-hidden` when hidden, "Show panel" button when closed).

## As built (phase 3, map creator)

- Schema: `layout.placed` (≤ 400 `PlacedObject` `{id, kind, x, y, z, yaw°, scale, variant, color}`, x/z metres from the
  plate centre, ±64) and `layout.seed`; a `recipe:` kind must exist in `recipes` (validator). The director's layout call
  replaces `layout`, so a map made by hand must not be re-laid out by it.
- Engine: `placedRecords` in `spawn-plan.ts` appends the placed objects after the template scenery (`noteId`
  `scenery:placed:<id>`, standing and fully grown at t = 0, counted in `sceneryCount`); `layout.seed` replaces the
  project seed. `worldStateAt` is unchanged; no editor code runs in the playback loop.
- Feature `features/map-creator/`: pure `map-model` (create, place with grid snap, move, update, remove, copy, array,
  replace kind, box and click pick), `plan-view` (ground ↔ pixels, rotate and scale handles, hit test), `history`
  (undo / redo, 100 steps), `map-draft-storage` (localStorage, guarded). The editor is a **plan (top-down) view on a 2D
  canvas** with in-canvas handles (drag to move, rotation handle, scale handle, drag the ground for a box select); the
  real 3D world is the **Preview** button (`PreviewPlayback` on the unsaved map, the editor stays mounted so back keeps
  the state). Page `/maps`, glass side panel like the template editor.
- Save uses the template store (`POST` then `PUT` a private draft), so moderation and storage are the template ones.
  The browser draft is restored on the next visit (read with `useSyncExternalStore`, no hydration mismatch).
- Not done: a 3D gizmo in the world view (plan-view handles instead), picking a store template inside the create dialog
  (use `?from=<id>`), the placed object's own part overrides (`overrides` of the spec: only `color` and `variant`).

## As built (phase 4, part tools and look)

- 4.1: pure `mirrorNode` (copy of the subtree, position negated and rotation flipped on the axis), `arrayNode` (2–8
  copies, spacing along an axis) and `nudgeNode` in `lib/node-model.ts`, buttons in `PartTreePanel`. All respect the
  48-node limit (unchanged when exceeded). Deviation: the "gizmo" is the numeric fields plus ±0.05 m nudge buttons;
  the object viewport is a 2D canvas, so drag handles are not added there.
- 4.2: `PartNode.material` `{color, color_role, emissive, roughness}` (pydantic `PartMaterial`). A tint is a **vertex
  colour** multiplied by the instance colour (white keeps the object colour; it never replaces it); a palette role is
  resolved with the template palette in `buildNodeGeometries(nodes, palette)`; `emissive` brightens the vertex colour
  up to ×1.6 (works unlit and lit). Roughness only applies with `fx.material = polished` and is the **mean of the
  parts that set one** (the lit material has one value per kind: `recipeRoughness`). The 2D viewport and thumbnails do
  not show tints yet. Legacy `parts` get white vertex colours when a node is painted (merge needs equal attributes).
- Template editor usability: every field has a plain-language `hint` (`hint.*` keys, en/fr/mg) under it, number fields
  show their range and a slider next to the exact box (`fields/Hint.tsx`, `NumberInput`, `BoundedNumber`,
  `SelectInput`, `ColorInput`, `ToggleInput`); the part inspector explains position, rotation, size and look.
  Zones, rules and recipe parts do not have hints yet.
- Follow-up to 4.2: tints show in thumbnails and the 2D viewport (`faceFill`, per-triangle vertex colour in
  `sceneFaces`). Zones are explained: intro text, a top-view `ZoneMap` (far edge up, numbered like the list), quick
  placements (`zone-model.ts`: whole, halves, centre), coverage %, and bound hints (-1 edge, 0 centre, 1 edge). Rules,
  recipes and recipe parts have hints too.
