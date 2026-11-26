---
name: blender-3d-models
description: Model, preview, budget, export and wire authored 3D models (animals, plants, props, vehicles) for Music World with headless Blender (bpy 5) — setup, the Builder/loft helpers, the real-world quality checklist, vertex-color pitfalls, GLB export, the model catalog, natural colours, swimming and body-motion hooks, tests and docs. Use whenever a world object looks crude and must become a proper authored model, or a new creature, plant or object has to be made.
---

# Authored 3D models with Blender

Rules: `tech.md` (triangle budget, MIT, no GPL asset), `xr-iwsdk.md` (draw calls, fps), `product.md`. Related skills:
`shape-kind` (procedural recipes), `world-template` (use the model in a template), `xr-verify` (perf on Quest).
Existing scripts: `scripts/blender/build_models.py` (land: tree, conifer, bush, cloud, cars, airplane, bicycle),
`scripts/blender/build_ocean.py` (23 ocean models, the most complete reference), `scripts/blender/preview_models.py`.

## 0. Decide first

- A model replaces a **kind** (`tree`, `car`, `recipe:shark`) only in templates with `fx.material: "polished"`. Procedural
  shapes stay the fallback until the GLB has loaded and when it cannot load.
- One model = **one mesh**, colours in vertex colours, no material, no texture, no animation clip. Motion comes from the
  engine (pose) and the vertex shader (body motion), never from the file.
- No third-party asset, no traced photo. Model from primitives and lofted sections; reference photos only to read
  proportions and colours (`docs/reference/`, git-ignored). Licence: MIT, listed in `apps/web/public/models/LICENSE.md`.

## 1. Setup (once per machine)

The system `blender` binary is often old (here 3.0.1: its glTF exporter lacks `export_vertex_color`). Use the **`bpy`
module** (Blender 5.x) in a Python 3.13 venv, outside the repo:

```bash
uv venv -p 3.13 ~/.venvs/bpy && uv pip install -p ~/.venvs/bpy/bin/python bpy pillow   # about 410 MB download, a few minutes
~/.venvs/bpy/bin/python -c "import bpy; print(bpy.app.version_string)"                   # 5.x
```

Run scripts with that interpreter: `~/.venvs/bpy/bin/python scripts/blender/build_ocean.py --out apps/web/public/models --only shark`.
`make models` / `make ocean-models` use `PYTHON=<venv>/bin/python`. Never run the downloaded wheel's scripts from inside
an untrusted directory; keep scratch output in the session scratchpad, only final GLBs go in `apps/web/public/models`.

## 2. Workflow (never skip the loop)

1. **Brief**: the real subject (species, vehicle model), its length : height : width, its parts, its real colours. Write
   them as comments above the function. Pick the kind name (`recipe:<name>` for ocean life, plain for land).
2. **Model** a function `def <name>() -> bpy.types.Object` in a build script, using `Builder` and the helpers below.
3. **Build one**: `python scripts/blender/build_ocean.py --out <scratch> --only <name>`; read the triangle line (`ok` /
   `OVER BUDGET`).
4. **Look at it**: `python scripts/blender/preview_models.py <scratch> <scratch>/p --views 3q,side,top --only <name>`, then
   open the PNG / `sheet-*.png` with the Read tool. Judge it with §4. **Fix and repeat until the checklist passes.**
   Do not wire a model you have not looked at.
5. **Export** to `apps/web/public/models/`, wire it (§6), test (§8), document (§9), commit one phase.

## 3. Modelling toolkit (copy the helpers from `build_ocean.py`)

Blender is **Z-up**; the exporter turns +Z into +Y and +Y into -Z. Conventions: length along **+X, nose / front toward
+X**, base near z = 0, centred on x and y (the app re-centres with `fitModel`, scale 1 = longest horizontal side).
Cars are the exception (`forward: 'z'`, nose toward -Y).

- `Builder` (`build_models.py`): one bmesh, `sphere`, `cylinder` (tapered), `box` (bevel), `torus`, then
  `finish(name, budget, ao_strength, flat_bottom)` welds, orients normals, triangulates, bakes AO into the colours,
  decimates to the budget and returns the object.
- `ell(b, centre, radii, color, rot=(rx,ry,rz), seg, rings, amp, seed)`: rotated ellipsoid with seeded noise. Fins, flippers,
  leaves, pads, shells.
- `loft(b, stations, color_fn, seg)`: body through sections `(x, half_height, half_width, centre_y, centre_z)`; closed at a
  zero-radius section; the colour comes from a function of the face centre and normal (`countershade(back, belly)`).
  **This is the tool for any streamlined body** (fish, whale, shark, fuselage, hull). 8 to 10 sections, 10 to 14 sides.
- `chain(b, points, r0, r1, color)`: tapered tube through points (tentacles, arms, legs, stalks, tails, horns).
- `blade(...)`, `branch(...)`: leaf rising with a sway; recursive branching (coral, trees). Seeded, never random at import.
- Noise: `mathutils.noise.noise(Vector)` with a per-part `seed`; displace along the normal for organic surfaces; use a
  band-pass (`1 - abs(n)*2`) for ridges and mazes (brain coral); `sin(angle*k)` for ribs (scallop).
- Colour variation: `tint(color, seed)`, `shade(color, k)`, `mix(a, b, t)`; vary every repeated part slightly.

## 4. Quality checklist ("a perfect model")

Judge from the 3q, side and top previews. Every line must pass:

- [ ] **Silhouette reads at a glance** at 60 px: you can name it. Distinctive features exaggerated 10 to 20 % (the
      shark's dorsal fin, a seahorse's snout, a car's wheels) rather than averaged away.
- [ ] **Proportions** match the real subject (length : height : width, head size, fin sizes). Check with the real numbers.
- [ ] **Everything attached**: no floating fin, eye, flipper or wheel. Overlap parts into the body. Fins start inside the
      body surface. Test: the preview shows no gap, even from the top view.
- [ ] **Thin parts survive decimation**: never let a section radius go below about 15 to 20 % of the body (tail stalk,
      neck, stem). Decimation deletes thin geometry first and detaches the tail (seen on dolphin, shark, whale).
- [ ] **Single closed surface** per part, normals outward (`recalc_face_normals`), no duplicate vertices.
- [ ] **Colour is believable**: real palette of the subject; countershading for animals (dark back, pale belly, soft
      transition); a second tone for fins; accents (eyes, mouth, stripes) in few faces; no pure black (use 0.04 to 0.08),
      no flat single colour on a large part (add `tint` or a gradient).
- [ ] **Silhouette variety**: no two repeated parts identical (rotate / scale / tint each by its index).
- [ ] **Budget**: triangles under the model's `BUDGET` (hero 2000 to 2600, small 400 to 1200, whole school or crowd up
      to 3200; the catalog test caps at 4300). Spend triangles on the silhouette (loft sections, rounded ends), not on
      hidden detail.
- [ ] **Smooth shading looks smooth**: at least 9 to 12 sides on round parts, 5 to 6 on thin ones (stalks, spines).
- [ ] **Scale in context**: footprint and `heightScale` of the recipe (see §6) keep it believable next to its neighbours
      (whale ≫ shark > dolphin > turtle ≫ clownfish).
- [ ] **File**: one mesh, `COLOR_0` present, a few tens of KB (under 130 KB), no material, no texture.

Typical fixes: floating part → move it inside the body; too dark → check §5; faceted → more sides or fewer sections to
get a wider decimation margin; boring → add the second and third level of detail the real subject has (gill slits,
suckers, scutes, ribs, pleats).

## 5. Vertex-colour pitfalls (cost a pass already)

- Blender's **byte-colour layer is sRGB**; the glTF exporter linearises it. `build_models.py` `lin()` converts to linear
  first, so those colours come out **darkened twice** (the app compensates with `POLISH_GAIN`). `build_ocean.py` redefines
  `lin()` to write the **raw hex value**, so the file holds exactly the colour typed: use that one for new models whose
  colours must look natural. Never mix both conventions in one model.
- AO is baked by `Builder.finish` (`ao_strength` 0.12 to 0.35 for animals, 0.3 to 0.45 for plants and props). Too strong
  makes flat models black: check a flat model (manta, starfish, shell) on the preview.
- The preview shows raw vertex colours with studio light, darker than the app's lit result: judge hue and contrast, not
  brightness.

## 6. Wiring in the app

1. **GLB** in `apps/web/public/models/<name>.glb`; add the row to `LICENSE.md`.
2. **Catalog** `apps/web/src/xr/shapes/model-catalog.ts` `MODELS`: `'recipe:<name>': { file, forward: 'x', natural: true }`.
   `natural: true` keeps the model's own colours (the palette tints 18 %): use it for animals, plants and anything whose
   colour is part of the object; omit it for objects that should follow the palette. Variants of a body: `MODEL_VARIANTS`.
3. **Recipe** in the template (`recipes[]`): the procedural fallback with `footprint` (metres of the longest side) and
   `heightScale`; the model is fitted to that footprint, so set it to the real relative size. Mappings and `scenery` use
   the kind `recipe:<name>`.
4. **Template**: `fx.material: "polished"` (and `fx.environment: "underwater"` for sea life).
5. **Motion** (optional but expected for living things):
   - Roaming: `apps/web/src/engine/swim.ts` `SWIMMERS['recipe:<name>']` (speed m per musical second, roam radius in
     half-plates, depth range as a fraction of the plate, wave period, `upright`, `sideways`, `wiggle`). Pure function of
     `(seed, id, tau)`: path, heading = velocity direction, pitch, roll. Animals that stay put (starfish, urchin, plants)
     are left out. For land creatures add a branch in `engine/motion.ts` `objectPoseAt` and `MOVING_KINDS`.
   - Body motion: `apps/web/src/xr/shapes/polished-materials.ts` `SWIM_MODES` (`tail`, `fluke`, `wing`, `pulse`, `plant`).
     Models are fitted nose toward +x, length 1, so `0.5 - position.x` is the distance behind the head. New mode = one
     GLSL line in `SWIM_BODY`; phase from `gl_InstanceID`, never from the position.
6. **Verify** (`xr-verify`): draw calls (one per kind), fps, and look at the model in the real scene (fog, lights).

## 7. Directions of life (how real animals move; keep when tuning)

- Heading is the direction of travel; the nose pitches with climb and dives; the body **banks into turns**.
- Speed varies slowly (never constant, never zero); big animals turn in wide arcs, small reef fish dart and wiggle.
- Dolphins porpoise (short vertical wave), whales cruise (long wave, slow), mantas glide, turtles paddle slowly, jellyfish
  drift and pulse, crabs walk sideways on the seabed, seahorses hover upright, schools move as one body.
- Plants and soft animals lean with the same current; nothing in the sea is static except rock, shells and stars.

## 8. Tests (all must pass before the task is ticked)

- `apps/web/src/xr/shapes/model-catalog.test.ts`: file exists, one coloured mesh, triangle cap; raise the catalog size cap
  only knowingly.
- Template test (`apps/web/src/templates/default/*.test.ts`): `isNaturalModel` for every recipe that has a model.
- `engine/swim.test.ts` and `xr/shapes/swim-materials.test.ts`: motion pure, bounded, heading matches velocity; every
  `SWIM_MODES` kind has a model.
- `pnpm -C apps/web exec vitest run` and `cd apps/api && uv run pytest tests/unit/templates`.

## 9. Documentation

`apps/web/public/models/LICENSE.md` (file, kind, budget), a section in `docs/improvements/` (what, why, known gaps),
`Makefile` target if a new script, handoff (`handoff` skill). Mention anything not seen on screen or on a Quest 3.
