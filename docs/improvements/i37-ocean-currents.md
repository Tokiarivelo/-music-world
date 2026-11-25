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
