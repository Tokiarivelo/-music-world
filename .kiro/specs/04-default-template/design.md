# Design Document — 04 Default Template (default look)

## Overview

Reference: `assets/reference-image-original.png` (a phone screenshot; the picture is the band between y ≈ 585 and
y ≈ 950). Composition read from it:

| Element | Reference | Renderer |
|---|---|---|
| Camera | low isometric view (≈ 28° elevation), plate rotated ≈ 32°, near corner at the bottom, plate wider than the frame | `xr/constants.ts` desktop camera |
| Plate | dark blue-violet, lighter in the middle, polygonal cracks (dried mud) | `TerrainView`: unlit height-field top with baked shading |
| Mountains | low rugged clusters on the near, right and far edges, none under the city | same height field, bumps outside structure zones |
| Staff | long, five white-cyan lines from the near-left edge to the far-right edge, soft bow, halo | `StaffView` line tubes + additive halo tubes |
| Clefs | G clef at both ends | Bravura `gClef` outline, merged into the staff mesh |
| Notes | white quarter / eighth / beamed sixteenth glyphs with halo | Bravura outlines, one `InstancedMesh` per glyph kind + one halo `InstancedMesh` |
| City | left half behind the staff: dense lit buildings, equalizer needles at the back, violet → magenta → cyan | `StructureView`: window shader on buildings, needle clusters for spikes |
| Fx | thin magenta / cyan elliptical arcs around the staff, sparse glowing dots | `FxView` decor arcs aligned with the staff, round additive points |

## Camera (requirement 1)

`DESKTOP_CAMERA_*` in `xr/constants.ts`: direction from the diorama centre with azimuth ≈ 32° and elevation ≈ 28°,
narrow field of view (≈ 30°) and a distance chosen so the plate fills the frame width at 16:9. VR is unchanged
(headset pose; diorama at table height).

## Terrain (requirement 2)

- `xr/terrain-field.ts` (pure, unit-tested): `mountainHeight(x, z)` = sum of seeded ridged bumps placed along the four
  edges, skipped when the bump centre lies in a zone of a structure kind (`zonesFor`), zero in the plate middle.
- Plate top: one subdivided grid (`TERRAIN_GRID` cells per side) displaced by `mountainHeight`, vertex colors baked
  from the palette: `terrain` lifted toward the centre, a violet tint near the city, a fixed light direction for
  mountain faces (unlit `MeshBasicMaterial`, so IWSDK lights do not change the look). Plate sides: a dark box below.
- Cracks: a Voronoi-like network — a jittered grid of cell centres, each cell edge (between neighbours) drawn as a
  short wobbly polyline in one `LineSegments`; edges on mountains (height above a threshold) are skipped. Rest
  intensity is low; kick pulse as before.
- `terrain_ridge` structures use a rugged multi-peak geometry with baked vertex shading and the terrain color (lifted
  toward `primary`) instead of the pitch gradient.

## Bravura glyphs (requirements 3, 4)

- Font: `assets/fonts/bravura/Bravura.otf` + `LICENSE.txt` (SIL OFL 1.1, Reserved Font Name "Bravura"; Steinberg
  Media Technologies). The font file is not loaded at runtime.
- `scripts/extract_bravura_glyphs.py` (fontTools) reads the SMuFL code points (`gClef` U+E050, `noteQuarterUp`
  U+E1D5, `noteEighthUp` U+E1D7, `note16thUp` U+E1D9), converts the CFF outlines to path commands in staff spaces
  (1 em = 4 staff spaces) and writes `apps/web/src/xr/glyphs/bravura-outlines.ts` (`GENERATED` header). Using the
  outlines as rendered shapes is font use, not a modified font; the data keeps the copyright and OFL notice.
- `xr/glyphs/glyph-geometry.ts`: path commands → `ShapePath` → `ShapeGeometry` (curve segments kept low for the
  triangle budget), notehead centred on the origin, double-sided.
- Staff halo: the five lines again as wider tubes in an additive transparent material (one draw call). Glyph halo: one
  `InstancedMesh` of a soft radial quad (alpha from a small generated `DataTexture`) behind each visible glyph.

## City (requirement 5)

- Buildings: `MeshBasicMaterial` with instance colors, extended with `onBeforeCompile`: the vertex shader passes the
  instance-scaled local position; the fragment shader draws a window grid in metres (hash per window → lit or dark),
  lit windows near white tinted by the instance color, walls darker, roofs lighter. Instancing, multiview and fog
  chunks stay the ones of three.js.
- Spikes: one merged geometry per instance = a cluster of thin needles with an equalizer envelope (tallest in the
  middle), vertex alpha fading to the top, additive blending, no depth write.
- Template: building zones cover the left part behind the staff; spike zones the back of the city; spike pitch rule
  bounded (`73-88`, then `>88`) so the gradient spans violet → cyan.

## Fx (requirement 6)

- Decor arcs: `DECOR_ARC_COUNT` ellipse segments centred on the staff middle, major axis along the staff direction,
  slightly tilted, alternating `accent` / `secondary`; opacity follows beats and energy.
- Particles: fewer, smaller, round (alpha `DataTexture`), mostly within `PARTICLE_HEIGHT` of the plate.
- Glow: unlit additive materials scaled by `fx.bloom` × energy (as built in `03-world-engine-core`). No composer.

## Verification (requirement 7)

- Headless Chromium on the production build (`next build && next start`), `/play/demo`, viewport 1280 × 720,
  screenshots at several song times, compared with the reference; ≤ 4 tuning passes.
- `?perf=1`: a `PerfSystem` logs `renderer.info.render.calls` and `triangles` once per second (console).
- Unit tests: triangle budgets (glyphs, needle cluster, ridge), determinism of the height field and crack network,
  draw-call bound of the whole default world.
