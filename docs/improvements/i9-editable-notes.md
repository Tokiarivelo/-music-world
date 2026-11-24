# I9 — Click, hear and move the notes (solfège) when the song is paused

## Goal

"When the song is paused, let me click the notes (the solfège). Clicking plays the sound of the note. Let me also move
them onto other lines, or create a new line." The listener becomes a small composer: pause, touch a note, hear it, drag
it to another line of the staff (another pitch), or open a new line and put notes on it.

## Current state

- Notes on the staff are Bravura glyphs (`StaffView`, one `InstancedMesh` per glyph kind); they slide along the staff and
  fall to the plate (`engine/world-state.ts`, `engine/staff.ts`). Nothing in the world is clickable: the only pointer
  input is the camera navigation (`xr/navigation`) and the spatial panel in VR.
- A note comes from the analysis (`analysis.v1` `notes[]`: `id`, `time`, `duration`, `midi`, `velocity`, `stem`,
  `chordId`). The staff position is `staffUOf(midi)`: bottom line = MIDI 64 (E4), top line = MIDI 77 (F5).
- The audio is the uploaded song. There is **no synthesizer** in the app: a single note can not be played today.
- The world is a pure function of `(plan, t)`; the plan is rebuilt from the analysis, template and seed
  (`buildSpawnPlan`), which is cheap enough to redo on a pause.

## Requirements

1. WHILE the song is paused, THE notes visible on the staff (and the ones in their fall) SHALL be hoverable and
   clickable (mouse, touch, VR controller ray or pinch). While it plays, notes are not pickable and the pointer keeps its
   camera role. A hovered note is highlighted (halo + cursor) and has an accessible name ("C4, quarter note").
2. CLICKING a note SHALL play its pitch right away (Web Audio synthesized tone, ≈ 0.5 s, velocity from the note, a soft
   envelope) without touching the song audio, the clock or the playback position; clicking again replays it. The tone
   is an instrument of the app (no sample licence needed), the same function for desktop and VR.
3. DRAGGING a note SHALL move it between the **lines and spaces** of the staff, snapping to the scale steps: the pitch
   changes by one diatonic step per half line gap, a ghost shows the target, the new pitch is played on release, Esc
   cancels. Moving it sideways in time is allowed within its neighbours' onsets (snapped to the beat grid), off by default
   (a setting), so the rhythm of the song stays recognizable.
4. A **new line** SHALL be creatable: a "+" control above and below the staff adds an extra staff line group (a "line"
   = a voice line, with its own five lines, clef and color). A note dragged onto it joins that line. Lines can be renamed,
   recolored and deleted (their notes return to the main line). Up to 4 lines.
5. EDITS SHALL be data on top of the analysis, never a change to it: `NoteEdit { noteId, midi?, time?, lineId? }` and
   `StaffLine { id, name, color }` in a validated `LayoutEdits` document. `buildSpawnPlan` takes the edits as an input;
   `worldStateAt` stays pure; a new plan is built when an edit is committed (while paused), with the seed unchanged so
   the scenery does not move. A deleted or unknown `noteId` is ignored.
6. THE mapping from line to world SHALL be explicit: a template rule may match `line` like it matches `stem`
   (`when.line`); notes of a new line without a rule use the default mapping. (Additive field in `music-world.template.v1`:
   `make schemas`; the director may use it, `PROMPT_VERSION` bump.)
7. UNDO / REDO (Ctrl+Z / Ctrl+Shift+Z, buttons) with a history of 50 edits; "Reset edits" restores the analysis.
8. EDITS SHALL persist per project in the browser (`localStorage`, try/catch) and for signed-in users with the project
   on the server (`PUT /api/projects/{id}/edits`, owner only, schema-validated, ≤ 64 KB); the demo song keeps its edits
   in the browser only. A shareable link does not carry edits in this phase.
9. THE original audio SHALL keep playing as is. An option "Play my edits" (off by default) replaces the song by the
   synthesized notes of the edited score (all stems), so the listener hears what they composed; the song audio is muted
   while it is on. Out of scope: exporting audio or MIDI (a follow-up).
10. VIEW layers (I5) apply: a hidden layer's notes are not pickable. The layers panel lists the user's lines too.
11. ACCESSIBILITY: edit mode is keyboard operable: Tab / arrow keys select the previous / next note, Up / Down move it a
    step, Enter plays it, Delete resets it; every action announces itself in an `aria-live` region; labels come from the
    locale files (I3). `prefers-reduced-motion`: no ghost animation.
12. PERFORMANCE: picking is a CPU lookup on the notes of the current frame (≤ 512), not a scene raycast against the
    meshes; the synthesizer reuses one `AudioContext` and a pool of 8 voices; no extra draw call (the ghost and the
    highlight are two instances of the existing glyph mesh); rebuilding the plan on commit takes < 100 ms for 2 000 notes.

## Design

- `engine/edits.ts` (pure): `LayoutEdits`, `applyEdits(analysis, edits) → EngineAnalysis` (midi, time, line),
  `stepPitch(midi, steps, key)`, `snapToStaff(staffU) → midi`, `commitMove`, `history` (undo / redo as immutable stacks).
  `buildSpawnPlan(analysis, template, seed, edits?)`; `SpawnRecord.line` (like `stem`, I5).
- `engine/staff.ts`: `StaffPath` becomes a list of staves (`lines[]`); each has an offset along the plate's up axis and a
  color; `staffNotePosition(path, line, u, staffU)`; the single-line case is unchanged byte for byte (reference look).
- `xr/audio/note-synth.ts`: `NoteSynth` (Web Audio, lazily created on the first user gesture, resumed after a pause).
  `playNote(midi, velocity)`; pure helper `midiToHz`. No audio in the playback loop: only on click and in "Play my edits".
- `xr/picking.ts` (pure): `pickNote(state, plan, pointerRay | screenPoint, camera) → noteIndex | null` over
  `notesOnStaff` and `fallingNotes` at the paused time; projects glyph centres to the screen and picks the nearest within
  a radius (≥ 24 px, VR: angular radius). Works for mouse, touch and VR rays alike.
- `xr/interaction/edit-controller.ts`: states `idle → hover → pressed → dragging → committed`, only when the clock is
  paused; emits `selected`, `moved`, `committed`; calls the synth. It takes pointer input from the navigation input
  binding (capture while a note is under the pointer, so a drag on a note is not a camera orbit).
- `features/world-view/components/EditToolbar.tsx`: toggle "Edit notes" (enabled only while paused), undo / redo, reset,
  "+ line", line list (rename, color, delete), "Play my edits", live region. `hooks/use-note-edits.ts` owns the document
  and persistence; `WorldHandle.setEdits(edits)` rebuilds the plan, `WorldHandle.onNoteEvent(listener)` reports picks.
- API: `projects` context gets `edits` (JSON column, migration), `GET/PUT /api/projects/{id}/edits`, schema
  `music-world.edits.v1` in `apps/api/music_world/schemas/edits.py` (`make schemas`), size and count limits, owner only.
- VR: ray + trigger picks and drags a note in the immersive scale (I7), a small panel page lists lines; the note tone is
  played through the same `NoteSynth`.

## Tasks (one commit each)

1. `engine/edits.ts` + `applyEdits` + history + property tests (edits never mutate the analysis, undo/redo round trip,
   snapping stays on the staff, unknown ids ignored, plan from edits is deterministic and seek-safe).
2. Contract: `music-world.edits.v1` schema, `when.line` in the template, director prompt + `PROMPT_VERSION`, schemas.
3. `engine/staff.ts` multi-line staves + `SpawnRecord.line`; the one-line plan is unchanged (golden test on the demo).
4. `xr/audio/note-synth.ts` + `xr/picking.ts` + tests (frequency table, voice pool, picking radius, hidden layers not pickable).
5. `edit-controller` (hover, click-to-play, drag with ghost, snap, cancel, only when paused) + view highlight / ghost.
6. `EditToolbar`, new line management, undo / redo / reset, keyboard operation and live region, strings (en, fr, mg).
7. Persistence: browser storage and `PUT /api/projects/{id}/edits` (migration, tests), "Play my edits" option.
8. VR picking and drag, line list on the panel; IWER check; docs (README, `PROJECT.md` §6/§7), screenshots.
9. Quest 3 check (human): ray accuracy, drag comfort, tone latency.

## Decisions (answered by the author, 2026-11-24): maximum control

"I want as much control as possible: over the notes, over the lines of the notes, and over the colors of each line."
This settles the open points and widens the scope:

- **A line is a full staff (voice line)**, not only extra ledger lines. Each line has its own five lines, clef (treble,
  bass, none), name, **color** (staff, glow and its notes), height in the sky (aurora, I6), visibility (layer, I5),
  mute and solo. Lines can be created, duplicated, reordered, renamed, recolored and deleted (up to 8).
- **Per note**: pitch (drag between lines and spaces, or Up / Down), time (drag sideways, snapped to the beat grid or free
  with Alt), duration (drag the right edge, which changes the glyph), velocity (wheel or slider), line, **own color** (an
  override of the line color), delete, duplicate, and **add a note** by clicking an empty spot of a line while paused.
  Multi-select (Shift-click, rubber band) moves, recolors or deletes several notes at once; Ctrl+C / Ctrl+V copies them.
- **Per line colors** reach the world: a line's color tints its glyphs, its staff and, through `colorRole: "line"`, the
  structures its notes make (a new mapping color source next to the palette roles).
- Pitch moves and time moves are both allowed (settings in the toolbar: "Lock time", "Snap to beat", "Snap to scale").
- Tone: synthesized by default; a sampled instrument is an option per line only if a CC0 sample set is found.
- Persistence: browser first (tasks 1–6, 8 without the server), then the server (task 7).

Requirements 3, 4, 5 and 6 above are read with this wider scope, and these are added:

13. `NoteEdit` gains `duration?`, `velocity?`, `color?`, `deleted?`; `LayoutEdits` gains `added[]` (new notes with their own
    ids `user:<n>`), and `StaffLine` gains `clef`, `height`, `muted`, `solo`, `order`. All validated, bounded (≤ 2 000 edits).
14. A **properties panel** shows the selected note or line with number fields and a color input for every property
    (hex input, preset swatches, the palette roles), so everything done by dragging can also be typed.
15. **Line colors** SHALL respect the I4 palette override (a line follows the template palette unless the user picked a
    color for it) and the contrast rule of the editor (staff against background ≥ 0.2).

Additional tasks (inserted after task 6, each one commit): **6b** per-note properties (duration, velocity, color, delete,
duplicate, add) with a properties panel and multi-select; **6c** per-line properties (clef, color, mute, solo, order,
duplicate) and `colorRole: "line"` in the mapping contract; their tests, strings (en, fr, mg) and docs.

Still open for the author: sampled instrument (needs a CC0 sample set), and whether "Play my edits" should honor mute /
solo per line (proposed: yes).

## Verification

Vitest (edits, snapping, picking, history, controller state machine with a fake clock and a fake synth), views budget
tests (no extra draw call), Testing Library for the toolbar, API tests for the edits endpoint, Playwright screenshots
(paused, hover, drag ghost, two lines), IWER for the VR pick, Quest 3 for latency and comfort.

## Risks

Audio autoplay rules: the `AudioContext` must start from a click (it does: the first click on a note). Mixing a click
tone with a paused song is fine, but with "Play my edits" the two clocks must not drift: the synthesized score is
scheduled from the audio clock only. Dragging a note that is in its fall (not yet landed) changes where its structure
will grow: the plan rebuild keeps the seed, so unrelated notes do not move, but the moved note's structure does.
