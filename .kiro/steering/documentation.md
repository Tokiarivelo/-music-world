---
inclusion: always
---

# Documentation maintenance (mandatory)

Every change that affects behaviour, architecture, contracts, infrastructure or the workflow updates its docs **in
the same change**. Edit the existing file; never create a duplicate.

| Change | Update |
|---|---|
| Requirement or design change during a task | the spec's `requirements.md` / `design.md` (and note the deviation in the handoff) |
| New or changed schema (`music-world.*.vN`) | `PROJECT.md` §9 (contracts) · regenerate with `make schemas` |
| New env variable | `infra/.env.example` · `tech.md` (env table) · `README.md` (setup) |
| New service, port, compose or Caddy change | `infrastructure.md` · `README.md` (run/deploy) |
| New LLM model id, provider or prompt version | `ai-models.md` · `PROJECT.md` §5 |
| New shape kind, recipe op or template field | `PROJECT.md` §6 / §8 · default template · `world-template` skill if the checklist changes |
| New rule, skill, hook or custom agent | `rules.md` tables · `KIRO_USAGE.md` (setup section) |
| Architectural decision | `docs/decisions/NNN-short-title.md` (ADR, format below) |
| Anything a judge needs to run or test | `README.md` (English) |

## ADR format (`docs/decisions/NNN-title.md`)

```markdown
# NNN. Short title
**Date:** YYYY-MM-DD · **Status:** Accepted | Superseded by NNN
## Context
## Decision
## Consequences
```

## Rules

- Keep tables complete (a new env var appears in every table that lists env vars).
- Code examples in docs must match the code; rename everywhere when a command or path changes.
- Update the `Last updated` line of `PROJECT.md` when it changes.
