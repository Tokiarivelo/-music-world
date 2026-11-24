# Handoff

> **Date:** 2026-11-24 · **Last updated by:** Claude Code (phase A4 design system, My templates, Nemo Reef)
> **Format:** 6 fixed sections, **150 lines max**, rewritten at each handoff (see `.kiro/steering/handoff.md`).
> Previous sessions: `docs/handoff-archive/<YYYY-MM>.md` (not read by default).

Resume line for a new session or agent:

```text
Read docs/handoff.md and continue with the next actions.
```

## 1. Repository state

- Work from `main`. Push with gh credentials:
  `git -c credential.helper= -c 'credential.helper=!gh auth git-credential' push origin <branch>`.
- Merged: phase 9 docs, `08-navigation-mode` (PR #9), I1–I4b (PRs #15–#19), A2 template editor (PR #21 line).
  Open PRs: #22 `phase-A3-moderation` (spec 10, tasks 1–6) and, stacked on it, `phase-A4-design-system`.
- Checks at the end of A3: web vitest 348 passed, API 354 passed, ruff / mypy / tsc / eslint clean.
- No server left running. A `music-world` Compose stack (old images, predates Phase 6) and another project's
  containers (`angaly_*`) may be running — not started by these sessions; leave them alone.
- **Nothing is deployed**: no OVHcloud instance, domain, bucket or `infra/.env` exists yet. The repo is public.

## 2. Last session (2026-11-24, Claude Code, phases A3 and A4)

- A3 `10-template-moderation` 1–6 on `phase-A3-moderation`: `MODERATOR_EMAILS`, session `moderator`, migration `0005`,
  `/api/moderation/*`, web `/moderation`. Rules changed: commit every task and open the PR at the end of a phase
  without asking (`rules.md` step 6).
- A4 on `phase-A4-design-system`: skill `design-system` (tokens and class recipes; read it before any UI change; wired
  into `rules.md`, `frontend.md`, `new-web-feature`); `MyTemplates` on `/templates` with the "Hidden after reports,
  under review" label (requirement 4.1 closed); launch template **Nemo Reef** (`featured/nemo-reef.json`, store id
  `…0002`, listed after Kiroween Pumpkin Night).
- A personal e-mail was committed in `apps/api/.env.example` by mistake (`062da9c`) and emptied in the next commit; it
  stays in that branch's history. Never put real e-mails in tracked files: set `MODERATOR_EMAILS` in `infra/.env`.
- Previous session (phase A2): `09-template-editor` 1–8 (`/editor`, `PUT /api/templates/{id}`); not done: recipe
  editing, Quest check of the editor page. Screenshots: `docs/template-editor/`.

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
   `docs/submission.md` with the public URL. Add `MODERATOR_EMAILS=` (your address) to `infra/.env` first.
3. **Human** — checks on the public URL: `06-template-store` task 7 (real e-mail, cross-user), `05-ai-world-director`
   task 7 (real Muse / Bedrock; if Muse rejects `response_format` json_schema, drop it in `providers/muse.py`),
   `07-xr-mode` task 7 on a Quest 3 (`07-xr-mode/design.md` § Human checks) then tick `03-world-engine-core` task 7,
   `10-template-moderation` task 7 (review one real hidden template).
   Update README § Known limitations once done.
4. **Human** — roadmap 9.3 video, 9.4 Devpost form, 9.5 posts from the drafts in `docs/submission.md` (checklist at
   its top). Run `uvx pip-audit` / `pnpm audit --prod` once before submitting.
5. Agent-only tasks (no human, no credentials): `docs/backlog-agent.md` — next free: B4 (Caddy cache headers).
   Optional: recipe editing in the template editor; `02-music-analysis` 6.1 (Muse Voice); `01-foundation` 6.2/6.3/7.

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
| 10-template-moderation 7 | — | blocked | human: review a real hidden template on the public URL |
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
| 09-template-editor | 1–8 done | — (follow-up: recipe editing) | design.md § As built |
| 10-template-moderation | 6/7 done | 7 (human: review a real hidden template) | design.md § As built |
