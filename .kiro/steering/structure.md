---
inclusion: always
---

# Repository structure and conventions

pnpm workspace (web + packages) and a uv-managed Python project (api), driven by a root `Makefile`.

```text
music-world/
├── .kiro/                    # steering (rules), skills, agents, specs, hooks — committed, never git-ignored
├── .claude/skills → ../.kiro/skills   # symlink: Claude Code uses the same skills
├── CLAUDE.md · AGENTS.md     # pointers to .kiro/steering/rules.md only
├── apps/
│   ├── web/                  # Next.js + IWSDK — details in frontend.md
│   │   └── src/{app,features,engine,xr,templates,lib}
│   └── api/                  # FastAPI + arq worker — details in architecture.md
│       ├── music_world/{analysis,director,templates,projects,accounts,schemas,shared}
│       └── tests/{unit,integration,fixtures}
├── packages/schemas/         # JSON Schema exported from pydantic + generated TS types
├── infra/                    # docker-compose.yml, docker/*.Dockerfile, Caddyfile, deploy.sh, .env.example
├── scripts/agents/           # agent helper scripts (validate-architecture.sh, …)
├── docs/
│   ├── handoff.md            # current handoff (≤ 150 lines) — see handoff.md rule
│   ├── handoff-archive/      # past sessions by month — not read by default
│   └── decisions/            # ADRs
├── assets/                   # reference image (default look)
├── PROJECT.md                # design document (French)
├── KIRO_USAGE.md             # how Kiro was used (hackathon write-up)
├── README.md                 # English, for judges
└── LICENSE                   # MIT
```

## Conventions

- `apps/web/src/engine/` is framework-free: no `three`, no React, no IWSDK, no DOM, no timers, no `Math.random`.
- Schemas: edit pydantic models in `apps/api/music_world/schemas/`, then `make schemas` regenerates
  `packages/schemas` and `apps/web/src/templates/generated`. Never hand-edit generated files (`GENERATED` header).
- Schema ids are versioned: `music-world.<name>.v<N>`; breaking changes bump `N`.
- Units: time in seconds (`float`) from song start; MIDI pitch integer 0–127; velocity 0–1; world units in metres.
- IDs: `n_<index>` notes, `c_<index>` chords, kebab-case template ids, UUIDv7 for database rows.
- File names: kebab-case `.ts`/`.tsx` (components PascalCase file = component name), snake_case Python modules.
- Path alias `@/` → `apps/web/src/`.
- Prompts: `apps/api/music_world/director/infrastructure/prompts/` with a `PROMPT_VERSION` constant.
