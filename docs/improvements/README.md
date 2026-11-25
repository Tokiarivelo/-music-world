# Improvement phases (post-MVP)

Improvements asked from 2026-11-24 on, one file per phase (I1–I9 that day; I10–I22 later, see the table). I1–I9 and I19–I22 are built; I8 is done as procedural shapes then upgraded by I19–I21. Each file has: goal (the request), current state (checked in
the code), requirements with acceptance criteria, design, tasks (one commit per task, like the roadmap phases),
verification and the decisions that need a human. The first nine started as plans; the table says what is built. When a phase starts,
convert it to a spec in `.kiro/specs/<NN>-<name>/` (`requirements.md`, `design.md`, `tasks.md`) as the workflow requires.

| Phase | File | Request | Effort | Needs a human |
|---|---|---|---|---|
| I1 | [`i1-back-to-upload.md`](i1-back-to-upload.md) | Way back to the upload page from `/play/{id}` | 0.5 day | no — **done** (branch `phase-I1-back-to-upload`) |
| I2 | [`i2-fullscreen-world.md`](i2-fullscreen-world.md) | 3D space fills the whole screen, no black areas | 1–1.5 days | no — **done** (branch `phase-I2-fullscreen-world`) |
| I3 | [`i3-i18n.md`](i3-i18n.md) | Every text in locale files, multi-language | 2–3 days | translations (fr, mg) — **done** (branch `phase-14-i18n`), review pending |
| I4 | [`i4-random-scene-colors.md`](i4-random-scene-colors.md) | Brighter scene, random / chosen colors | 1–1.5 days | no |
| I5 | [`i5-layers-instruments-lyrics.md`](i5-layers-instruments-lyrics.md) | Show instruments, voice, lyrics; toggle each | 2–3 days | stem model choice — **desktop done** (VR page not done) |
| I6 | [`i6-aurora-sky-staff.md`](i6-aurora-sky-staff.md) | Tablature as aurora in the sky, notes rain down | 3 days | Quest check — **first slice done** (style `aurora`, rain, curtain, Aurora Night) |
| I7 | [`i7-immersive-scale.md`](i7-immersive-scale.md) | Immersion and explore: you stand inside the world | 2–3 days | Quest check, comfort — **first slice done** (walk, scale, VR glide) |
| I8 | [`i8-realistic-objects.md`](i8-realistic-objects.md) | Clouds, cars, bicycles, planes, plants… very realistic | 5+ days | asset sourcing and licences — **done as procedural**: seven kinds, Living City, motion, blob shadows, wind; CC0 GLB models for 12 kinds (I21); PBR, textures, LOD not needed (see the file); Quest 3 check open |
| I9 | [`i9-editable-notes.md`](i9-editable-notes.md) | Click a note when paused to hear it, move it to other lines, create a new line | 6–8 days | decided: lines are full staves, per-note and per-line colors; open: sampled tone |
| I10 | [`i10-song-catalog.md`](i10-song-catalog.md) | Song catalog on S3 (Garage, R2), seed script, note-quality proxies | 1 day | R2 bucket — **done** (Clapton recording local only) |
| I13 | [`i13-auto-lyrics.md`](i13-auto-lyrics.md) | Lyrics found automatically (LRCLIB, then Whisper) | 1 day | no — **done**; I17 added the "Search lyrics" button |
| I19 | [`i19-polished-objects.md`](i19-polished-objects.md) | Every 3D object polished, reflective, more realistic | 1 day | Quest check — **done**: lit PBR materials, sky reflections, CC0 sky |
| I20 | same file, § Textures | Image textures on the objects | 0.5 day | no — **done**: CC0 bark, foliage, paint, metal, rock with box-projected UVs |
| I21 | same file, § Models | Authored 3D models for the objects | 1 day | style check (`open-questions.md` 15) — **done**: 12 CC0 GLB (Kenney, Quaternius, OpenGameArt) in the same instanced meshes |
| I22 | — | "Search lyrics" finds nothing for a file without tags: type artist and title; the catalog no longer needs the vocal stem | 0.5 day | no — **done** (branch `phase-I22-lyrics-search-query`) |
| I24 | [`i13-auto-lyrics.md`](i13-auto-lyrics.md) | Lyrics: artist and title guessed from the upload name; near-length catalog versions stretched | 0.5 day | no — **done** |
| I25 | [`next-improvements.md`](next-improvements.md) | Onboarding: home leads to the demo in one click; 4-step guided tour on `/play/demo` | 0.5 day | no — **done** (`features/onboarding`) |

See also [`next-improvements.md`](next-improvements.md): the proposed next tasks and future features.

## Order and schedule

Today is 2026-11-24; **feature freeze 2026-12-03**, submission 2026-12-04 14:00 PT. The deploy (roadmap phase 8) and the
human checks need those days too. Total effort above is ≈ 17–21 days for one agent: it does not fit. Proposed order
(each phase leaves `main` releasable):

1. **I3 (infrastructure part only: provider, `useT`, language switch, one feature migrated)**, because every phase
   after it adds text and must not add static strings.
2. **I2** (visible bug: black areas), then **I1** (tiny).
3. **I4** (brighter, random colors: cheap and very visible in the demo video).
4. **I7** (scale) and **I6** (aurora staff): the two changes that make the demo look different.
5. **I5** (layers) and the rest of **I3** (all features, French and Malagasy).
6. **I8** last and only a first slice before the freeze (clouds, trees, one vehicle) — see the file: "very realistic"
   needs authored assets and is the one that can slip past the deadline.

Suggested cut: I3-core, I2, I1, I4, I7, I6 before 2026-12-03; I5, I3-full, I8 slice if time remains; the rest after
the submission. **Check the Kiroween rules before changing the app after 2026-12-04** (judging runs until 2027-01-29;
the demo must stay online, but edits during judging may not be allowed).

## Rules every phase keeps

- Algorithms detect notes, LLMs only interpret; no LLM call in the playback loop; `worldStateAt(plan, t)` stays pure
  and seeded (`engine/prng.ts`); the audio clock is the only time source. A display choice (layers, colors, scale, language) is
  **view state**, never part of the world state.
- Quest 3 budget: ≥ 72 fps, < 100 draw calls, one `InstancedMesh` per kind, textures < 256 MB (`tech.md`). Every phase
  that touches rendering records draw calls and triangles in its tests (`views.test.ts` pattern) and gets a Quest check.
- Templates are data (no code, no URLs); 3D assets are `ShapeRecipe`s or validated GLB served from our own origin.
- No GPL/AGPL dependency; every asset has a licence entry (CC0 or MIT-compatible with attribution).
- Docs in the same change (`documentation.md`), one commit per task, PR per phase, token rules in `docs/token-budget.md`.
