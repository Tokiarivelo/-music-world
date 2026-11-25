# Next improvements and future features

Proposed on 2026-11-25 after phase I22. Submission deadline **2026-12-04 14:00 PT**, feature freeze **2026-12-03**.
Each item becomes a phase (`I23`…) with its own file in this folder when it starts, then a spec if it is large.

## Before the freeze (visible in the demo video, no human needed)

| # | Task | Why | Needs |
|---|---|---|---|
| 1 | **Done (I24)** Keep artist and title with the project; prefill the "Search lyrics" form from the uploaded file name | Today only the file's tags feed the catalog lookup; the project keeps no original name (I22) | no |
| 2 | **Done (I24)** Tolerate a different catalog duration: accept a close version and shift or stretch its timings instead of rejecting it beyond 4 s | A live or edited recording still answers "not found" (`MAX_DURATION_DIFF_SEC`) | no |
| 3 | **Done (I25)** Onboarding: first screen leads in one click to the demo song, with a short guided tour (Layers, pause and click a note, VR) | Judges open the app cold | no |
| 4 | **Guard done (I28), measurement open** Quest performance pass: draw-call budget with the 12 GLB models, LOD, texture compression | Main risk after I21; budget is ≥ 72 fps, < 100 draw calls | a Quest 3 |

## After the submission

Check the Kiroween rules before changing the app during judging (until 2027-01-29).

- **Export and sharing**: video or GIF of a world, public read-only link.
- **Microphone or MIDI input** to play and compose on the staff (follow-up of I9).
- **Richer synthesized sound**: a sampled instrument for I9 (open question).
- **Shared listening room** in WebXR (multi-user).
- **More models and templates**: community gallery, moderation already in place (specs 06 and 10).
- **Better transcription**: Whisper `small`, note filters (`docs/open-questions.md` questions 11 to 14).

## Human tasks that still gate the submission

Kiro credits request (before 2026-12-01 12:00 PT), OVHcloud instance and bucket, API keys, Quest 3 checks (I5–I9, I16),
video, Devpost form. Details: `docs/handoff.md` § 3.

## Finding from the I28 asset guard

The shipped models are heavier than the I21 report says: `car.glb` and `car_coupe.glb` have 4200 triangles, `car_retro.glb`
3208, `tree.glb` 1500 (the report listed 700 for the sedan; the later car and tree commits replaced the models).
`asset-budget.test.ts` now fails above 4500 triangles or 256 KB per model, embedded images or animations, textures
above 1024 px, or more than 64 MB of decoded textures. Open on a Quest 3: how many cars and trees are visible at once
(triangles = instances × model), and whether far instances should fall back to the procedural shape (LOD).
