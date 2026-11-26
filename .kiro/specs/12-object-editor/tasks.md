# Tasks — 12 object editor and map creator

One task = one commit (`12-object-editor: <n> <summary>`). One phase = one branch `phase-I<nn>-<slug>`, one PR merged to
`main` when all its tasks are done and the tests pass. Briefing: `docs/next-task-object-editor.md`.

## Phase 1 — Part tree (branch `phase-I45-part-tree`)

- [x] 1.1 Spec: requirements for the map creator (req 8–12), phased task list
  - _Requirements: 1–12_
- [x] 1.2 Schema: `PartNode` tree in `ShapeRecipe` (pydantic, tri-count mirror, limits), `make schemas`, tests
  - _Requirements: 2, 6_
- [x] 1.3 Web: pure `buildNodeGeometry` (primitives box, cylinder, cone, sphere, prism, gable; transform; hidden),
  parity test with the Python triangle count
  - _Requirements: 2, 3, 6_
- [x] 1.4 Migration of legacy `parts` ops to nodes (`recipeToNodes`), builder uses nodes when present; tests
  - _Requirements: 2, 6_
- [x] 1.5 Builtin shapes (houses, trees, cars) expressed as recipes (`stockRecipes`), one build path; budget tests
  - _Requirements: 2, 6_
- [x] 1.6 Docs (`PROJECT.md` §6, design.md), handoff, tick, PR merged

## Phase 2 — Inventory, part tree panel, inspector (`phase-I46-object-inventory`)

- [x] 2.1 Pure `inventoryOf` extension: objects of a template with count and usage (scenery, mappings, recipes, city kinds, models)
- [x] 2.2 Inventory panel with thumbnails (small canvas renderer) and selection
- [x] 2.3 Part tree panel: select, rename, hide, duplicate, delete, add primitive (pure edit model + tests)
- [x] 2.4 Inspector: numeric position, rotation, size, primitive swap
- [x] 2.5 Object viewport (orbit, selection highlight) and i18n en/fr/mg
- [x] 2.6 Docs, handoff, PR merged

## Phase 3 — Map creator MVP (`phase-I47-map-creator`)

- [x] 3.1 Schema: `PlacedObject` list and `WorldLayout` map fields (`placed`), `make schemas`, API validation
- [x] 3.2 Pure `map-model` (create map from empty plate or stock template, place, move, remove, copy, array, snap) + tests
- [x] 3.3 Engine: placed objects stand as fixed scenery before the first note (`worldStateAt` unchanged), tests
- [x] 3.4 Map editor page: create dialog (environment, plate size, seed, name), ground click placement, selection, delete
- [ ] 3.5 Gizmo move / rotate / scale, box select, replace kind or variant
- [ ] 3.6 Preview button: same world view as `/play/<id>` on the draft, back keeps the state
- [ ] 3.7 Draft autosave in the browser, save and reopen through the API, tests
- [ ] 3.8 Docs, handoff, PR merged

## Phase 4 — Part tools and look (`phase-I48-part-tools`)

- [ ] 4.1 Transform tools (numeric + gizmo), mirror, array
- [ ] 4.2 Material per part: palette role or colour, emissive, roughness
- [ ] 4.3 Procedural textures (brick, wood, stone, tile, glass)
- [ ] 4.4 Extrude, bevel, boolean union and subtract
- [ ] 4.5 Docs, handoff, PR merged

## Phase 5 — Variants, history, budgets, save (`phase-I49-editor-finish`)

- [ ] 5.1 Variants and colour jitter ranges (buildings)
- [ ] 5.2 Undo / redo command stack, reset to stock, diff against stock
- [ ] 5.3 Live triangle and draw-call budgets, enforced
- [ ] 5.4 Save with the template, validation, end-to-end acceptance test, docs, handoff, PR merged
