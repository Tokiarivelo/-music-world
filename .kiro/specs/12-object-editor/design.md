# Design — 12 object editor

- Extend `ShapeRecipe` (see `shape-kind` skill) from a flat op list to a **part tree**: `{ id, name, primitive, transform,
  material: { colorRole | hex, emissive, roughness, texture }, children }`. Stock builtin shapes (house-shapes.ts) are
  expressed as recipes so they open in the editor; geometry is built by one pure `buildRecipeGeometry`.
- Editor UI under `features/template-editor/` (feature-first): inventory panel, part tree, inspector, viewport
  (IWSDK scene reused in a small canvas), toolbar. History is a command stack (like `useNoteEdits`).
- Textures: procedural shaders keyed by name first (no downloads), then an optional CC0 atlas.
- Budgets reuse `docs/` perf numbers (draw calls, triangles) and show them in the inspector.
