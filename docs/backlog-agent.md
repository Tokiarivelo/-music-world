# Backlog — tasks an agent can do without a human

Everything here needs no credentials, no server, no Quest and no network to a paid service. Tasks that need a human
stay in `docs/handoff.md` § 3 and `docs/roadmap.md`. Take the first free item, claim it in `docs/handoff.md` § 4,
tick it here when done. Each item names the skill or rule file to load first.

Last reviewed: 2026-11-24 (after the Makefile / Docker / env / token session).

## A. Product tasks (spec tasks)

| # | Task | Priority | Load first | Done when |
|---|---|---|---|---|
| A1 | ~~`05-ai-world-director` task 6: ShapeRecipe~~ | done 2026-11-24 (phase 10) | — | follow-ups: Quest 3 check of heavy recipes, dedicated shape-model call (see design.md § As built, task 6) |
| A2 | ~~Template editor (`09-template-editor`, 8 tasks)~~ | done 2026-11-24 (phase A2) | — | `/editor`, `PUT /api/templates/{id}`; follow-ups: recipe editing, sign-in round trip across tabs |
| A3 | **Done** (tasks 1–6, PR `phase-A3-moderation`; task 7 human): moderation queue, spec `10-template-moderation` | P2 | skill `new-api-module` + `new-web-feature` | tasks ticked |
| A4 | ~~Fix the stale navigation-PR line in `docs/handoff.md`~~ | done 2026-11-24 | — | done |

## B. Quality, security and performance tasks

| # | Task | Load first | Done when |
|---|---|---|---|
| B1 | ~~Dependency audits~~ | done 2026-11-24 (phase 12) | — | `pip-audit` and `pnpm audit --prod`: no known vulnerabilities (torch/torchaudio CPU wheels not auditable); recorded in `docs/security-review.md`; repeat before 2026-12-04 |
| B2 | ~~pytest-xdist~~ | done 2026-11-24 (phase 12) | — | `make test-api` uses `-n 4` (`PYTEST_WORKERS`, 0 = serial): 34 s → 25 s alone, 5 runs without a flaky test. Inside `make -j3 check` the web tests compete for the CPU: no gain there (≈ 60 s). The floor is collection (3.3 s per worker) plus two 9 s property tests |
| B3 | ~~Lazy-load heavy API imports~~ | done 2026-11-24 (phase 11) | — | boto3 is now imported only when S3 is configured (−0.3 s cumulative); the rest of the 1.1 s is FastAPI 0.8 s and SQLAlchemy 0.36 s, not avoidable, so the < 0.6 s goal is dropped |
| B4 | Caching headers in Caddy for `/demo/*` (MP3 922 KB, analysis JSON) and a `Cache-Control: immutable` check on `/_next/static/*`; validate with `docker run caddy caddy validate` | `infrastructure.md` | headers verified with `curl -kI` against `make dev` |
| B5 | ~~Bundle budget guard~~ | done 2026-11-24 (phase 11) | — | `apps/web/scripts/check-bundle.mjs`: light pages must not load the engine chunk, ≤ 900 KB JS; run by `make bundle-check` and by the web Dockerfile after `next build` |
| B6 | ~~Trim handoff pitfalls~~ | done 2026-11-24 (phase 11) | — | handoff 11.3 KB → 8.2 KB; 34 pitfalls moved to `docs/pitfalls.md`, 6 daily ones stay |
| B7 | ~~`make prune` and `make clean` once~~ | done 2026-11-24 (phase 11) | — | disk 89 % (27 GB free); `prune` reclaimed 0 B (nothing dangling); `clean` removed `apps/web/.next` (700 MB). The 4.2 GB of reclaimable images belong to other projects: left alone |

## C. Documentation and tooling

| # | Task | Done when |
|---|---|---|
| C1 | ~~KIRO_USAGE.md setup section~~ | done 2026-11-24 (phase 11) |
| C2 | ~~Smoke test of the local stack~~ | done 2026-11-24: `make smoke` (`UP=1` starts the stack first) |
| C3 | ~~Verify the Dockerfile weights layer is reused~~ | done 2026-11-24 (phase 12): after a one-line code change the dependency layer and the Demucs weights layer are `CACHED`; only `COPY apps/api` and the project install rebuilt (≈ 5 s). A lock-file change rebuilds both (≈ 3 min with the uv cache mount) |

## Not here (needs a human)

Kiro credits, OVHcloud instance and domain, `META_API_KEY`, AWS Bedrock, SMTP, Quest 3 checks, video, Devpost form,
posts. See `docs/handoff.md` § 3.
