# I37 — Abyssal Currents (ocean world, notes carried by currents)

- New staff style `staff.style: "current"` (pydantic `Staff`, regenerated zod/JSON schemas, editor option, en/fr/mg labels).
  `engine/current.ts` is a pure path `(from, to, noteHash, progress)`: slow eased sink, lateral meander shared by
  neighbouring notes (same stream), zero at both ends so the note lands exactly on its target. Used by `worldStateAt`.
- New featured template `abyssal-currents` (reuses the 26 Nemo Reef recipes and 31 scenery kinds, `fx.environment: underwater`).
  Harmony: analogous blue / teal / violet palette; pitch bands go low → high through one family each, colour roles cycle
  primary → secondary → accent; chords become fish schools, drums bubble columns.
- Check on a Quest 3: current paths with `fallDuration` 1.6 s (more notes in flight at once than the 0.35 s default).

## Realistic ocean life (second pass)

- The Nemo Reef procedural recipes looked crude, so Abyssal Currents is `fx.material: "polished"` and every creature and
  plant of it is an authored Blender model: `scripts/blender/build_ocean.py` (`make ocean-models`), 23 GLB files
  (whale, shark, dolphin, manta, turtle, jellyfish, octopus, seahorse, clownfish, fish school, pufferfish, kelp, seagrass,
  staghorn / brain / fan coral, tube sponge, anemone, starfish, urchin, crab, scallop, shipwreck), 2.1 MB in total.
  Countershaded animals (dark back, pale belly), species colours. Modelled from primitives: MIT, no third-party asset.
- `ModelSpec.natural`: these models keep their own colours (the palette tints them by 18 % so they sit in the water).
- Bug found while building: the byte-colour layer of Blender is sRGB, so the older `lin()` colours of `build_models.py`
  come out darkened twice (compensated by `POLISH_GAIN`); `build_ocean.py` writes raw sRGB so the file holds the colour
  written in the script.
- The land objects of Nemo Reef (buildings, crystals, spikes, treasure chests, anchors) are not in this template.
- Check on screen and on a Quest 3: the look of each model in the water column (fog, lights), draw calls (24 kinds).

## Swimming animals (third pass)

- `engine/swim.ts`: every swimming animal of an underwater world (`fx.environment: "underwater"`) roams freely instead
  of standing where it landed. Pure function of `(seed, id, musical time)`: an epicycle path (never stops, no spin, long
  gentle turns, the odd loop), heading = direction of the velocity, nose pitch from the vertical speed, bank into turns,
  species depths (dolphin porpoises, manta glides, crab walks sideways on the seabed, seahorse and jellyfish stay
  upright). Speeds follow the musical clock of I31: calm passages drift, loud ones rush. `Pose` gained optional `pitch` and `roll`.
- Animals that stay put like the real ones do (starfish, urchin, anemone, plants) are not in `SWIMMERS`.
- Body motion in the vertex shader (`SWIM_MODES` in `polished-materials.ts`): tail beat of fish and sharks, fluke beat of
  whale and dolphin, manta wing flap, jellyfish bell pulse, kelp / seagrass / anemone / fan swaying in the current. On the
  audio clock, so it freezes with the pause; the phase comes from the instance id (the position changes as they swim).
- Not verified on screen (no browser run here): look at the amplitudes and speeds (`SWIMMERS`, `SWIM_MODES`) and the
  crowd collision of big swimmers on a Quest 3.

## Calm, collision-free movement (I38)

- **Slower, harmonious time.** The musical clock now varies between 0.6 and about 1.15 (was 0.45 to 2.25) and a beat is a
  soft nudge. Swimmer speeds are about 2.5 times lower, planes cross at 2.2 to 4.5 m/s (was 6 to 14).
- **Roads** (`engine/roads.ts`, drawn by `xr/shapes/road-geometry.ts`, one draw call): up to three closed roads per plate
  (two for cars, a small one for bicycles) that cross each other. At each crossing one road goes **over** (flyover with
  ramps, deck, parapets and pillars) or **under** (tunnel with portals; the car sinks below the plate); crossings too
  close on one road are joined into one long viaduct. Cars drive in two lanes per road, evenly spaced at one speed, so no
  car ever catches another and two roads never meet at the same level.
- **Nothing stands on a road.** `engine/spawn-plan.ts` pushes the landing point of every fixed object (trees, stones,
  houses, ridges, coral…) out of the road corridor, so a car never drives through anything. This replaced the dodging code.
- **Few at a time.** Each moving kind shows only its most recent records: cars 22, bicycles 8, planes 3, clouds 10, and per
  species whale 2, shark 3, dolphin 4, manta 3, turtle 4, jellyfish 8, octopus 3, seahorse 5, clownfish 8, fish schools 6,
  pufferfish 4, crab 5 (`SwimSpec.cap`). Planes get their own altitude (above the clouds) and lane.
- **Hordes of small fish**: the `fish_school` model is a horde of 36 silver fish all heading the same way; it appears on
  chords and as scenery.
- **Rainbow touch**: an object (tree, car, plane, cloud, animal…) that a falling note passes through blinks in rainbow
  colours for 2.6 s (`StructureView.touch / rainbow`, view-only state, forgotten on a seek back).
- Abyssal Currents: scenery and `budget.instancesPerKind` (40) reduced.
- Not seen on screen: check the road look (width, bridge height, tunnel portals), the lane speed, and the touch radius on a Quest 3.
