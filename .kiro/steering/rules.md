---
inclusion: always
---

# Music World — Agent rules (single source of truth)

Every agent (Kiro, Claude Code, Codex, Cursor, Gemini…) follows this file. `CLAUDE.md` and `AGENTS.md` only point
here. Never copy these rules elsewhere: edit `.kiro/` instead.

## Rule files

| File | Inclusion | Governs |
|---|---|---|
| `product.md` | always | Vision, default look, MVP scope, product rules |
| `tech.md` | always | Stack, non-negotiable engineering rules, LLM providers, perf budget |
| `env.md` | fileMatch `settings.py`, `.env.example`, `infra/**` | Core and accounts environment variables, which `.env.example` file gets what |
| `structure.md` | always | Monorepo layout, naming, schema pipeline |
| `coding-standards.md` | always | TypeScript and Python standards, errors, logging, security |
| `handoff.md` | always | Session start/end, handoff between agents, task ownership |
| `documentation.md` | always | Which doc to update for which change |
| `architecture.md` | fileMatch `apps/api/**` | Backend Clean Architecture, ports and adapters, jobs |
| `api-specs.md` | fileMatch `apps/api/music_world/*/interfaces/**` | FastAPI routes, errors, auth, uploads |
| `frontend.md` | fileMatch `apps/web/src/**` | Feature-first web structure, thin pages, state, UI |
| `xr-iwsdk.md` | fileMatch `apps/web/src/xr/**` | IWSDK / WebXR / Quest |
| `ai-models.md` | fileMatch `apps/api/music_world/director/**` | Muse / Bedrock / mock director |
| `testing.md` | fileMatch tests | Unit, property-based and end-to-end tests |
| `infrastructure.md` | fileMatch `infra/**` | Docker Compose, Caddy, OVHcloud deployment |

Agents that do not load steering automatically must read the always-included files above, then the file-match file
for the area they touch.

## Skills (`.kiro/skills/`, also visible to Claude Code through `.claude/skills`)

| Skill | Use when |
|---|---|
| `start` | Beginning of every session, after a context reset, "what's next?" |
| `handoff` | End of session, context at ~70–80 %, change of agent |
| `design-system` | Before building or restyling any web UI: tokens, layout, component recipes, a11y, i18n |
| `new-web-feature` | Adding a feature under `apps/web/src/features/` |
| `new-api-module` | Adding a backend bounded context or use case |
| `analysis-stage` | Adding or changing a music analysis stage |
| `llm-provider` | Adding or changing an LLM provider, prompts or the fallback chain |
| `shape-kind` | Adding a 3D shape kind or a ShapeRecipe op end to end |
| `world-template` | Creating or checking a world template (incl. default look fidelity) |
| `xr-verify` | Verifying any XR change in IWER and on a Quest, perf budget |
| `deploy-ovh` | Deploying to the OVHcloud instance |
| `review-change` | Reviewing a change before commit or PR |

## Custom agents (`.kiro/agents/`)

`audio-analyst` (Python analysis), `world-builder` (engine + XR), `ai-director` (LLM providers and prompts),
`reviewer` (read-only review). Delegate a task to the agent that owns its area; record ownership in `docs/handoff.md`.

## Workflow (every task)

Master plan and priorities (P0/P1/P2, cut line, token rules): `docs/roadmap.md` — read only the current phase.

1. **Start**: run the `start` skill (read `docs/handoff.md`, `git status --short`, take the first next action).
2. **One spec task at a time**: tasks come from `.kiro/specs/<spec>/tasks.md`. Read only the requirement and design
   sections the task cites.
3. **Implement** following the rule files of the touched area.
4. **Test** the touched area (see `testing.md`); all tests must pass before the task is ticked.
5. **Document** in the same change (see `documentation.md`).
6. **Tick** the task in `tasks.md`, then commit it right away without asking: one commit per task
   (`<spec>: <task number> <summary>`) on the phase branch (`phase-<id>-<slug>`, from the latest `main`; never commit on
   `main`). Commit everything that belongs to the change, always. If GPG signing fails, use
   `git -c commit.gpgsign=false commit`.
   When the last task of the phase is committed and tests pass, push the branch, open a PR to `main` and merge it (merge commit) without asking, then start the next phase
   (push command in `docs/handoff.md` § 1). A question that needs a human goes into `docs/open-questions.md` with the
   default applied, to be evaluated at the end; do not stop for it. If a commit is refused for signing, use the unsigned form above.
7. **Handoff**: run the `handoff` skill before stopping or switching agent.

## Absolute rules (summary — details in `tech.md`)

- Algorithms detect notes; LLMs only interpret. LLM output and templates are **data**, validated, never executed.
- No LLM call in the playback loop. The audio clock is the only time source. `worldStateAt(plan, t)` is pure.
- Secrets stay server-side. Never commit `.env`. Never log full lyrics.
- No GPL/AGPL dependency (repo is MIT). `.kiro/` is never git-ignored.
- All repository text (code, comments, docs for judges, commit messages) is in **English**. `PROJECT.md` stays French.
- Commits, PRs, issues and review comments never mention Claude, Claude Code or any AI agent: no
  `Co-Authored-By` trailer, no "Generated with" line, no agent attribution of any kind.
- Token budget (`docs/token-budget.md`): search then read a range, run only the touched tests, never open generated files,
  lockfiles or `docs/handoff-archive/`, edit instead of rewriting a file, `/clear` between tasks.
- **Never read** (every agent): `node_modules`, `.venv`, `.next`, `.data`, `docs/handoff-archive/`, lockfiles
  (`pnpm-lock.yaml`, `uv.lock`), generated files (`packages/schemas/*.schema.json`, `templates/generated/`,
  `bravura-outlines.ts`), the demo analysis JSON files, audio/font binaries, `.env` files. Read the source instead
  (pydantic models, scripts). Enforced by `.claude/settings.json` (Claude Code) and `.cursorignore`, `.geminiignore`,
  `.codeiumignore`, `.aiderignore`; Codex, Kiro and others follow this rule. Keep all of them identical.
- Read large files by search + range, never whole. Do not open `docs/handoff-archive/` unless a task needs history.
