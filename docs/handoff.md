# Handoff

> **Date:** 2026-11-26 · **Last updated by:** Claude Code (I39–I41: city, playlist, layouts by the director, traffic)
> **Format:** 6 fixed sections, **150 lines max**, rewritten at each handoff (see `.kiro/steering/handoff.md`).
> Previous sessions: `docs/handoff-archive/<YYYY-MM>.md` (not read by default).

Resume line for a new session or agent:

```text
Read docs/handoff.md and continue with the next actions.
```

## 1. Repository state

- Branch `phase-I43-walk-pegman` merged to `main` (I43 walk pegman, map, collisions; I44 water, building types). Push with gh credentials:
  `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin <branch>`.
- Checks on 2026-11-26: web vitest 698 passed, tsc and eslint clean; API pytest 398 passed, ruff and mypy clean;
  `validate-architecture.sh`: 2 pre-existing violations in `engine/sky.ts` (imports `three`, a comment with a flagged word).
- No server left running. A Compose stack (old images) and another project's containers may run; leave them alone.
- **Nothing is deployed**: no OVHcloud instance, domain, bucket or `infra/.env` exists yet. The repo is public.

## 2. Last session (2026-11-26, Claude Code, phases I39–I41)

- I39 living city (streets, lakes, bridges, lights, construction), I40 playlist ("My songs", private, in the browser) and
  template choice at upload, plan-driven notes, authored models in cities. Reports: `docs/improvements/i39-*.md`, `i40-*.md`.
- I40/I41 world plans: `inventoryOf(template)` and the template's optional `layout` (`WorldLayout`: inventory, patches,
  sequence). The user picks the template, the director writes the layout (`POST /api/projects/{id}/layout`,
  `/api/director/layout/demo`, prompt `layout-v2`), the engine follows it (reefs, realms and city mixes); derived layout
  when the call fails. Enchanted Realm template + 8 Blender models (`make fantasy-models`), flying dragons, fairy lights, mist.
- I41 traffic (`engine/traffic.ts`): cars and bicycles drive on the city street grid, stop at real signals (green 8 s,
  yellow 2 s, red), keep their distance; ring boulevards, flyovers and tunnels removed in cities; smaller cars and trees
  (`CITY_FOOTPRINT`). Details and limits: `docs/improvements/i41-ai-layout-realm-staging.md`.
- Screenshots checked (headless Chromium, swiftshader, mocked API): realm, reef, city explore and walk. Cars were not in
  frame in the last city shots (end of song): check cars close up in a browser.
- Not done: Quest 3 checks, black small blobs near trees in the city explore view (unidentified), I40 limits above.

## 3. Next actions

0. **Agent** — object editor and map creator, phase 2 (inventory, part tree panel, inspector): `.kiro/specs/12-object-editor/tasks.md` § Phase 2, briefing `docs/next-task-object-editor.md`; phase 1 (part tree schema, `buildNodeGeometries`, `recipeToNodes`, `stock-recipes.ts`) is done. Then look at cars close up in a real
   browser (`/play/demo`, Walk) and the small black blobs near trees in the city view; Quest 3 check of the traffic cost.

Plan, priorities and dates: `docs/roadmap.md` (read only the current phase). Submission deadline **2026-12-04 14:00 PT**.

1. **Human** — roadmap Phase 0: Kiro credits request (before **2026-12-01 12:00 PT**), OVHcloud instance + bucket,
   `META_API_KEY`, AWS Bedrock access. A new demo song is optional: put the MP3 in `apps/web/public/demo/`, run
   `cd apps/api && uv run python scripts/analyze_file.py <mp3> <json>`, replace
   `features/player/demo/neon-nocturne.analysis.json` (+ title/url in `demo-song.ts`) **and `DEMO_AUDIO_HASH` in
   `apps/api/music_world/director/domain/demo.py`**; tests check both hashes.
2. **Human** — roadmap 8.1–8.3 deploy, exact steps in `infra/README.md` § Deploy (`DRY_RUN=1` first, then
   `DEPLOY_HOST=ubuntu@<ip> DEPLOY_DOMAIN=<domain> make deploy`), verify per skill `deploy-ovh` § Verify incl. Quest
   Browser Enter VR, install the cron file, run one backup. Then replace `TODO(deploy)` in `README.md` and
   `docs/submission.md` with the public URL. Add `MODERATOR_EMAILS=` (your address) to `infra/.env` first.
3. **Human** — checks on the public URL: `06-template-store` task 7 (real e-mail, cross-user), `05-ai-world-director`
   task 7 (real Muse / Bedrock; if Muse rejects `response_format` json_schema, drop it in `providers/muse.py`),
   `07-xr-mode` task 7 on a Quest 3 (`07-xr-mode/design.md` § Human checks) then tick `03-world-engine-core` task 7,
   `10-template-moderation` task 7 (review one real hidden template).
   Update README § Known limitations once done.
4. **Human** — roadmap 9.3 video, 9.4 Devpost form, 9.5 posts from the drafts in `docs/submission.md` (checklist at
   its top). Run `uvx pip-audit` / `pnpm audit --prod` once before submitting.
5. **Human** — answer `docs/open-questions.md` (14 rows; I8 assets, R2 bucket, Whisper size, lyrics notice, note filters).
6. Agent-only tasks (no human, no credentials): `docs/backlog-agent.md` — B4 done (Caddy cache headers); see the file for the next free one.
   Optional: `02-music-analysis` 6.1 (Muse Voice); `01-foundation` 6.2/6.3/7.

## 4. Task ownership

| Task | Owner | Status | Note |
|---|---|---|---|
| 01-foundation 1–5, 6.1 | Claude Code | done | merged |
| 01-foundation 6.2, 6.3 | — | blocked | needs OVHcloud instance + bucket; `deploy.sh` ready (Phase 8) |
| 01-foundation 7 | — | blocked | needs API keys (human) |
| 02-music-analysis 1–5, 6.2, 7–10 | Claude Code (audio-analyst) | done | merged with Phase 3 PR |
| 02-music-analysis 6.1 | — | blocked | Muse Voice: needs `META_API_KEY` + format check (P2) |
| 03-world-engine-core 1–6 | Claude Code (world-builder) | done | task 6 with Phase 4 PR |
| 03-world-engine-core 7 | — | blocked | needs a Quest 3 (human); IWER check done (07-xr-mode design.md) |
| 04-default-template 1–5 | Claude Code (world-builder) | done | merged with Phase 4 PR |
| 07-xr-mode 1–6 | Claude Code (world-builder) | done | merged with Phase 7 PR |
| 07-xr-mode 7 | — | blocked | Quest 3 check (human) |
| 05-ai-world-director 1–5 | Claude Code (ai-director) | done | merged with Phase 5 PR |
| 05-ai-world-director 7 | — | blocked | real calls need `META_API_KEY` / AWS credentials (human) |
| 06-template-store 1–6 | Claude Code | done | merged with Phase 6 PR |
| 06-template-store 7 | — | blocked | real e-mail (SMTP credentials) + public URL (human) |
| Roadmap 8.4, 8.5 | Claude Code (deploy/hardening) | done | `docs/security-review.md`, `infra/README.md` |
| Roadmap 8.1–8.3 | — | blocked | scripts + runbook ready; needs instance, domain, keys (human) |
| Roadmap 9.1, 9.2 | Claude Code (submission docs) | done | `README.md`, `KIRO_USAGE.md` |
| 08-navigation-mode 1–6 | Claude Code (world-builder) | done | branch `feature-navigation-mode`, one commit per task; PR to open |
| 05-ai-world-director 6 | Claude Code (ai-director) | done | phase 10 branch, one commit per sub-task |
| Improvements I1, I2, I3 | Claude Code (world-builder) | done | all merged (I1 PR #17) |
| Improvement I4 | Claude Code (world-builder) | done | tasks 1–5 and I4b merged (PRs #18, #19); Neon Nocturne stays the default |
| 09-template-editor 1–8 | Claude Code (world-builder) | done | branch `phase-A2-template-editor` (backlog A2), one commit per task |
| 10-template-moderation 1–6 | Claude Code | done | PR #22 `phase-A3-moderation`, one commit per task; req 4.1 closed in A4 |
| A4 design-system skill, My templates, Nemo Reef | Claude Code (world-builder) | done | branch `phase-A4-design-system`, stacked on #22 |
| 11-editable-notes 1–8, 10 | Claude Code | done | branch `phase-I9-editable-notes`, one commit per task; 8 partly (panel line list, IWER, screenshots open) |
| 11-editable-notes 9 | — | blocked | Quest 3 check (human): ray accuracy, drag comfort, tone latency |
| I10 catalog, I11 long songs, I12, I13, I14, I15, I16, I17 | Claude Code | done | merged PRs #31–#39; I14 = I8 task 4 only |
| I8 seven procedural object kinds + Living City | Claude Code | done | PR phase-I8-realistic-objects; motion wired in I8b (PR phase-I8b-object-motion) |
| I8 lighting (blob shadows, wind), IWER check | Claude Code | done | PR phase-I8c-object-lighting; 58 draw calls in IWER |
| I19-I21 polished, textured and modelled objects (12 CC0 GLB in `public/models`) (lit PBR, sky reflections, CC0 detail textures, `fx.material`) | Claude Code | done | PR phase-I19-polished-objects; report `docs/improvements/i19-polished-objects.md` |
| I39–I41 city, playlist, layouts, traffic | Claude Code | done | branch `phase-I39-living-city`, PR to open |
| 12-object-editor phase 1 (1.1–1.6) | Claude Code | done | branch `phase-I45-part-tree`; phases 2–5 todo, one commit per task |
| I8 GLB/LOD, Quest 3 check | — | blocked | human: GLB needs the sourcing decision (`docs/open-questions.md` 1–2, 12) |
| I10 R2 bucket + seed | — | blocked | human: bucket, API token, `--only` seed |
| I9 task 9, I16, I5–I7 Quest checks | — | blocked | human: Quest 3 |
| 10-template-moderation 7 | — | blocked | human: review a real hidden template on the public URL |
| Roadmap 9.3–9.5 | — | blocked | human: video, Devpost, posts; drafts in `docs/submission.md` |

## 5. Active pitfalls

The daily ones. The rest (API, web/XR, tooling): `docs/pitfalls.md`, read the group of the area you touch.

- pnpm is v12 here: offline installs need `--offline --trust-lockfile`; never interrupt a running install.
- torch / torchaudio must come from the PyTorch CPU index (`[tool.uv.sources]`); a plain PyPI torch pulls ~3 GB of
  CUDA. Disk on this laptop is ~98 % full: watch `df -h` before adding models or images.
- Generated TS (`templates/generated`) and `packages/schemas` come from `make schemas` — never edit by hand.
  zod does not re-check pydantic `model_validator`s (analysis invariants, zone bounds).
- Layout prompt: change it → bump `LAYOUT_PROMPT_VERSION` (`director/application/layout_prompt.py`).
- Director: change any prompt → bump `PROMPT_VERSION`; mock output changes → bump `MOCK_MODEL`.
  `director/infrastructure/default_template.json` must equal the web `neon-nocturne.json` (test).
- Never `docker volume prune` on the server (pgdata, storage, Let's Encrypt certificates).
- Never commit real e-mail addresses or secrets in `.env.example` or docs (the repo is public).
- Deadline: Kiroween submission **2026-12-04 14:00 PT**; demo audio must be royalty-free.

## 6. Open specs

| Spec | Status | Next task | Section to read |
|---|---|---|---|
| 01-foundation | 1–5, 6.1 done | 6.2 / 7 (blocked on credentials) | design.md § Infra |
| 02-music-analysis | 1–5, 6.2, 7–10 done | 6.1 (P2, blocked on key) | design.md § As built (Phase 3) |
| 03-world-engine-core | 1–6 done | 7 (Quest) | design.md § Rendering "As built" |
| 04-default-template | 1–5 done | — (polish P2) | design.md § As built (Phase 4) |
| 05-ai-world-director | 1–6 done | 7 (human real calls) | design.md § Human checks, § As built |
| 06-template-store | 1–6 done | 7 (human: real e-mail, public URL) | design.md § Human checks, § As built |
| 07-xr-mode | 1–6 done | 7 (Quest, human) | design.md § Human checks |
| 08-navigation-mode | 1–6 done | — (human: try it on a phone) | design.md § As built |
| 09-template-editor | 1–11 done | — (recipe editing done, phase A5) | design.md § As built |
| 10-template-moderation | 6/7 done | 7 (human: review a real hidden template) | design.md § As built |
| 12-object-editor | phase 1 done (1.1–1.6) | 2.1 inventory | tasks.md § Phase 2; design.md § As built (phase 1) |
| 11-editable-notes | 1–8, 10 done | 9 (Quest, human); VR panel line list | design.md § As built |
