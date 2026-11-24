# I5 — Show instruments, voice and lyrics, each one switchable

## Goal

"Display the instrument types, the voice, the lyrics, and let me choose which ones are shown." A "Layers" panel lists
what is in the song (drums, bass, vocals, other, chords, lyrics, particles…) with a color, an icon, a live activity
meter, and a toggle for each.

## Current state

- Every note has a `stem`: `vocals | drums | bass | other` (Demucs `htdemucs`, four stems; `analysis.v1`). Kicks come
  from the drums stem, chords from the harmony, `lyrics[]` (timed segments) with `lyricsSource`
  (`muse-voice | lrc | none`) are in the analysis result.
- The template `mappings[].when.stem` can route a stem to a shape kind; the viewer cannot hide a stem.
- Lyrics are not displayed anywhere yet (the staff shows notes and clef only).
- "Instrument types" beyond four stems (piano, guitar…) are **not detected**: `htdemucs` separates only these four.

## Requirements

1. A "Layers" panel (desktop popover, phone bottom sheet, VR panel page) SHALL list: **Drums, Bass, Vocals, Other**
   (labelled "Other instruments"), **Chords**, **Lyrics**, **Particles/FX**, **Staff**, each with a toggle, a color
   swatch (the stem's color in the world), an icon, and a small activity bar updated from the notes sounding now.
2. TOGGLING a stem SHALL hide its notes, structures and arcs in the world (instances are masked, not rebuilt) within
   one frame, and SHALL NOT change the audio unless "Mute audio of hidden layers" is enabled (stems are not played
   separately today: **this option needs the stems exposed to the browser, see Decisions**).
3. HIDDEN layers SHALL be remembered per browser (`localStorage`, try/catch), with presets: "Everything", "Rhythm only",
   "Melody only", "Voice and lyrics".
4. LYRICS SHALL be displayed as a karaoke line: the current segment highlighted, the next one dimmed, on desktop as an
   overlay above the player bar and in VR as a world-anchored panel; they follow the audio clock and survive seeking.
   WHEN `lyricsSource` is `none` the toggle is disabled with the reason shown.
5. VOICE: the "Vocals" layer SHALL show the vocal notes (melody of the voice) and, when lyrics exist, the words; the
   two toggles are independent.
6. EVERY layer control SHALL be keyboard operable (`aria-pressed`), labelled through the locale files (I3).
7. THE layer mask is **view state**: `worldStateAt(plan, t)` and the spawn plan are unchanged; tests assert that equal
   `(plan, t)` give equal state whatever the mask.
8. Performance: masking one stem uses per-instance scale 0 or a per-kind `count`; no extra draw call; lyrics ≤ 1 draw
   call (MSDF text, shared with the panel).

## Design

- `engine/layers.ts`: `LayerId`, `LayerMask` (bit set), `stemOfTrack`, `activeNotesAt(plan, t, mask)` (pure); the
  structure view receives the mask and hides the instances of masked stems (tracks are per kind today: add the stem to
  the instance record, or split tracks by `(kind, stem)` where a template maps stems separately — measure draw calls).
- `LyricsView` (xr): MSDF text line(s), fed by `lyricsAt(analysis, t)` (binary search, pure, seek-safe).
- `features/world-view/components/LayersPanel.tsx` + `useLayers` store; `WorldHandle.setLayerMask(mask)`.
- Activity meters: `activeNotesAt` counts and normalized velocity per stem, throttled to 15 Hz.

## Tasks (one commit each)

1. `engine/layers.ts` + `lyricsAt` + property tests (mask never changes state, seek equivalence for lyrics).
2. Structure/arc/staff views honor the mask; draw-call tests.
3. `LyricsView` desktop overlay + VR panel text; tests.
4. `LayersPanel` UI, presets, persistence; Testing Library tests.
5. Activity meters; reduced-motion variant.
6. Docs (README, `PROJECT.md` §6/§7), screenshots.

## Decisions for the author

- **More instrument types?** Switching Demucs to `htdemucs_6s` gives guitar and piano as stems (6 total) but is slower
  (≈ 1.5× CPU) and its guitar/piano separation is weaker; Basic Pitch then runs per stem. Recommended: ship the four
  stems now, add `DEMUCS_MODEL=htdemucs_6s` as an option later (the pipeline already has `DEMUCS_MODEL`).
- Muting hidden layers in the audio requires serving the separated stems (storage + bandwidth + decoding four tracks
  in the browser). Recommended: out of scope for this phase; visual layers only.

## Verification

Vitest (mask invariance, lyrics lookup), views budget tests, Playwright screenshots with each layer hidden, Quest check
of the VR layers page.

## As built (phase I5, 2026-11-24)

- `engine/layers.ts` (pure): layer ids, hidden set, presets (Everything, Rhythm only, Melody only, Voice and lyrics),
  `lyricsAt` (binary search, seek-safe), `activityAt` (loudest sounding note per stem). `SpawnRecord.stem` is new (null for
  scenery, which is never hidden). `worldStateAt` and the plan do not read the mask.
- `xr/layer-store.ts` + `WorldHandle.setHiddenLayers` / `activity()`: structures, staff glyphs, chord arcs, particles and
  decor arcs, and the staff lines honor the mask in `update` (instances not written, objects hidden), no extra draw call; a
  mask change redraws at once even while paused (tests in `views/layers-view.test.ts`).
- UI: `LayersPopover` (next to Colors): presets, one toggle per layer (`aria-pressed`, swatch, stem activity meter polled at
  10 Hz, 2 Hz with reduced motion), Lyrics disabled with the reason when the song has none; choice kept per browser
  (`mw.layers.hidden`, try / catch). `LyricsOverlay`: current verse highlighted, next one dimmed, driven by the audio clock.
  Strings in en, fr, mg. Screenshots: `docs/improvements/i5/`.
- Not done: the VR layers page and world-anchored lyrics panel, muting the audio of hidden layers (needs stems served to the
  browser), more instrument types (`htdemucs_6s`), a browser check of the lyrics overlay (the demo song has no lyrics: only
  unit tests), a Quest check.
