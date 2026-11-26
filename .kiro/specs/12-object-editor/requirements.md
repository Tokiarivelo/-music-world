# 12 — Object editor (Blender-like)

Asked on 2026-11-26. Builds on `09-template-editor` (template fields) and the shape pipeline (`shape-kind`, `ShapeRecipe`).

1. **Inventory.** The template editor lists every object a template uses (scenery, mapping spawns, recipes, city kinds,
   authored models) with a thumbnail, count and where it is used; selecting one opens it.
2. **Parts.** An object is a tree of named parts (a house: walls, roof, chimney, door, windows). Each part can be
   selected, renamed, hidden, duplicated, deleted and added.
3. **Part tools.** Per part: move, rotate, scale (numeric fields and viewport gizmo), mirror, array, extrude,
   bevel, boolean union/subtract, primitive swap (box, cylinder, cone, sphere, prism, gable).
4. **Look.** Per part: colour, emissive, roughness, texture (procedural patterns first: brick, wood, stone, tile,
   glass; then a CC0 image set), and a palette role so the template palette can still recolour it.
5. **Variants.** An object may hold several variants (e.g. 9 building types); colour jitter ranges per variant.
6. **Data only.** Edited objects are validated `ShapeRecipe` data (never executed); saved with the template; the
   schema pipeline generates the types; budgets (triangles, draw calls) are shown live and enforced.
7. **Undo/redo**, reset to the original, and a diff against the stock object.

8. **Map.** A creator makes a map from an empty plate or a stock template (environment, plate size, seed, name) and saves it
   as a user map with the same storage and moderation path as templates.
9. **Placement.** Objects from the inventory are placed by clicking the ground, moved and rotated and scaled with a gizmo,
   snapped to the street grid in cities, copied, pasted, arrayed and deleted; an object can be replaced by another kind or
   variant and edited with the part editor.
10. **Layout data.** A map is a `WorldLayout` plus hand-placed objects `{ id, kind, position, yaw, scale, variant,
    overrides }`; they stand before the first note and notes still spawn their own objects around them.
11. **Preview.** A Preview button opens the same world view as `/play/<id>` (engine, cameras, walk, song clock) on the map
    being edited, unsaved; going back keeps the state. No editor code runs in the playback loop.
12. **Draft.** Undo / redo, autosave of the draft in the browser, then save through the API.

Out of scope: arbitrary mesh sculpting and importing unlicensed assets (repo is MIT; CC0 only, listed in
`apps/web/public/models/LICENSE.md`).
