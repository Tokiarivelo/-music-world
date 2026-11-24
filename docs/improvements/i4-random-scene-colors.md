# I4 — A brighter scene, random and chosen colors

## Goal

"The 3D scene colors are very dark: let me choose colors, randomly too." The default look must be brighter and more
readable, and the listener can roll a random color scheme, lock the colors they like, and go back.

## Current state

- A template's `palette` has six colors (`background`, `terrain`, `primary`, `accent`, `secondary`, `staff`); the
  default "Neon Nocturne" is deliberately dark (reference image). `scene.background` is the flat `palette.background`;
  ambient light 0.6, one directional light (`world-systems.ts`).
- The store specification requires `staff` vs `background` luminance difference ≥ 0.2; colors are `#rrggbb`, linear in
  three.js (`xr/palette.ts` `lightness()` for perceived brightness).
- There is no way to change colors without a new template (the editor `09` is not built).

## Requirements

1. THE player SHALL have a "Colors" popover: **Randomize**, **Undo** / **Redo**, per-color lock, six color inputs,
   "Brightness" and "Contrast" sliders, "Reset to the template".
2. RANDOMIZE SHALL produce a harmonious scheme from a seed: analogous, complementary, triad or split-complement
   (chosen at random) in OKLCH, with constraints: background lightness within a "not too dark" range (default
   L ∈ [0.25, 0.45], sky and ground brighter by gradient), staff contrast ≥ 0.2 and ≥ 4.5:1 for the labels drawn on the
   scene, saturation within 0.08–0.22, no two roles closer than ΔE 12.
3. THE seed SHALL be shown ("Scheme #4F2A9"), copyable, and applicable by link (`?palette=<seed>`): the same seed gives
   the same colors on every device (seeded PRNG, no `Math.random`).
4. LOCKED colors SHALL stay unchanged when randomizing; "Brightness" scales lightness of background, terrain and
   lights (and exposure), never the staff contrast constraint.
5. THE choice SHALL be a **view override** (`PaletteOverride`) applied on top of the template; it SHALL NOT mutate the
   template, change `worldStateAt` or restart the audio; it applies within 100 ms.
6. THE choice SHALL persist per browser (`localStorage`, try/catch) and per template id; "Reset" clears it.
7. A default brightness lift SHALL be applied to the default template look? **Decision needed** (see below).
8. `Save as my template` SHALL hand the colors to the template editor / store draft (spec `09`) when it exists.

## Design

- Pure `engine`-free module `xr/palette-generator.ts`: `generatePalette(seed, options): Palette`, `lockMerge`,
  `liftBrightness`, OKLCH ⇄ sRGB conversions, contrast helpers; property tests (always valid hex, contrast
  constraints hold for 10 000 seeds, deterministic, locks respected).
- `PaletteOverride` lives in the player store (Zustand); `WorldHandle.setPaletteOverride(partial)` updates
  materials/uniforms and the environment (I2) colors; no geometry rebuild.
- UI: `features/world-view/components/ColorsPopover.tsx` (thin), color inputs with labels (I3 keys), keyboard operable.

## Tasks (one commit each)

1. [x] `palette-generator.ts` with OKLCH math, schemes, constraints; property tests (10 000 seeds).
2. `WorldHandle.setPaletteOverride` + view updates (terrain, structures, staff, fx, environment); draw-call test.
3. Player store + persistence + `?palette=` link; tests.
4. `ColorsPopover` UI (randomize, undo/redo, locks, sliders, reset); Testing Library tests.
5. Brightness/exposure and light tuning; before/after screenshots in `docs/`; README.

## Decisions for the author

- Keep Neon Nocturne dark as the *reference* look and add "Bright" as a second built-in palette, or lift the default?
  Recommended: keep the reference as the default of `/play/demo` for the judges, and make Randomize / Bright one click.
- Random schemes in the AI director too (palette from the song's mood) are already possible: no change here.

## Verification

Property tests (10 000 seeds), screenshots at three seeds, contrast report, Quest check with I7 (bright scenes are
heavier on additive blending: check fps).
