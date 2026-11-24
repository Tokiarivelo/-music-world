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
| B3 | Lazy-load heavy API imports (`music_world.main` imports in 1.1 s: `shared/container.py` 0.59 s, `accounts.interfaces.http` 0.7 s; find the heavy third-party import with `python -X importtime`) | `docs/optimization.md` § API | `import music_world.main` < 0.6 s, tests green |
| B4 | Caching headers in Caddy for `/demo/*` (MP3 922 KB, analysis JSON) and a `Cache-Control: immutable` check on `/_next/static/*`; validate with `docker run caddy caddy validate` | `infrastructure.md` | headers verified with `curl -kI` against `make dev` |
| B5 | Budget test on the web bundle: fail `make check` if a non-play route loads the IWSDK chunk (6 MB, 1.5 MB gzip) | `frontend.md` | script in `apps/web/scripts/`, wired into `make check-web` |
| B6 | Trim `docs/handoff.md` § 5 "Active pitfalls" (4 KB read every session): keep only the ones that bite daily, move the rest next to the code they concern | `docs/token-budget.md` | handoff ≤ 100 lines, no information lost (moved, not deleted) |
| B7 | Run `make prune` and `make clean` once on this laptop (disk is 97 % full) and record what was freed | Makefile | `make disk` before/after in the handoff |

## C. Documentation and tooling

| # | Task | Done when |
|---|---|---|
| C1 | Update `KIRO_USAGE.md` (setup section) with the new `.claude/settings.json`, `env.md` and Makefile targets | section updated |
| C2 | A `make dev` smoke test script (`infra/scripts/smoke-dev.sh`: up, wait healthy, curl `/api/health` and `/play/demo`, down) for CI-less verification | script + Makefile target `smoke` |
| C3 | Verify the new Dockerfile layer order really avoids the Demucs download on a code-only change (needs network once, ~15 min, ~6 GB disk: free space first with `make prune`) | two consecutive `make build` runs, the second reuses the weights layer |

## Not here (needs a human)

Kiro credits, OVHcloud instance and domain, `META_API_KEY`, AWS Bedrock, SMTP, Quest 3 checks, video, Devpost form,
posts. See `docs/handoff.md` § 3.
