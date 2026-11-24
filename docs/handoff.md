# Handoff

> **Date:** 2026-11-24 · **Last updated by:** Claude Code (phase I1 back to upload)
> **Format:** 6 fixed sections, **150 lines max**, rewritten at each handoff (see `.kiro/steering/handoff.md`).
> Previous sessions: `docs/handoff-archive/<YYYY-MM>.md` (not read by default).

Resume line for a new session or agent:

```text
Read docs/handoff.md and continue with the next actions.
```

## 1. Repository state

- Phase 9 docs worked on branch `phase-9-submission` (one commit per roadmap task: 9.1, 9.2, 9.3–9.5 drafts, + this
  handoff), merged into `main` through the PR "Phase 9: submission docs". Work from `main`.
  Push with gh credentials: `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin <branch>`.
- `08-navigation-mode` is merged (PR #9).
- Phases I3 (PR #15) and I2 (PR #16) are merged. Phase I1 is on branch `phase-I1-back-to-upload` (3 commits, not
  pushed or merged; PR to open). Last commit `974b2e8`.
- `make check` green: web vitest 273 passed (51 files), eslint, tsc, architecture checks clean (API untouched,
  313 passed last run).
- No server left running. A `music-world` Compose stack (old images, predates Phase 6) and another project's
  containers (`angaly_*`) may be running — not started by these sessions; leave them alone.
- **Nothing is deployed**: no OVHcloud instance, domain, bucket or `infra/.env` exists yet. The repo is public.

## 2. Last session (2026-11-24, Claude Code, phase I1 back to upload)

- I2 merged (PR #16). Branch `phase-I1-back-to-upload` (3 commits, one per task; not pushed or merged, PR to open).
- `features/navigation/SiteNav`: labelled `<nav>` with Home, New song (`/upload`), Templates; menu button below `sm`.
  Labels are `common` keys `nav*` in `en`, `fr`, `mg`. Placed at the top of the top-left stack of both play pages.
- `scripts/play-layout.mjs` (needs `next dev` on 3125, `MW_ANGLE=vulkan`): no overlap with controls, language switch
  and player bar at 1280×720 and 390×844. It caught a real bug (full-width nav covered the language switch): `w-fit`.
- Tests: `SiteNav.test.tsx`, `WorldCanvas.test.tsx` (dispose once, one world per mount), audio stops on unmount.
- Not done: req 7 (`beforeunload`) waits for spec 09; no Quest check. Details: `docs/improvements/i1-back-to-upload.md`.
- Next improvement in the plan order: I4 (brighter scene, random colors). I3 open items: VR glyph atlas for accents,
  fr/mg screenshots and native review, `PROJECT.md` §7.

## 3. Next actions

Plan, priorities and dates: `docs/roadmap.md` (read only the current phase). Submission deadline **2026-12-04 14:00 PT**.

1. **Human** — roadmap Phase 0: Kiro credits request (before **2026-12-01 12:00 PT**), OVHcloud instance + bucket,
   `META_API_KEY`, AWS Bedrock access. A new demo song is optional: put the MP3 in `apps/web/public/demo/`, run
   `cd apps/api && uv run python scripts/analyze_file.py <mp3> <json>`, replace
   `features/player/demo/neon-nocturne.analysis.json` (+ title/url in `demo-song.ts`) **and `DEMO_AUDIO_HASH` in
   `apps/api/music_world/director/domain/demo.py`**; tests check both hashes.
2. **Human** — roadmap 8.1–8.3 deploy, exact steps in `infra/README.md` § Deploy (`DRY_RUN=1` first, then
   `DEPLOY_HOST=ubuntu@<ip> DEPLOY_DOMAIN=<domain> make deploy`), verify per skill `deploy-ovh` § Verify incl. Quest
   Browser Enter VR, install the cron file, run one backup. Then replace `TODO(deploy)` in `README.md` and
   `docs/submission.md` with the public URL.
3. **Human** — checks on the public URL: `06-template-store` task 7 (real e-mail, cross-user), `05-ai-world-director`
   task 7 (real Muse / Bedrock; if Muse rejects `response_format` json_schema, drop it in `providers/muse.py`),
   `07-xr-mode` task 7 on a Quest 3 (`07-xr-mode/design.md` § Human checks) then tick `03-world-engine-core` task 7.
   Update README § Known limitations once done.
4. **Human** — roadmap 9.3 video, 9.4 Devpost form, 9.5 posts from the drafts in `docs/submission.md` (checklist at
   its top). Run `uvx pip-audit` / `pnpm audit --prod` once before submitting.
5. Agent-only: I4 tasks 2–5 (`docs/improvements/i4-random-scene-colors.md`), branch `phase-I4-random-scene-colors`.
6. Agent-only tasks (no human, no credentials): `docs/backlog-agent.md` (A: product, B: quality and perf, C: docs).
   Optional: `05-ai-world-director` task 6 (ShapeRecipe, P2); a template editor; review UI for hidden templates;
   `02-music-analysis` 6.1 (Muse Voice); `01-foundation` 6.2/6.3/7.

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
| Improvement I4 | Claude Code (world-builder) | in progress | branch `phase-I4-random-scene-colors`; task 1 done (`xr/palette-generator.ts`), next task 2 |
| Roadmap 9.3–9.5 | — | blocked | human: video, Devpost, posts; drafts in `docs/submission.md` |

## 5. Active pitfalls

The daily ones. The rest (API, web/XR, tooling): `docs/pitfalls.md`, read the group of the area you touch.

- pnpm is v12 here: offline installs need `--offline --trust-lockfile`; never interrupt a running install.
- torch / torchaudio must come from the PyTorch CPU index (`[tool.uv.sources]`); a plain PyPI torch pulls ~3 GB of
  CUDA. Disk on this laptop is ~98 % full: watch `df -h` before adding models or images.
- Generated TS (`templates/generated`) and `packages/schemas` come from `make schemas` — never edit by hand.
  zod does not re-check pydantic `model_validator`s (analysis invariants, zone bounds).
- Director: change any prompt → bump `PROMPT_VERSION`; mock output changes → bump `MOCK_MODEL`.
  `director/infrastructure/default_template.json` must equal the web `neon-nocturne.json` (test).
- Never `docker volume prune` on the server (pgdata, storage, Let's Encrypt certificates).
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
| 09-template-editor | spec written, 0/8 | 1 (`PUT /api/templates/{id}`) | design.md § API addition |
| 10-template-moderation | spec written, 0/7 | 1 (`MODERATOR_EMAILS`, session field) | design.md § Moderator check |
