# I19 — Polished, reflective, more realistic 3D objects

Request (2026-11-25): "download images, and make all the 3D objects more polished, more reflective and more realistic;
a very complete investigation of every object of the templates."

## Investigation: every 3D object, how it is drawn, what changed

All meshes were read in `apps/web/src/xr/views/*` and `xr/shapes/*`. Before this phase **every** material was unlit
(`MeshBasicMaterial`, `ShaderMaterial`, `PointsMaterial`, `LineBasicMaterial`): color only, no shading, no reflection.
The scene already had an ambient light and a sun (`xr/systems/world-systems.ts`) that nothing used.

| Object | Where | Material before | Now | Why |
|---|---|---|---|---|
| building (+ windows) | `builtin-shapes.ts`, `city-materials.ts` | Basic + window shader | unchanged | the neon city of the reference image |
| spike (equalizer needles) | same | additive Basic | unchanged | glow is the look |
| terrain ridge (mountains) | same | Basic, baked grey | unchanged | baked shading, unlit horizon |
| crystal, cluster | same | Basic, flat color | **polished** (glossy, rough 0.06 / 0.3) | gems and rocks must catch light |
| recipes (`recipe:<name>`, up to 4 per template; Nemo Reef has 16) | `recipe-builder.ts` | Basic | **polished** (rough 0.45, metal 0.2) | the director's own shapes |
| cloud, tree, conifer, bush | `object-shapes.ts` (I8) | Basic + sway | **polished**, matte (rough 0.8–1), sway kept | plants and clouds are not shiny |
| car, bicycle, airplane | same | Basic | **polished metal** (metal 0.65–0.7, rough 0.25–0.3, strong sky reflection) | paint and metal |
| blob shadows | `structure-view.ts` | Basic, alpha | unchanged | contact shadows stay cheap |
| terrain plate, side walls, cracks | `terrain-view.ts` | Basic / Line | unchanged | unlit plate, rim light is in the vertex colors |
| staff lines, glyph halos, note glyphs (Bravura outlines) | `staff-view.ts` | Basic | unchanged | notes are glowing symbols, not objects |
| aurora curtain | `aurora-curtain.ts` | ShaderMaterial | unchanged | light, not matter |
| chord arcs, decor arcs, particles | `fx-view.ts` | Basic additive / Points | unchanged | light effects |
| sky dome, ground, hills | `environment-view.ts` | Shader / Basic | unchanged | the environment is the backdrop |

Rule used: **matter gets PBR, light stays unlit.** Everything that represents a physical thing (crystals, clusters,
recipes, plants, vehicles, clouds) is lit and reflective; everything that is light, a symbol or a backdrop keeps its
neon look, which is the product's identity (`product.md`).

## What was built

- **Geometry** (`xr/shapes/object-shapes.ts`): smooth normals kept (true spheres, 8 to 10 segments, instead of flat
  icosahedra), baked ambient occlusion in the vertex colors (darker toward the ground), more detail: car bumpers,
  headlights and tail lights, hubcaps; airplane engines, cabin windows, smoother fuselage. Still all under the 600
  triangle budget (test).
- **Materials** (`xr/shapes/polished-materials.ts`): one `MeshStandardMaterial` per kind with its own roughness,
  metalness and reflection strength (`SURFACES`); foliage sway kept on the lit material.
- **Reflections**: a night-sky HDRI, **Poly Haven "Dikhololo Night", 1k, CC0, by Greg Zaal**, downloaded to
  `apps/web/public/env/night-sky-1k.hdr` (1.7 MB; licence in `public/env/LICENSE.md`), loaded once, converted by three.js
  to a prefiltered environment, shared by all lit materials. If it cannot load, materials still render lit.
- **Contract**: `fx.material` = `polished` (default) | `flat`, in `music-world.template.v1` (pydantic, generated schemas
  and zod, template editor select in en/fr/mg). The director prompt is `director-v6`.
- **Default look**: `neon-nocturne` is explicitly `flat`, so the reference image stays exactly as before (its crystals
  and clusters stay unlit). Switch it with one word (`"material": "polished"` in both `neon-nocturne.json` and
  `director/infrastructure/default_template.json`, which a test keeps equal) or from the editor.
- Brightness: lit materials are shaded darker than unlit ones, so tints get a gain of 1.9 and the reflection 2.2
  (`structure-view.ts`), tuned on screenshots.

## Verification (IWER, no Quest 3)

On Living City (`MW_STORE_JSON` / `MW_STORE_ID` of `scripts/xr-check.mjs`), 2026-11-25: 24 of 24 programs compile with
`OVR_multiview2` (incl. `MeshStandardMaterial`), **58 draw calls** in VR (limit 100), 389 k triangles, textures 13,
no leak after 3 seeks, about 10 to 14 ms per frame with ANGLE vulkan on a laptop GPU (not a Quest figure; the Quest 3
check is still a human task). Screenshots: `docs/improvements/i19/polished-desktop.png`, `polished-immersive.png`.

## Textures (phase I20)

Found with the ambientCG API (all CC0) and downloaded at 1K: Bark014 (trees, conifers), Leaf001 (bushes), Metal049A
(cars, bicycles), Metal064 (airplanes), Rock064 (clusters). Each is reduced to **256 x 256** and split into three small
JPGs in `apps/web/public/textures/` (204 KB for the 15 files): a grayscale **detail** map (contrast reduced, so the
template keeps control of the hue: it multiplies the vertex and instance colors), a **normal** map (relief) and a
**roughness** map. Licences and sources: `public/textures/LICENSE.md`.

The "no UVs" problem was solved **at build time, not in the shader**: `xr/shapes/lit-geometry.ts` projects each triangle
along the axis its face looks to (box projection) once, so the material is a plain `MeshStandardMaterial` with `map`,
`normalMap` and `roughnessMap` and the fragment cost is three texture reads. Maps load once, are shared by all kinds
of a set, and are applied when ready (a load failure leaves the untextured lit look). Measured in IWER on Living City:
58 draw calls (unchanged), textures 13 to 25, no leak after 3 seeks, same frame time, 27 of 27 programs compile with
multiview. Screenshot: `docs/improvements/i19/textured-immersive.png`. Tuning: `TEXTURE_SET`, `UV_TILING`,
`NORMAL_SCALE`; the foliage map has the lowest contrast because the raw leaf photo looked blotchy.

## Not done, and why

- **No GLB models.** Same decision as I8; they would replace the builders of `object-shapes.ts`.
- Buildings, spikes, terrain and the staff stay unlit on purpose (table above).
- Quest 3 frame rate of lit materials: to measure (human). If too slow, set `material: "flat"` on the template.
