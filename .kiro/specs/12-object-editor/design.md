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
