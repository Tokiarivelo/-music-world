# Design — Editable notes (improvement I9)

See `docs/improvements/i9-editable-notes.md` § Design. Add an "As built" section here after each task.

## As built

- Task 1: `apps/web/src/engine/edits.ts` (pure). `LayoutEdits` (`lines`, `notes`, `added`), `applyEdits` returns the edited
  analysis plus `lineOf` / `colorOf` maps; immutable helpers `editNote`, `resetNote`, `addNote`, `addLine`, `updateLine`,
  `deleteLine`; `stepPitch` / `snapToStaff` snap to C-major diatonic steps (E4 to F5 = 8 steps); `History` with
  `commit` / `undo` / `redo` / `resetAll` (limit 50). Lines are capped at 8 (main included), edits at 2 000.
- Task 2: `music-world.edits.v1` (`apps/api/music_world/schemas/edits.py`: `LayoutEdits`, `StaffLine`, `NoteEdit`,
  `AddedNote`, limits 8 lines / 2 000 edits, hex colors, line ids `[a-z0-9-]`). `when.line` added to the template mapping
  condition (additive, optional; the engine reads it in task 3). Director prompt lists `line "main"` only and
  `PROMPT_VERSION` is now `director-v3`.
- Task 3: `buildSpawnPlan(analysis, template, seed, edits?)` applies the edits first. `SpawnRecord` gains `line`, `lineY` (metres,
  `lineOffsetY` in `engine/staff.ts`, 6 gaps per `height` unit) and `colorHex`; `SpawnPlan.lines` lists the voice lines with
  their offset. `staffNotePosition` takes an optional `yOffset`. `when.line` is matched in `mapping.ts` (default `main`).
  With no edits the plan is equal to the old one (test). Rendering of extra staff lines and `colorHex` is task 5/6c.
- Task 4: `xr/audio/note-synth.ts` (`NoteSynth`, triangle voice, 0.5 s, pool of 8 with oldest stolen, lazy `AudioContext`
  injected for tests, `midiToHz`); `xr/picking.ts` (pure: `pickables` honours hidden layers, `pickAtScreen` with a
  24 px radius over a caller-supplied projector, `pickAtRay` with a 0.04 rad cone for VR). Neither is wired yet (task 5).
- Task 5: `xr/interaction/edit-controller.ts` (states idle / pressed / dragging; hover, press plays the pitch, drag snaps
  pitch along the screen projection of the note's own staff, release commits, Esc cancels; keyboard `selectRelative`,
  `nudge`, `playSelected`). `xr/edit-store.ts` is the view state (hover, selected, ghost) read by `StaffView`, which adds
  one halo for the selected note and one ghost glyph + halo for the drag target (capacity +1 glyph, +2 halos, no extra
  draw call). `WorldHandle` gains `setEdits` (rebuilds the plan with the same seed), `setEditMode`, `onNoteEvent`,
  `editCommand`; the host binds the controller in the capture phase of the canvas, so a press on a note does not orbit
  the camera. The page enables the mode only while paused (task 6). Time moves are not dragged: time is typed in task 6b.
