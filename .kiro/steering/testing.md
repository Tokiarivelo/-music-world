---
inclusion: fileMatch
fileMatchPattern: ["**/*.test.ts", "**/*.test.tsx", "**/tests/**", "**/__tests__/**", "apps/web/src/engine/**"]
---

# Testing

| Area | Tool | Required |
|---|---|---|
| `apps/web/src/engine` | Vitest + **fast-check** | Property tests: determinism, seek equivalence, monotonic spawn count, budget, bounds |
| `apps/web/src/features` | Vitest + Testing Library | Hooks and components with behaviour |
| `apps/web/src/xr` | Vitest (pure helpers) + manual `xr-verify` skill | Recipe builder triangle counts; mount/unmount smoke test |
| `apps/api/*/domain` | pytest + **Hypothesis** | Invariants (notes sorted, chords overlap, template specifications) |
| `apps/api/*/application` | pytest with fake ports | Every use case, including fallback paths |
| `apps/api/*/infrastructure` | pytest, marked `@pytest.mark.slow` when using real models | Adapters on short fixtures (≤ 10 s audio) |
| `apps/api/*/interfaces` | pytest + httpx `AsyncClient` | Status codes, error body, ownership 404 |
| Director | pytest + Hypothesis | Any JSON from a provider is either rejected or a renderable template |

## Rules

- While working, run only the tests of the touched area; run the full suite once at the end of a spec task group.
- Never weaken, skip or delete a property test to make a change pass: fix the code or update the spec first.
- Tests never call real LLM APIs or the network; use the `mock` provider and recorded fixtures.
- Fixtures: royalty-free or self-made audio only, ≤ 2 MB, in `apps/api/tests/fixtures/`.
- Record property-test findings (bugs caught) in `KIRO_USAGE.md` — they are part of the hackathon write-up.

## Commands

- Web: `pnpm -C apps/web exec vitest run <path>` · typecheck `pnpm -C apps/web typecheck`
- API: `cd apps/api && uv run pytest <path> -m "not slow"` · types `uv run mypy music_world`
- All: `make test`, `make check` (lint + types + tests + architecture check)
