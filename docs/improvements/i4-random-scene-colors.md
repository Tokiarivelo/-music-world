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
2. [x] `WorldHandle.setPaletteOverride` + view updates (terrain, structures, staff, fx, environment). As built: the host re-applies the same plan with the merged palette (`xr/palette-override.ts`), so the views rebuild from it (geometry is recreated, audio and clock untouched); a color override resets when another template id loads. No draw-call test: the draw-call count does not depend on colors.
3. [x] Player store + persistence + `?palette=` link; tests. As built: `features/world-view/lib/palette-store.ts` (vanilla store, no new dependency; one store per template id, undo/redo, locks, `mw.palette.<templateId>` in `localStorage`), `hooks/use-palette-override.ts` applies it to the world.
4. [x] `ColorsPopover` UI (randomize, undo/redo, locks, color inputs, seed + copy link, reset); Testing Library tests; `colors.*` keys in en/fr/mg. The Brightness and Contrast sliders move to task 5 (they need the lift in the store). Placed bottom-right above the player bar: overlap not yet checked with `scripts/play-layout.mjs`.
5. [x] Brightness slider, screenshots, README (Contrast slider and light/exposure tuning not done, see As built).

## Decisions for the author

- Keep Neon Nocturne dark as the *reference* look and add "Bright" as a second built-in palette, or lift the default?
  Recommended: keep the reference as the default of `/play/demo` for the judges, and make Randomize / Bright one click.
- Random schemes in the AI director too (palette from the song's mood) are already possible: no change here.

## Verification

Property tests (10 000 seeds), screenshots at three seeds, contrast report, Quest check with I7 (bright scenes are
heavier on additive blending: check fps).

## As built

- `xr/palette-generator.ts` (pure, seeded, OKLCH; property tests over 10 000 seeds), `xr/palette-override.ts`,
  `WorldHandle.setPaletteOverride`, `features/world-view/lib/palette-store.ts`, `hooks/use-palette-override.ts`,
  `components/ColorsPopover.tsx`. Decision: Neon Nocturne stays the default look; Randomize and the Brightness slider
  are one click away.
- An override re-applies the same plan with the merged palette: the views are rebuilt (geometry recreated), audio and
  clock are untouched. A different template id starts from its own colors.
- Brightness lifts background and terrain in OKLCH (`liftBrightness`), capped so the staff keeps 4.5:1 contrast.
  The slider commits 120 ms after it settles because each commit rebuilds the views.
- Screenshots (template, seeds `4F2A9`, `B7C01`, `19E3D`): `docs/improvements/i4/`. The popover does not overlap the
  player bar or the language switch at 1280×720 and 390×844 (checked with a Playwright script, panel vs slider bar).
- **I4b (follow-up):** a **Contrast** slider (`applyContrast`: widens or narrows the lightness gap between the dark
  base and the neon roles, staff keeps 4.5:1) and scene lights: `WorldHandle.setLightLevel` scales the ambient and
  directional lights (`lightLevelFor(brightness)` = 1 + 0.4 × brightness, bounded 0.5–1.5 for Quest fill rate; no
  rebuild). The renderer has no tone mapping (`toneMapping` = 0), so `toneMappingExposure` would do nothing and is not
  used. The Colors button moved to the bottom left and the panel scrolls (`max-h`): at the right it covered Enter VR and
  Explore. Layout checked at 1280×720, 390×844 and 1024×600 against the nav, AI box, language switch, Enter VR,
  Explore, Play and the player bar. Screenshots: `docs/improvements/i4/i4b-*.png`.
- **Not done:** `Save as my template` (requirement 8, waits for spec `09`); Quest fps check with bright scenes (needs
  I7 and a headset); the popover is hidden in VR.
