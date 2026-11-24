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
