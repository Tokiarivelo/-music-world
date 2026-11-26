# Archived session 2026-11-26 (phase I49)

## 2. Last session (2026-11-26, Claude Code, phase I49 `phase-I49-editor-finish`)

- 5.1 `ShapeRecipe.variants` (≤ 9 `{name, height, jitter}`); a placed object's `variant` picks one (`variantLook`, `jitterHex`
  in `engine/recipe-scale.ts`). `VariantsPanel` in the object editor.
- 5.2 undo / redo / reset to stock (or to the opening state) / diff per object (`lib/object-history.ts`, `useObjectHistory`,
  `ObjectHistoryBar`).
- 5.3 `lib/budget-model.ts`: live triangles of the real geometry (the old `recipeTriangles` ignored part trees) and a
  draw-call estimate (12 + kinds in use, limit 100); both enforced as validation errors; `BudgetMeter`.
- 5.4 acceptance test `object-editor.acceptance.test.ts` (copy house, paint, texture, variant, validate, round trip);
  README and `12-object-editor/design.md` § As built (phase 5) updated.
- Deviations: variants apply to hand-placed objects only (scenery and notes keep variant 0 for recipes); draw calls are an
  estimate; the map creator keeps its own history (no cross-feature import).
- Checks: web vitest 839 passed (153 files), tsc and eslint clean; API shape/template/schema 150 passed, ruff and mypy
  clean; `make arch`: the 2 known `engine/sky.ts` violations; `schemas-check` in sync.
