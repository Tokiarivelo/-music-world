---
name: new-api-module
description: Add a bounded context or a use case to the Music World FastAPI backend with Clean Architecture layers (domain, application ports and use cases, infrastructure adapters, interfaces routers and jobs), wiring, tests and docs. Use when adding backend capabilities such as projects, templates store, accounts, or a new endpoint.
---

# New API module or use case

Rules: `.kiro/steering/architecture.md`, `api-specs.md`, `coding-standards.md`, `testing.md`.

1. **Contract first**: add or change pydantic models in `music_world/schemas/` (the shared contract) and run
   `make schemas`. Bump the schema version on breaking changes.
2. **Domain** (`<context>/domain/`): frozen dataclasses, value objects, pure domain services, `MusicWorldError`
   subclasses with stable codes. No framework imports.
3. **Ports** (`<context>/application/ports.py`): `Protocol`s for repositories and external services.
4. **Use case** (`<context>/application/use_cases/<verb_noun>.py`): one class, constructor-injected ports,
   `async def execute(self, cmd: <Cmd>) -> <Result>`; DTOs in `application/dto.py`.
5. **Adapters** (`<context>/infrastructure/`): SQLAlchemy repository (+ Alembic migration), SDK clients with
   timeouts and retries.
6. **Interfaces**: router in `<context>/interfaces/http.py` (response_model, tags, summary, error responses,
   `current_user`, ownership → 404) and/or job handler in `interfaces/jobs.py`. Register in `main.py` / `worker.py`.
7. **Wiring**: bind ports to adapters in `shared/container.py` only.
8. **Tests**: domain (Hypothesis for invariants), use case with fake ports (happy path + each error), router with
   httpx `AsyncClient` (status codes, error body, 404 ownership).
9. **Check**: `cd apps/api && uv run pytest tests -k <context> -m "not slow" && uv run mypy music_world`,
   then `bash scripts/agents/validate-architecture.sh`.
10. **Docs**: `PROJECT.md` §9 if a contract changed, `infra/.env.example` + `tech.md` for new env vars, ADR if a
    structural decision was made.
