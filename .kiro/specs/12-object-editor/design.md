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
