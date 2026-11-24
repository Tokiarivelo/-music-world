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
- Task 6: `features/world-view/hooks/use-note-edits.ts` owns the document (history of 50, selection, announcements, paused
  detection from `controls.isPlaying()`, reset on a new analysis); `components/EditToolbar.tsx` (toggle disabled with a
  reason while playing, undo / redo / reset, lines list with name, color, clef, height, mute, solo, order, duplicate,
  delete, "Add a line"; note panel with typed pitch, time, duration, velocity, line, color, play, duplicate, reset, delete,
  "Add a note"; `aria-live` status); `hooks/use-edit-shortcuts.ts` (Tab / arrows select, Up / Down move a step, Enter plays,
  Delete removes, Ctrl+Z / Ctrl+Shift+Z). Strings `edit.*` in en, fr, mg. Not yet: multi-select and copy / paste (6b),
  line staves and colors drawn in the world and `colorRole: "line"` (6c).
- Task 6b: selection is a list of note ids (`editStore.selection`, the last is the primary): ids survive the plan rebuild
  that follows every edit. Shift-click toggles a note; a drag or a keyboard step moves the whole selection by the same
  diatonic steps (`stepsBetween`) as one `committed` event with `moves[]`, one history entry. The panel edits, duplicates,
  resets and deletes all selected notes; Ctrl+C / Ctrl+V copy and paste them one second after the paused time, keeping
  their spacing and lines. Own colors and line colors reach the world: `SpawnRecord.colorHex` (note color, else its line
  color) tints glyphs through instance colors, only when some note has a color (otherwise the shared material is kept).
  Rubber-band selection is not built: Shift-click and "add a note" cover the cases (follow-up).
- Task 6c: each voice line is drawn as a full staff (`buildStaffGeometry(..., yOffset)`, own color, clef glyph only for
  `treble`: the generated Bravura set is not extended here, so `bass` draws no glyph); the main line's color and clef
  also apply. Contract: `colorRole` gains `"line"` (`make schemas`); the engine maps it to `PaletteRole | null` plus
  `SpawnRecord.structureHex` (the note's color, else its line color), used by `StructureView`; the director prompt does not
  list `line`. Mute and solo are stored per line and are used by "Play my edits" (task 7).
- Task 7: browser persistence per song (`mw.edits.v1:<audioHash>`, tolerant `parseEdits`, try / catch) and server sync for the
  signed-in owner: migration `0006`, `projects.edits_json`, `GET` / `PUT /api/projects/{id}/edits` (`GetProjectEdits`,
  `SaveProjectEdits`, 404 for non-owners and unowned projects, 413 `EDITS_TOO_LARGE`). The page reads the server copy first
  (it wins when it has content) and never saves an empty document over it; a 401 / 404 switches the sync off for the page
  (`projectEditsRemote`). The demo keeps its edits in the browser only. "Play my edits": `ScorePlayer` (rolling 100 ms
  scheduler over the audio clock, delay computed at each tick so seeks, pauses and rate changes are followed, mute / solo per
  line honored) plus `AudioPlayer.setMuted` (a gain node; the clock keeps running). Polyphony of the score is capped by the
  synth's pool of 8 voices.
