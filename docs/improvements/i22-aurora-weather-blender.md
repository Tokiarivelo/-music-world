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

## I25 — Photographic sky, dome world and landscapes (follow-up request)

- **Photographic sky** (`xr/views/weather-view.ts`, `engine/weather.ts`): seven Poly Haven HDRI skies (CC0) tone-mapped by
  `scripts/blender/hdri_to_jpg.py` into `public/sky` (2048 x 1024 JPEG, 540 KB in total, `LICENSE.md`). `skyWeights(weather,
  time)` gives crossfade weights (clear, cloudy, overcast, storm by day; sunset; night, night with clouds); the dome shader
  blends the two heaviest. Time of day (Auto reads the palette, Day, Sunset, Night) and the toggle are in the View popover.
  Only `fx.material: "polished"` templates use it; `flat` templates (the neon reference image) keep their gradient sky. While
  the photos load, the drawn sun, clouds and overcast stay as the fallback.
- **Horizon view** (`ViewPresetId` `horizon`): low camera and a 58 degree lens (`HORIZON_FOV_DEG`), used automatically when a
  polished world loads in the default view, so the dome is in the frame; any other preset restores the 20 degree lens.
- **Dome world** (`xr/dome-store.ts`, "Dome world" in the View popover; the viewer's `mitsinjo-grid`-style controls of
  `08-navigation-mode` are kept): the plate is hidden, the world uses the immersive scale (80 m of ground around the viewer,
  ground and hills out to the horizon), the camera is the walk camera (drag to look, WASD) at the centre of the dome and
  `clampToBounds` keeps it inside a circle (`DOME_WALK_RATIO` 0.85 of the half width): it cannot leave. Buildings and trees stop it
  as before.
- **Landscapes** (`engine/landscapes.ts`, data only): `template` (palette, unchanged), `meadow`, `desert`, `snow`, `rocky`,
  `city`. Each gives the ground a photographic tile (ambientCG CC0: Grass001, Ground054, Snow014, Ground111, Asphalt033, 512 px,
  `public/ground`, built by `scripts/blender/ground_textures.py`), its own haze (scene fog follows it) and its own hills (height
  and ruggedness). Adding a landscape is one entry plus one tile.
- **Models**: more detail (tree with limbs and 12 foliage clumps with color drift, conifer in 8 ragged tiers, bush of 9 clumps, car from a
  real side profile with windows, mirrors, spokes) and larger budgets (up to 1800 triangles).
- Keywords of the reference images still wanted: `docs/reference-images.md`.
- Not done: models are still modelled from primitives (no photo textures on the meshes, only the runtime detail maps), no bird
  model (the birds are flat V shapes), Quest 3 cost of the photographic sky and of 1800 triangle cars unmeasured.

## I26 — Cars modelled from reference photographs

Reference photos supplied by the author (a red and a silver Toyota Matrix hatchback, a black Porsche 911 coupe, a pink 2CV
style die-cut set, a silver Hyundai Matrix) were used only as visual references for proportions, silhouette and details; the
meshes are modelled from scratch in `scripts/blender/build_models.py` (no photo is traced, copied or shipped).

- Body: one continuous lofted shell per car (hull, beltline shoulder, tapered glasshouse, roof) from 10 to 11 measured sections,
  Catmull-Rom densified, so no overlapping shells or decimation damage. Glass, pillars and sill cladding are painted by face.
- `car` = hatchback (swept lamps, upper and lower grille, fog lamps, roof spoiler, tailgate and door shut lines, handles, mirrors,
  five-spoke alloys); `car_coupe` = 911 type (round lamps on raised wings, fastback, ducktail, chrome bumpers, Fuchs-style wheels);
  `car_retro` = 2CV type (tall cabin, contrasting wings, round lamps, narrow white wheels).
- Variants (`xr/shapes/model-catalog.ts` `MODEL_VARIANTS`, `structure-view.ts`): instance slot `s` wears model `s % 3`, each
  variant is one more InstancedMesh with the same material (two more draw calls for cars). Triangles: about 4 k per car, more
  than the other models: check the frame time on a Quest 3 and lower `BUDGET["car"]` if needed.
- Not matched exactly: paint is a neutral light grey (the template tints it), body details are geometry only (no decals,
  no plate or badge text), wheel arches are dark discs, not cut openings.

## I27 — Environments improved from the author's reference images

Source: `451f084b-reference.zip` (96 images, README with sources and licences; kept outside the repository, only CC0 items
may be bundled). What the references showed, and what changed:

- **Layered landscapes** (`rolling_hills_mist_layers`, `distant_mountains_haze_layers`): far ridges are lighter and bluer, with a
  band of mist near the ground. `EnvironmentView` now has 5 hill rings (was 2) coloured by atmospheric perspective
  (`t ** 0.65` toward the landscape haze) and a mist band (one more draw call, 4 in total, `ENVIRONMENT_DRAW_CALLS`).
- **Aurora** (`aurora_borealis_over_snowy_mountains`, `aurora_borealis_green_curtains`): green glow low, violet / magenta far up
  the rays, wide folds. The sky curtains use a `sky` shader mode (taller folds, bright band over a soft lower edge, height tint).
- **Lightning** (`lightning_forked_bolt_night`): a bolt is now a jagged trunk with three forks, drawn additive, with a lilac glow
  sprite; the sky flash stays. Seeded by the drum hit, so a seek gives the same bolt. The weather view has 7 draw calls.
- **Birds** (`bird_flight_*`, `swallow_flight_profile`): a body, head and tail with two-segment wings; the tips beat and the
  elbow follows.
- **Skies**: two more Poly Haven CC0 HDRIs from the reference set, `dusk` (`qwantani_dusk_1_puresky`, calm low sun) and `dramatic`
  (`wasteland_clouds_puresky`, thick banks of cloud by day). `skyWeights` now crossfades nine photos: day (clear, cloudy, dramatic,
  overcast, storm), sunset (dusk, sunset, overcast, storm), night (night, night with clouds).
- Still reference only (not CC0, not bundled): oak, spruce, boxwood, cumulus, car and aircraft photos and blueprints, the
  Wikimedia images. The aircraft blueprints (Cessna 172, Piper, A320, Concorde) are the next input for the airplane model.
