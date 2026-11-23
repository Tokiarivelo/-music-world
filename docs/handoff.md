# Handoff

> **Date:** 2026-11-23 · **Last updated by:** Claude Code (project setup: PROJECT.md, Kiro rules, skills, agents, hooks)
> **Format:** 6 fixed sections, **150 lines max**, rewritten at each handoff (see `.kiro/steering/handoff.md`).
> Previous sessions: `docs/handoff-archive/<YYYY-MM>.md` (not read by default).

Resume line for a new session or agent:

```text
Read docs/handoff.md and continue with the next actions.
```

## 1. Repository state

- Not a git repository yet. No application code yet (design and agent configuration only).
- Present: `PROJECT.md` (French design doc), `.kiro/` (steering, skills, agents, specs 01/02/03/05, hooks),
  `scripts/agents/validate-architecture.sh`, `KIRO_USAGE.md`, `CLAUDE.md`, `AGENTS.md`, `assets/`.
- Tests: none yet. `bash scripts/agents/validate-architecture.sh` passes (nothing to check).
- Kiro IDE 1.5.11 installed in `~/.local/share/kiro` (command `kiro`).

## 2. Last session (2026-11-23, Claude Code)

- Rewrote `PROJECT.md`: Python analysis on OVHcloud, Meta Muse models + Claude on Bedrock (switchable), IWSDK in
  Next.js, template store, default look = reference image, Kiroween 2026 plan and compliance.
- Created steering rules (single source: `.kiro/steering/rules.md`), 11 skills, 4 custom agents, 9 hooks.
- Backend = modular monolith with Clean Architecture per context; web = feature-first + pure `engine/` + `xr/`.
- Specs written: `01-foundation`, `02-music-analysis`, `03-world-engine-core` (full), `05-ai-world-director`
  (requirements only — generate design/tasks with Kiro).

## 3. Next actions

1. **Human**: request Kiro hackathon credits before **2026-12-01 12:00 PT**; `git init` + public GitHub repo.
2. `01-foundation` task 1 — repository skeleton — read `.kiro/specs/01-foundation/tasks.md` and `design.md` § Overview.
3. `01-foundation` task 2 — Next.js + IWSDK + IWER prototype — `design.md` § Web; verify IWSDK API in official docs.
4. `01-foundation` task 7 — day-1 risk checks (Muse Voice on sung vocals, Bedrock Claude access).
5. Then `02-music-analysis` (owner `audio-analyst`) and `03-world-engine-core` (owner `world-builder`) in parallel.

## 4. Task ownership

| Task | Owner | Status | Note |
|---|---|---|---|
| 01-foundation 1–7 | — | todo | |
| 02-music-analysis 1–10 | audio-analyst | todo | starts after 01 task 4 |
| 03-world-engine-core 1–7 | world-builder | todo | engine tasks 1–2 can start after 01 task 2 |
| 05-ai-world-director | ai-director | todo | generate design.md + tasks.md with Kiro first |

## 5. Active pitfalls

- IWSDK officially documents Vite only: in Next.js, no `virtual:iwsdk-project`, no auto IWER, no scene editor.
  Fallback: separate Vite app under `/world` (01 requirement 2.5).
- Meta Model API is in preview: re-verify model ids and the Muse Voice request format before coding.
- Hook file format was checked against the installed Kiro 1.5.11; if a hook does not show in the Hooks panel,
  recreate it from the UI with the same prompt.
- Deadline: Kiroween submission **2026-12-04 14:00 PT**; demo audio must be royalty-free.

## 6. Open specs

| Spec | Status | Next task | Section to read |
|---|---|---|---|
| 01-foundation | not started | 1 | design.md § Overview |
| 02-music-analysis | not started | 1 | design.md § Pipeline |
| 03-world-engine-core | not started | 1.1 | design.md § Engine |
| 05-ai-world-director | requirements only | create design + tasks | requirements.md |
| 04-default-template, 06-template-store, 07-xr-mode | to create with Kiro | — | PROJECT.md §2, §8, §7 |
