# I37 — Abyssal Currents (ocean world, notes carried by currents)

- New staff style `staff.style: "current"` (pydantic `Staff`, regenerated zod/JSON schemas, editor option, en/fr/mg labels).
  `engine/current.ts` is a pure path `(from, to, noteHash, progress)`: slow eased sink, lateral meander shared by
  neighbouring notes (same stream), zero at both ends so the note lands exactly on its target. Used by `worldStateAt`.
- New featured template `abyssal-currents` (reuses the 26 Nemo Reef recipes and 31 scenery kinds, `fx.environment: underwater`).
  Harmony: analogous blue / teal / violet palette; pitch bands go low → high through one family each, colour roles cycle
  primary → secondary → accent; chords become fish schools, drums bubble columns.
- Check on a Quest 3: current paths with `fallDuration` 1.6 s (more notes in flight at once than the 0.35 s default).
