# Open questions (to evaluate at the end)

Questions the agent could not settle alone while it kept going through the improvement phases. Each has the default
the agent applied, so nothing is blocked. Newest at the bottom; strike a line once answered.

| # | Phase | Question | Default applied |
|---|---|---|---|
| 1 | I8 | Asset sourcing for realistic objects: CC0 packs (Kenney, Quaternius, Poly Pizza), author-made, or generated? | nothing sourced; only the motion functions are built |
| 2 | I8 | Is "very realistic" on Quest 3 = PBR mid-poly models with baked light and blob shadows (not photorealism)? | assumed yes |
| 12 | I8 | The seven object kinds are procedural low-poly shapes with baked colors, moving along seeded paths. Good enough, or wait for authored GLB models? | procedural kept, lighting and GLB left for later |
| 3 | I9 | Sampled instrument tone (needs a CC0 sample set) instead of the synthesized tone? | synthesized tone |
| 4 | I9 | Should "Play my edits" honor mute / solo per line? | yes (proposed in the spec) |
| 5 | I10 | Upload duration guard: keep the 30 minute refusal, or remove it (the 25 MB limit already applies)? | 30 minute guard kept |
| 6 | I10 | R2: create the bucket and the API token, then seed the three public songs with `--only`? | needs the human |
| 7 | I10 | The Eric Clapton recording is all rights reserved: keep it in the local catalog only (`is_public=false`)? | local only, refused on remote stores |
| 8 | I13 | Whisper model size: `base` (default), `tiny` (faster, worse) or `small` (slower, better)? Is the first model download (about 150 MB) acceptable on the deployed worker? | `base` |
| 9 | I13 | Online lyrics lookup sends artist, title and duration to lrclib.net: add a line to the upload notice? | documented in `docs/improvements/i13-auto-lyrics.md` only |
| 10 | I11 | Beyond 5 minutes the world plays generic notes (one per beat from the song's own pitch classes): is that the wanted look? | as described |
| 11 | I10 | Notes were filtered harder (overtones, one voice for vocals and bass, chroma check); on Machine 36 % of notes went with no gain in the in-key proxy. Listen and say which songs sound wrong. | filters kept |
| 13 | I19 | `neon-nocturne` is `flat` to keep the reference image; should the default template also be `polished`? | flat (one word to change) |
| 14 | I19 | Quest 3 frame rate of lit PBR materials is unmeasured (IWER only): acceptable? | polished by default, `flat` as the fallback |
| 15 | I21 | Models come from CC0 packs and look different from the procedural shapes; keep this style, or look for others? Anchor, coral, jellyfish, octopus, crab, clouds still have no model. | kept; remaining kinds procedural |
