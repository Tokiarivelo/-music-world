# Archived session 2026-11-27 (phase I52)

## 2. Last session (2026-11-27, Claude Code, phase I52 `phase-I52-engine-recipes`)

- Remaining limits of the object workspace lifted (spec 12 phase 8):
  the nine city building variants are now editable recipes (`building_<variant>`, `xr/shapes/building-recipes.ts`), and the
  city draws a template's recipe instead of the built-in shape (`resolveBuildingGeometries`, `structure-view.ts`).
- Inventory "Added by the world": "Edit as a recipe" / "Edit the recipe" on each building, badge on the replacing recipe;
  `inventoryOf` skips these recipes (not spawnable objects).
- Box select by area: any face touching the rectangle (`lib/rect-hit.ts`, `ObjectStage.idsInRect`), not the part centre.
- Checked in headless Chromium: a small rectangle crossing only a wall face selects "Walls"; "Edit as a recipe" opens the
  workspace on `building_house` (4 parts, 44 triangles). The city view with an edited recipe was not screenshotted
  (covered by `resolveBuildingGeometries` tests).
- Limits: part colours and textures do not show on city buildings (the city material colours them); streets, lakes, bridges,
  signals, construction and reef patches stay engine code; box select also picks parts hidden behind others.
- Checks: see section 1.
