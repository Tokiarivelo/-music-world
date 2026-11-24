# Backlog — tasks an agent can do without a human

Everything here needs no credentials, no server, no Quest and no network to a paid service. Tasks that need a human
stay in `docs/handoff.md` § 3 and `docs/roadmap.md`. Take the first free item, claim it in `docs/handoff.md` § 4,
tick it here when done. Each item names the skill or rule file to load first.

Last reviewed: 2026-11-24 (after the Makefile / Docker / env / token session).

## A. Product tasks (spec tasks)

| # | Task | Priority | Load first | Done when |
|---|---|---|---|---|
| A1 | ~~`05-ai-world-director` task 6: ShapeRecipe~~ | done 2026-11-24 (phase 10) | — | follow-ups: Quest 3 check of heavy recipes, dedicated shape-model call (see design.md § As built, task 6) |
| A2 | Template editor in the web app (edit a template's zones and colours, validate with the zod schema, publish through the existing store API) | P2, no spec yet | skill `new-web-feature`; create a spec first | spec `09-template-editor` with tasks, then tasks ticked |
| A3 | Review UI for hidden templates (reports ≥ `TEMPLATE_REPORT_HIDE_THRESHOLD`) | P2, no spec yet | skill `new-api-module` + `new-web-feature` | spec, endpoints with auth, page, tests |
| A4 | ~~Fix the stale navigation-PR line in `docs/handoff.md`~~ | done 2026-11-24 | — | done |

## B. Quality, security and performance tasks

| # | Task | Load first | Done when |
|---|---|---|---|
| B1 | `uvx pip-audit` and `pnpm audit --prod` (needs network to the advisory databases only) | `docs/security-review.md` | results recorded there, fixes or accepted risks listed |
| B2 | Add `pytest-xdist` and make `test-api` run with `-n auto` (measured: 30 s serial, 8 cores available) | `docs/optimization.md` § Tests | `make check-api` faster, no flaky test across 5 runs (needs network once for `uv add --dev pytest-xdist`) |
| B3 | ~~Lazy-load heavy API imports~~ | done 2026-11-24 (phase 11) | — | boto3 is now imported only when S3 is configured (−0.3 s cumulative); the rest of the 1.1 s is FastAPI 0.8 s and SQLAlchemy 0.36 s, not avoidable, so the < 0.6 s goal is dropped |
| B4 | Caching headers in Caddy for `/demo/*` (MP3 922 KB, analysis JSON) and a `Cache-Control: immutable` check on `/_next/static/*`; validate with `docker run caddy caddy validate` | `infrastructure.md` | headers verified with `curl -kI` against `make dev` |
| B5 | ~~Bundle budget guard~~ | done 2026-11-24 (phase 11) | — | `apps/web/scripts/check-bundle.mjs`: light pages must not load the engine chunk, ≤ 900 KB JS; run by `make bundle-check` and by the web Dockerfile after `next build` |
| B6 | ~~Trim handoff pitfalls~~ | done 2026-11-24 (phase 11) | — | handoff 11.3 KB → 8.2 KB; 34 pitfalls moved to `docs/pitfalls.md`, 6 daily ones stay |
| B7 | Run `make prune` and `make clean` once on this laptop (disk is 97 % full) and record what was freed | Makefile | `make disk` before/after in the handoff |

## C. Documentation and tooling

| # | Task | Done when |
|---|---|---|
| C1 | ~~KIRO_USAGE.md setup section~~ | done 2026-11-24 (phase 11) |
| C2 | ~~Smoke test of the local stack~~ | done 2026-11-24: `make smoke` (`UP=1` starts the stack first) |
| C3 | Verify the new Dockerfile layer order really avoids the Demucs download on a code-only change (needs network once, ~15 min, ~6 GB disk: free space first with `make prune`) | two consecutive `make build` runs, the second reuses the weights layer |

## Not here (needs a human)

Kiro credits, OVHcloud instance and domain, `META_API_KEY`, AWS Bedrock, SMTP, Quest 3 checks, video, Devpost form,
posts. See `docs/handoff.md` § 3.
