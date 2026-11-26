# Next task — Object editor and map creator

> Spec: `.kiro/specs/12-object-editor/` (requirements, design, 10 tasks). This file is the briefing for the session
> that starts it. Several sessions of work; one spec task per commit (see `.kiro/steering/handoff.md`).

## Goal

A creator can (1) open any template and see **every object it uses**, (2) edit an object **part by part** like in
Blender, (3) build **their own map** (place, move, remove, modify objects) and (4) **preview it exactly like the
current world view** before saving.

## Scope

### A. Object editor (spec 12, tasks 1–10)

- Inventory of a template: scenery, mapping spawns, recipes, city kinds, authored models, with thumbnail, count, usage.
- Objects as a tree of named parts (house: walls, roof, chimney, door, windows). Per part: select, rename, hide,
  duplicate, delete, add.
- Tools: move / rotate / scale (numeric + gizmo), mirror, array, extrude, bevel, boolean union and subtract,
  primitive swap (box, cylinder, cone, sphere, prism, gable).
- Look per part: colour (or palette role), emissive, roughness, texture (procedural first: brick, wood, stone, tile,
  glass), variants with colour jitter ranges.
- Undo / redo (command stack, like `useNoteEdits`), reset to stock, diff against stock, live triangle and draw-call
  budgets.
- Data only: validated `ShapeRecipe` part tree (pydantic → JSON schema → TS), never executed.

### B. Map creator (new, on top of spec 12)

- **Create a map**: start from an empty plate or a stock template; choose environment (city, reef, realm, meadow,
  dome landscape), plate size and seed; name and save it as a user map (same storage and moderation path as templates).
- **Place objects**: pick from the inventory, click on the ground to place, drag to move, rotate and scale with the
  gizmo, snap to the street grid in cities; copy / paste / array.
- **Remove or modify objects**: select (click, box select), delete, replace by another kind or variant, edit the
  object with the part editor of A, change its colour.
- **Layout data**: a map is a `WorldLayout` (inventory, patches, sequence) plus a list of hand-placed objects
  `{ id, kind, position, yaw, scale, variant, overrides }`; placed objects are fixed scenery (they stand before the
  first note), notes still spawn their own objects around them.
- **Visualisation test**: a "Preview" button opens the same world view as `/play/<id>` (same engine, camera modes,
  walk and pegman, song clock) on the map being edited, without saving; back to the editor keeps the state. The
  preview uses `worldStateAt(plan, t)` unchanged (no editor code in the playback loop).
- Undo / redo, autosave of the draft in the browser, then save through the API.

## Rules to respect

- `tech.md`: LLM output and templates are data; no LLM call in the playback loop; audio clock only; no GPL.
- `frontend.md`: feature-first (`apps/web/src/features/template-editor/`), thin pages, i18n (en, fr, mg).
- `structure.md`: schema pipeline for new fields; `documentation.md`: update docs in the same change.
- Skills: `new-web-feature`, `shape-kind`, `world-template`, `design-system`, `review-change`.
- Perf budget: show and enforce triangle and draw-call limits (Quest 3); city draw calls are already 15.
- Only CC0 assets with a named source (open question 16).

## Suggested order

1. Spec 12 task 1–2: part-tree schema, builtin shapes as recipes (unblocks everything).
2. Task 3–4: inventory, part tree panel, inspector.
3. Map creator MVP: create map, place and remove fixed objects, preview (the smallest end-to-end slice).
4. Tasks 5–7: transform tools, materials and textures, extrude / bevel / boolean.
5. Tasks 8–10: variants, undo / redo, budgets, save, tests, docs.

## Acceptance (end of the whole task)

- A creator makes a new map from scratch, places, moves and deletes objects, edits a house part by part (colour,
  texture, size), previews it in the real world view with a song, saves it, and reopens it unchanged.
- All tests pass (web vitest, API pytest), `tsc` and `eslint` clean, docs updated, handoff written.

## Open questions (`docs/open-questions.md`)

- 16: CC0 asset packs (needs a named source).
- 17: priority against deploy and submission (deadline 2026-12-04 14:00 PT). Default: after the human tasks of the roadmap.
