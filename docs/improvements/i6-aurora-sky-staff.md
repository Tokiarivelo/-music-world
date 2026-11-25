# I6 — The tablature as an aurora in the sky; notes fall like rain

## Goal

"The tablature must not be frozen in the center: I want it like something in the sky that comes down like random rain,
like the northern lights; it must be pretty." The staff becomes luminous aurora curtains high above the world, and each
note (glyph) falls from the sky to its place, at a random-looking but deterministic spot, like drops of light.

## Current state

- `StaffView` draws a glowing tube curve across the plate (`STAFF_TUBE_*`, `diagonal_curve` or `straight`), note glyphs
  (Bravura outlines, instanced) travel along it for `lookahead` seconds to the playhead, then **fall** for `fallDuration`
  (0.35 s) to their impact point where the structure grows (`engine/staff.ts`, `world-state.ts`, `layout.ts`).
- All of it is a pure function of `t` and the seed. Glyph capacity max 512 instances.
- Template fields: `staff.style`, `staff.path` (`diagonal_curve | straight`), `staff.clef`, `staff.glow`,
  `staff.lookahead` (1–8 s), `staff.fallDuration` (0.1–2 s).

## Requirements

1. A new staff style `aurora` (default for new templates; the reference look keeps `glowing_lines` available) SHALL render
   the five staff lines as flowing ribbons of light 6–14 m above the plate, forming curtains that undulate slowly
   (low-frequency noise, hue shifting between the palette's `primary`, `accent`, `secondary`; additive, soft vertical
   fade like real aurora: bright lower edge, faint rays upward).
2. NOTES SHALL appear in the curtain at a **random but deterministic** position (hash of `(seed, noteId)`), at a height
   within the curtain, then fall toward the note's landing point with a slight sway and trailing streak, arriving
   exactly at the onset time. The fall duration is `lookahead` (not the 0.35 s of the old style): a note visible for
   `lookahead` seconds before its onset, like rain whose drops reach the ground on the beat.
3. THE rain SHALL keep reading as music: the horizontal position above the landing point follows pitch (low left, high
   right, or per template zones), the glyph size follows velocity, chord notes fall together with a connecting light
   arc, kicks pulse the curtains.
4. SEEK SHALL give the same picture as playing: positions depend only on `(seed, noteId, t)` (`worldStateAt` stays pure).
5. THE clef and the staff lines SHALL remain recognizable as music notation (five ribbons, clef at the curtain's start).
6. BUDGET: curtains ≤ 3 draw calls (a few ribbon meshes with a shader), glyph rain reuses the glyph instances (≤ 3
   `InstancedMesh`), trails drawn with one `LineSegments`/instanced quad set; ≤ 20 k triangles; shader cost checked on Quest
   (no per-pixel fbm above 3 octaves; no overdraw of full-screen quads).
7. `prefers-reduced-motion`: curtains static, glyphs fade in place and fall without sway.
8. THE aurora SHALL be re-colored by the palette override of I4 and be visible against the environment of I2.
9. THE old tube staff stays selectable per template (`staff.style`) and in the editor.

## Design

- Contract: extend `Staff.style` with `aurora` (additive enum value: `make schemas`, director prompt allowed values +
  `PROMPT_VERSION` bump, default template unchanged for `/play/demo`; decide the default in task 1).
- `engine/rain.ts`: pure `rainPosition(seed, noteId, landing, t, onset, lookahead): Vec3` with eased fall, sway by
  `sin(hash)`, jitter bounded so the arrival point is exact.
- `xr/views/aurora-view.ts`: ribbons = `PlaneGeometry` strips bent along the staff path (48 × 6 segments), vertex shader
  displaces by simplex noise (uniform time = audio clock, never `performance.now()` alone), fragment gradient with
  alpha falloff, additive blending, `depthWrite=false`.
- Glyph rain: reuse `staff-view` glyph instancing with a new motion function; trails as a second instanced thin quad.
- Quality tiers: `high` (desktop: 4 curtains, 3 octaves), `low` (Quest: 2 curtains, 2 octaves), selected from the
  renderer capabilities and frame time.

## Tasks (one commit each)

1. Contract: `staff.style = aurora`, schemas, defaults, director prompt/enums, tests.
2. `engine/rain.ts` + property tests (arrival at the landing point at onset, determinism, seek equivalence, bounds).
3. `AuroraView` curtains (shader, ribbons, quality tiers) + budget tests.
4. Glyph rain and trails in the staff view; chord arcs from the sky; kick pulse.
5. Reduced motion, palette override hooks, the old style kept; tests.
6. Visual tuning with screenshots over the demo song (5 timestamps), docs, README gif/screenshot.
7. Quest 3 fps check (human) and quality-tier thresholds.

## Verification

Property tests of the motion, draw-call/triangle tests, Playwright screenshots, xr-check, Quest 3 (human).

## Risks

Additive curtains plus bloom can wash out on bright palettes (I4): clamp alpha by background luminance. Shader noise
cost on Quest: measure before adding octaves. "Pretty" is subjective: iterate with 3 reference photos in `assets/`
(licensed) and agree on the look with the author before task 6.

## As built (phase I6, first slice, 2026-11-24)

- Contract: `staff.style` accepts `aurora` (default stays `glowing_lines`, so `/play/demo` and the reference look are
  unchanged); schemas regenerated; editor Staff section has a Style select (en, fr, mg).
- Engine: `engine/rain.ts` (pure): a note falls from the curtain with a vertical ease-in (a drop accelerates) and a
  horizontal sway from `hash(seed, noteId)` that is zero at both ends, so it lands exactly on its target and a seek gives
  the same picture. The aurora staff hangs at 14 % of the plate size (classic: 6 %), lines 1.5× apart (`engine/staff.ts`).
- View: `xr/views/aurora-curtain.ts`: one additive ribbon along the staff (1 152 triangles, 1 draw call, no texture, a few
  sines in the shaders), song time as the only clock, still with `prefers-reduced-motion`; the five lines and the clef
  stay as notation.
- Launch template **Aurora Night** (`featured/aurora-night.json`, store id `…0003`): teal / violet / blue, lookahead 5 s,
  fall 1.4 s. Screenshot over the demo song (the default look temporarily set to aurora): `docs/improvements/i6/aurora-staff.png`.
- Not done: trailing streaks on the falling notes, chord arcs coming from the sky, kicks pulsing the curtain, quality
  tiers for Quest, re-coloring through the I4 palette override (the curtain reads the template palette), the desktop
  camera is not re-framed for a high staff (it fits because the ratio is modest), a Quest 3 fps check, and agreeing the
  "pretty" with the author on photos.

## Northern-lights mode, lines and notes (phase I30)

The "Northern lights mode" toggle (`skyStore`) no longer draws orbs and rays for the notes. The staff view now turns its
**five lines into aurora ribbons** (one `AuroraCurtain` per line, green low and violet high, five draw calls when on) and
keeps the **note glyphs sliding along the staff as in the normal view**, colored by pitch with the aurora colors
(`xr/views/aurora-colors.ts`: low green, mid cyan, high violet) with a cyan halo. The three big backdrop curtains stay
(`sky-notes-view.ts`). Notes are picked and dragged on the staff like in the normal view (the picking no longer uses the
sky positions). `engine/sky.ts` and `worldState.skyNotes` are still computed but no longer drawn: a candidate for removal.
The staff stays at its own height (it is not lifted into the sky), so the picking positions are unchanged.
