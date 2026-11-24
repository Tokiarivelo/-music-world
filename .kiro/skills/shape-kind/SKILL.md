---
name: shape-kind
description: Add a 3D shape kind (building, spike, crystal, terrain ridge…) or a ShapeRecipe op end to end — schema enum, engine mapping and layout zone, Three.js builder with InstancedMesh, triangle budget, default template, director prompt enums, tests and docs. Use whenever the world needs a new kind of object generated from notes.
---

# New shape kind or recipe op

Rules: `tech.md` (templates are data, perf budget), `xr-iwsdk.md`. Spec: `03-world-engine-core`.

1. **Schema**: add the value to the closed enum in `schemas/template.py` (`ShapeKind` or `RecipeOp` with its
   parameters and ranges); `make schemas`.
2. **Engine** (`apps/web/src/engine`): mapping support in `mapping.ts`, a layout zone in `layout.ts`, growth/phase
   behaviour if special. Keep it pure; add property tests (targets in zone, deterministic with seed).
3. **Builder** (`apps/web/src/xr/shapes/`): a function `build<Kind>(params, palette): BufferGeometry` (or the op in
   `recipe-builder.ts`). Geometry is built once and rendered with one `InstancedMesh` per kind; colors come from
   palette roles, not literals.
4. **Budget**: unit test that the geometry stays under its triangle budget for the extreme parameter values.
5. **Templates**: use it in the default template only if it matches the reference image; otherwise add it to the
   Halloween template or document it as available.
6. **Director**: add the enum value and a one-line meaning to the prompt's allowed values; bump `PROMPT_VERSION`.
7. **Verify** with the `xr-verify` skill (draw calls, fps) and take a screenshot.
8. **Scenery**: a template can stand objects on the plate before the first note with `scenery: [{kind, count}]` (placed from
   the seed, see `engine/spawn-plan.ts` `sceneryRecords`); any new kind works there without engine changes.
9. **Docs**: `PROJECT.md` §6 (ops list / mapping table).
