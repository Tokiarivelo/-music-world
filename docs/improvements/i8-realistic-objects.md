# I8 — Beyond buildings: clouds, cars, bicycles, planes, plants… very realistic

## Goal

"Don't only put buildings: add clouds, cars, bicycles, airplanes, plants and so on, and make them very, very
realistic." Songs should populate a living world with varied objects, mapped to the music, at a believable level of
detail.

## Current state

- `ShapeRecipe` (`music-world.shape.v1`): ≤ 8 parts from five ops (box, prism, spike, stack, cluster), triangle budget
  ≤ 2000 per recipe, flat-colored, no textures; built-in kinds (tower, spike, cluster…) with window textures for
  buildings. The director may define up to 4 recipes per template. One `InstancedMesh` per kind.
- Quest budget: < 100 draw calls, ≥ 72 fps, textures < 256 MB. No GLB loading in the app today.
- **"Very realistic" conflicts with the closed recipe language and the Quest budget**: boxes and prisms cannot make a
  convincing cloud, bicycle or plane.

## Requirements

1. A **catalog of object kinds** SHALL exist, with at least: cloud (3 variants), tree (broadleaf, conifer, palm), bush
   and flower patch, car (sedan, hatchback, van), bicycle, airplane (airliner, small prop), plus later: bird flock,
   boat, street lamp, bench, balloon. Each kind has a category, a footprint, a size range in meters (I7), and a
   behavior: `static`, `drift` (clouds), `move` (cars along a path), `fly` (planes, birds).
2. TEMPLATES MAY map notes to catalog kinds (`spawn: "catalog:car.sedan"`), and the director may pick them; the store
   specification checks the id against the catalog (closed list), as it does for recipes. Mapping examples: drums →
   cars on the roads, bass → trees, vocals → clouds and birds, melody → planes crossing the sky.
3. OBJECTS SHALL be real 3D models, authored (or sourced) low-poly-realistic: glTF/GLB with PBR materials (base color,
   roughness, metalness, optional normal map), merged into **one geometry and one material per catalog kind** so each is
   one `InstancedMesh`; per-instance color tint (paint, foliage season) via instance color.
4. DETAIL BUDGET per object (Quest tier): cloud ≤ 1.5 k triangles (or sprite-volume shader), tree ≤ 2 k, car ≤ 3 k,
   bicycle ≤ 2 k, plane ≤ 4 k; LODs: 3 levels (full, 40 %, impostor billboard) switched by distance (I7); the whole
   catalog ≤ 40 MB of GLB, textures ≤ 1024² with KTX2 / Basis compression, shared atlas, total GPU memory < 256 MB.
5. PERFORMANCE: instance counts capped by tier (e.g. Quest 600 objects total in view); frustum culling per kind
   chunk; no per-frame allocations; ≥ 72 fps on Quest 3 with the full catalog in view (measured).
6. MOTION SHALL be a pure function of `(seed, objectId, t)` (cars follow splines, planes cross at constant speed,
   clouds drift slowly), so seek equals play and `worldStateAt` stays pure; no physics engine.
7. REALISM: PBR lighting from the environment (I2) with an image-based light (small HDR cube map, ≤ 256² per face),
   soft contact shadows (blob shadows, not shadow maps, on Quest), wind sway on foliage (vertex shader), window and
   headlight emissive on beat; quality verified against reference photos by the author.
8. LICENCES: every asset is CC0, CC-BY or self-made; `assets/LICENSES.md` lists source, author, licence, and
   modification; no GPL/AGPL; no asset from a marketplace whose licence forbids redistribution in a public repo.
9. THE LLM never sees or produces meshes: it only picks ids from the catalog (data, validated, never executed).
10. EXISTING recipes and builtin kinds keep working; the default template and `/play/demo` stay unchanged until
    the author opts in.

## Design

- Contract: new `spawn` form `catalog:<id>`; `catalog.v1.json` (id, category, footprint, sizeRange, behavior, asset
  path, triangles per LOD) is **data** served with the app and mirrored in Python for the store/director validation
  (generated from one source file, like the schemas).
- Loader: `xr/assets/catalog-loader.ts` (GLTFLoader + KTX2Loader from three examples, dynamic import so light pages stay
  light; the bundle guard `check-bundle.mjs` must keep failing for any light page importing it), merges meshes, builds
  `InstancedMesh` per kind per LOD, exposes `catalogView`.
- Behaviors: `engine/motion.ts` pure functions (`driftAt`, `pathAt`, `flightAt`) using the seeded PRNG.
- Clouds: either GLB puffs or a billboard/volume shader (soft sprites, 3–5 layers); evaluate both on Quest in task 1.
- Asset pipeline: `scripts/build-catalog.mjs` (gltf-transform: dedupe, weld, simplify LODs, KTX2, atlas), outputs in
  `apps/web/public/catalog/` served by Caddy with long cache; sizes checked in CI.
- Director: prompt lists catalog ids and their roles; `PROMPT_VERSION` bump; mock director picks fixed mappings.

## Tasks (one commit each)

1. **Spike**: three assets (cloud, tree, car) loaded as instanced GLBs on Quest 3 (human check) to prove fps and look;
   decide sourcing (author-made vs CC0 packs such as Kenney / Quaternius / Poly Pizza, check licences).
2. Catalog contract + validation on web and API (closed list), `catalog:<id>` spawn, store specification, tests.
3. Loader, merge, instancing, LOD switching, tint, budget tests; light-page bundle guard.
4. Motion functions (`drift`, `path`, `flight`) with property tests (seek equivalence, bounds).
5. Content batch 1: clouds, trees, bushes, flowers (assets, licences, tuning).
6. Content batch 2: cars, bicycles, airplanes (+ road/flight paths in the layout).
7. Lighting realism: IBL, blob shadows, wind sway, emissives; before/after screenshots.
8. Director prompt and mock mappings; a showcase template "Living City"; docs, README.
9. Quest 3 performance pass (human) and tier tuning.

## Decisions for the author

- **Sourcing**: author-made models are best quality-to-licence but slow; CC0 packs are fast and consistent; text-to-3D
  generation tools exist but quality and licence vary. Recommended: CC0 low-poly-realistic packs + hand tuning.
- **How realistic?** On Quest 3 "very realistic" means PBR textured mid-poly models with baked lighting and blob
  shadows, not photorealism. Confirm this target.
- **Scope before the freeze (2026-12-03)**: only task 1–3 and clouds + trees (batch 1) fit; cars, bicycles and planes
  after the submission.

## Verification

Triangle and draw-call tests per kind, load-time budget (< 3 s on 4G for the first view), Playwright screenshots,
Quest 3 fps with the full catalog, licence audit file.

## Risks

Largest phase: asset production dominates the effort, not code. GLB size and decoding time on mobile; draw calls grow
with kinds × LODs (merge LODs with distance culling, measure). Realism needs lighting from I2 and scale from I7 first.

## As built

- Task 4 (2026-11-24, branch `phase-I14-object-motion`): `engine/motion.ts` with `driftAt` (clouds), `loopAt` (cars on an
  oval ring) and `flightAt` (planes), pure functions of `(seed, objectId, t)` with property tests (same inputs same pose
  whatever was asked before, bounds, speed range, heading along the path). Nothing renders them yet.
- Tasks 2, 3, 5, 6, 8 as a first slice (2026-11-25, branch `phase-I8-realistic-objects`), with the defaults of
  `docs/open-questions.md` 1-2: no outside asset (no GLB, no licence), **self-made procedural low-poly geometry with baked
  vertex colors**, tinted per instance. Seven new built-in kinds in the closed `spawn` / `zones` enum: `cloud`, `tree`,
  `conifer`, `bush`, `car`, `bicycle`, `airplane` (`xr/shapes/object-shapes.ts`, each under the 600 triangle budget,
  one `InstancedMesh` per kind). `KIND_HEIGHT` / `KIND_FOOTPRINT` hold the proportions; `KIND_ALTITUDE` lifts clouds and
  planes into the sky. Mirrored in `BuiltinShapeKind` (Python), `BUILTIN_KINDS`, the editor kind list (en, fr, mg) and
  the director prompt (`director-v5`). Showcase template **Living City** (`featured/living-city.json`): drums to cars, bass
  to trees, vocals to clouds, high notes to planes.
- Motion wired (phase I8b): `objectPoseAt` (`engine/motion.ts`) gives clouds a drift, cars and bicycles a ring road and planes a
  flight lane, from `(seed, kind:index, t)`; `StructureView` uses it for position and heading, so seek equals play.
  Property tests cover purity, sky/ground heights and plate bounds.
- Lighting and check (phase I8c): contact **blob shadows** (one extra `InstancedMesh`, so one more draw call, under every
  tree, car, bicycle, plane, cloud and bush; bigger and fainter under sky objects) and **wind sway** on foliage (vertex
  shader, `mwTime` = audio clock, so it is pure in `t`). `scripts/xr-check.mjs` now takes `MW_STORE_JSON` / `MW_STORE_ID`
  to run the whole IWER check on Living City without the API. Result on 2026-11-25 in IWER (no Quest 3 available): 20 of 20
  programs compile with `OVR_multiview2` (incl. the foliage shader), **58 draw calls** in VR with the panel, 341 k triangles,
  no geometry/texture leak after 3 seeks, ~10 ms per frame with ANGLE vulkan on this laptop GPU (not a Quest figure).
  Screenshots: `docs/improvements/i8/living-city-desktop.png`, `living-city-immersive.png`.
- **Decision, closing the phase without GLB:** the sourcing questions stay open, but the objects are procedural so there is
  no GLB, KTX2 atlas, PBR texture or IBL (the scene is unlit by design, `city-materials.ts`). LODs are not built: every
  kind is already ≤ 600 triangles in one draw call, and a lower level would add draw calls for no gain. If real models are
  wanted later, they replace `object-shapes.ts` builders behind the same kind names.
- Still not done: no GLB / PBR / LODs / IBL / blob shadows (tasks 1, 7), no Quest check (task 9, human).
- Not started, and blocked on the decisions above: tasks 1 (spike on Quest 3 and asset sourcing), 2 (catalog contract),
  3 (loader), 5-6 (content), 7 (lighting), 8 (director), 9 (Quest pass). The code tasks 2 and 3 are only worth writing once
  the sourcing and the realism target are confirmed.
