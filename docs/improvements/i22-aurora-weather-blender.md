# I22–I24 — Layouts, northern-lights notes, a weather world, Blender models

Request (2026-11-25): analyse and improve every 3D object, make them as realistic as possible with Blender, add an
arrangement choice, a northern-lights mode where the notes hang in the sky and can be picked while paused, and an
infinite dome world with sun, clouds, birds, rain and storms that follows the music, flexible, reusable and fast.

## I22 — Arrangement and northern-lights mode (viewer choices, never part of a template)

- `engine/layout.ts`: `LAYOUT_MODES` = `grid` (default, unchanged), `rows` (tiers: pitch picks the row), `ring`,
  `spiral`, `scatter`. `placeNote(..., mode)` stays pure; every mode stays inside its zone. `buildSpawnPlan(..., edits,
  layout)` stores the mode in the plan; the host rebuilds the plan with the same seed (`WorldHandle.setLayout`).
- `engine/sky.ts`: `skyNotesAt(plan, t)` lists the notes of a window (5 s played, `max(8 s, lookahead)` coming) with a
  position on one of three curtains (time along the curtain, pitch as height, seeded sway) and a glow. Pure, in
  `WorldState.skyNotes`. `skyPath` lifts the path to the aurora height, so every template gets the same sky.
- `xr/views/sky-notes-view.ts` + `xr/sky-store.ts`: three curtains (green, cyan, violet like the reference photo), one
  orb and one vertical ray per note (two InstancedMeshes, 5 draw calls). In this mode the staff view hides the staff and
  the falling glyphs (structures still grow on landing). `pickables(..., sky)` makes the sky notes pickable, so the
  note editor (click, drag, arrows, play) works on them while the song is paused.
- UI: "View" popover (`ViewPopover`), choices stored in `localStorage` key `mw.view`; labels en / fr / mg.

## I23 — Weather of the infinite world

- `engine/weather.ts`: `weatherAt(plan, t, mode)` is pure. Auto mode reads the song: minor chords nearby and a quiet
  passage give clouds then rain; a loud passage in a minor key gives a storm with lightning on seeded drum hits; major and
  calm give sun and birds. Modes `clear`, `cloudy`, `rain`, `storm` override the music. Tunable data: `WEATHER_WINDOW_SEC`,
  `FLASH_DECAY_SEC`, `STRIKE_SHARE`, the `FIXED` table.
- `xr/views/weather-view.ts`: sun (a moon on dark palettes), 90 cloud puffs in banks of three, 1400 rain streaks animated
  in the vertex shader, overcast / flash dome, a seeded lightning bolt, 24 flapping birds. 6 draw calls
  (`WEATHER_DRAW_CALLS`), everything driven by the audio clock, counts in `WEATHER_BUDGET`, reduced motion removes flash,
  flapping and drift. Fixed in the world like the environment and scaled with it.
- UI: weather row in the same "View" popover (`mw.view`).

## I24 — Models built with Blender

- `scripts/blender/build_models.py` (Blender 5.3 as the `bpy` module, `make models`): tree, conifer, bush, **cloud**
  (new), car, airplane, bicycle are modelled from primitives, bevelled, noise-displaced for the organic ones, baked ambient
  occlusion in vertex colors, decimated to a budget (420 to 800 triangles, 148 KB in total), exported as one-mesh GLB.
  No third-party asset: MIT, listed in `apps/web/public/models/LICENSE.md`.
- Bug found: `.gitignore` contained `models/`, so the I21 GLB files never reached the repository and two tests failed on a
  fresh clone. `.gitignore` now keeps `apps/web/public/models/`; the catalog lists only the models that exist (the
  shark, whale, clownfish, turtle, chest and wreck recipes go back to their procedural shapes).
- Test: every GLB parses with `GLTFLoader`, is one colored mesh and stays under budget.

## Verification

Web: 106 files, 567 tests, `tsc` clean. Screenshots by Playwright on `/play/demo` (software GL): aurora mode, storm with
overcast sky and rain, Living City with the new models, looked at by eye. Not measured: Quest 3 frame rate of the weather
(6 draw calls, 1400 line segments), and picking the sky notes with a VR ray. Both are human checks.
