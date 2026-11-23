---
inclusion: fileMatch
fileMatchPattern: "apps/api/**"
---

# Backend architecture (`apps/api`) — modular monolith, Clean Architecture

One FastAPI service + one arq worker, split into **bounded contexts**. Each context follows Clean Architecture:

```text
apps/api/music_world/
├── <context>/                 # analysis | director | templates | projects | accounts
│   ├── domain/                # entities, value objects, domain services, domain errors — pure Python
│   ├── application/
│   │   ├── ports.py           # Protocols: repositories, Separator, NoteTranscriber, LLMProvider, ObjectStore…
│   │   ├── use_cases/         # one class per use case, `execute(input) -> output`
│   │   └── dto.py             # pydantic input/output models of the use cases
│   ├── infrastructure/        # adapters: demucs, basic_pitch, librosa, muse, bedrock, sqlalchemy repos, s3
│   └── interfaces/
│       ├── http.py            # FastAPI router (thin: parse → use case → map errors)
│       └── jobs.py            # arq job handlers (thin: load → use case → persist progress)
├── schemas/                   # pydantic contracts shared with the web app (source of truth, exported to JSON Schema)
├── shared/                    # settings, logging, db session, errors base, DI container, clock
├── main.py                    # FastAPI app factory, router registration
└── worker.py                  # arq WorkerSettings
```

## Dependency rule

`interfaces → application → domain`, `infrastructure → application (ports) → domain`. Dependencies point inward only.

- `domain/` imports only the standard library and other `domain/` modules of the same context.
- `application/` imports `domain/`, `schemas/`, `shared/errors` — never `infrastructure/`, `interfaces/`, FastAPI,
  SQLAlchemy or SDKs.
- `infrastructure/` implements ports; it may import SDKs. It never imports `interfaces/`.
- A context never imports another context's `infrastructure/` or `interfaces/`. Cross-context calls go through the
  other context's use cases (injected) or through `schemas/` contracts.
- Wiring happens only in `shared/container.py` (composition root), chosen by settings (e.g. `LLM_PROVIDER`).

Checked by `scripts/agents/validate-architecture.sh` (hook "Architecture check").

## Patterns

| Need | Pattern |
|---|---|
| Swap Muse / Bedrock / mock | Strategy behind `LLMProvider` port + Chain of Responsibility for fallbacks |
| Analysis pipeline | Pipeline of stage ports (`Separator`, `NoteTranscriber`, `RhythmAnalyzer`, `HarmonyAnalyzer`, `LyricsTranscriber`) orchestrated by `AnalyzeProject` use case |
| Persistence | Repository per aggregate (`ProjectRepository`, `TemplateRepository`, `AnalysisRepository`) |
| Caching analyses and director results | Decorator adapter around the port (`CachedLLMProvider`, keyed by hash + provider + model + prompt version) |
| Template validation | Specification objects in `templates/domain` (size, budget, license, no external URLs) |
| Long work | arq jobs; use cases report progress through a `ProgressReporter` port |

## Jobs

- Jobs are idempotent: keyed by `(project_id, audio_hash, stage)`; rerunning skips finished stages.
- Each stage persists its output before the next starts, so a crash resumes from the last finished stage.
- Hard limits: audio ≤ 180 s, job timeout 15 min, one analysis job per CPU core.
