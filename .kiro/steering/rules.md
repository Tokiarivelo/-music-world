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

1. **Start**: run the `start` skill (read `docs/handoff.md`, `git status --short`, take the first next action).
2. **One spec task at a time**: tasks come from `.kiro/specs/<spec>/tasks.md`. Read only the requirement and design
   sections the task cites.
3. **Implement** following the rule files of the touched area.
4. **Test** the touched area (see `testing.md`); all tests must pass before the task is ticked.
5. **Document** in the same change (see `documentation.md`).
6. **Tick** the task in `tasks.md`; commit `<spec>: <task number> <summary>` only when the user asks for commits.
7. **Handoff**: run the `handoff` skill before stopping or switching agent.

## Absolute rules (summary — details in `tech.md`)

- Algorithms detect notes; LLMs only interpret. LLM output and templates are **data**, validated, never executed.
- No LLM call in the playback loop. The audio clock is the only time source. `worldStateAt(plan, t)` is pure.
- Secrets stay server-side. Never commit `.env`. Never log full lyrics.
- No GPL/AGPL dependency (repo is MIT). `.kiro/` is never git-ignored.
- All repository text (code, comments, docs for judges, commit messages) is in **English**. `PROJECT.md` stays French.
- Read large files by search + range, never whole. Do not open `docs/handoff-archive/` unless a task needs history.
