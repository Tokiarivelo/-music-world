# Roadmap — Music World (Kiroween 2026)

> Deadline: **2026-12-04 14:00 PT** (submission). Today: 2026-11-23. Last updated: 2026-11-23.
> This file is the master plan. Detailed acceptance criteria live in `.kiro/specs/<spec>/`. Current position and
> ownership live in `docs/handoff.md`. Read **only the phase you work on** (search `^## Phase`).

## Priorities

| Priority | Meaning | Rule |
|---|---|---|
| **P0** | Required to submit a working, judged project | Never start P1 while a P0 of the same phase is open |
| **P1** | Makes the demo strong (AI director, store, VR polish) | Start only when the P0 path is green |
| **P2** | Bonus | Only if ahead of schedule; first to cut |

**Cut line:** if on **Dec 1** P0 phases 1–4 are not done, drop all P2 and keep P1 to the director only.
On **Dec 3**, freeze features: only fixes, deployment, video and write-up.

## Critical path (P0)

```text
0 Admin ─► 1 Foundation ─┬─► 2 Engine core (with fixture data) ─► 4 Default look ─┐
                         └─► 3 Analysis ─────────────────────────────────────────┼─► 8 Deploy ─► 9 Submit
                                                                    7a Enter VR ─┘
```
Phases 2 and 3 run in parallel: the engine uses a hand-made `AnalysisResult` fixture, so it never waits for Python.

## Schedule

| Date | Phases |
|---|---|
| Nov 23–24 | 0, 1 |
| Nov 25–27 | 2 ∥ 3 |
| Nov 28 | 4, 7a |
| Nov 29–30 | 5 (P1), 6 (P1) |
| Dec 1 | 7b, 8 · **cut-line check** · credits request deadline 12:00 PT |
| Dec 2 | 8 hardening, P2 if ahead |
| Dec 3 | **feature freeze** · 9 video + write-up |
| Dec 4 | 9 submit before 14:00 PT (target: morning, Madagascar evening of Dec 3) |

---

## Phase 0 — Admin (human, P0)

| # | Task | Done when |
|---|---|---|
| 0.1 | Devpost profile name = ID document name | checked |
| 0.2 | Request Kiro credits (Kiro user ID) — **before Dec 1 12:00 PT** | form sent |
| 0.3 | Redeem the credit code as soon as received — **before Dec 4** | "kiroween" credits visible in app.kiro.dev |
| 0.4 | Rename repo `-music-world` → `music-world`, add topics | repo page OK |
| 0.5 | OVHcloud instance (CPU, ≥ 8 vCPU, 16–32 GB) + domain/subdomain + Object Storage bucket | SSH works, DNS points to it |
| 0.6 | Meta Model API key; AWS account with Bedrock Claude access (P1) | keys stored in a password manager |
| 0.7 | Royalty-free or self-composed demo song (≤ 3 min) + its license proof | file in a private folder |

## Phase 1 — Foundation (spec `01-foundation`, P0, owner: any)

| # | Task | Spec task | Done when |
|---|---|---|---|
| 1.1 | Monorepo skeleton, Makefile, schemas pipeline stub | 1, 5 | `make check` runs |
| 1.2 | Next.js + IWSDK cube + IWER, Enter VR in emulator | 2.1–2.4 | cube visible, VR in IWER |
| 1.3 | Audio player + clock with property tests | 3.1–3.2 | tests green |
| 1.4 | FastAPI + arq worker + `/api/health` + jobs | 4.1–4.2 | tests green |
| 1.5 | Docker Compose + Caddy locally | 6.1 | `https://localhost/api/health` |
| 1.6 | **Risk checks**: Muse Voice on 30 s sung vocal; Bedrock access | 7 | results in handoff |
| 1.7 | Hand-made fixture `AnalysisResult` (≈ 60 notes, 8 chords) for the engine | — | `apps/web/src/engine/__fixtures__/demo-analysis.json` validates |

Fallback: if 1.2 fails after 2 attempts → Vite IWSDK app under `/world` (requirement 2.5). Do not keep debugging.

## Phase 2 — World engine core (spec `03-world-engine-core`, P0, owner: `world-builder`)

| # | Task | Spec task | Done when |
|---|---|---|---|
| 2.1 | `prng`, `mapping`, `layout` + property tests | 1.1–1.3 | green |
| 2.2 | `buildSpawnPlan`, `worldStateAt` + determinism/seek/monotonic/budget properties | 2.1–2.3 | green |
| 2.3 | Default template JSON (`neon-nocturne`) | 3 | validates |
| 2.4 | Systems: terrain, staff + notes (Bravura), structures (InstancedMesh), fx | 4.1–4.4 | fixture plays in sync |
| 2.5 | Clock wiring on `/play/demo` | 5 | pause/seek exact |

## Phase 3 — Music analysis (spec `02-music-analysis`, P0, owner: `audio-analyst`)

| # | Task | Spec task | Priority | Done when |
|---|---|---|---|---|
| 3.1 | Schemas + upload endpoint + cache by hash | 1–2 | P0 | tests green |
| 3.2 | Decode + Demucs (measure CPU time) | 3–4 | P0 | stems in S3 |
| 3.3 | Basic Pitch notes + filters | 5 | P0 | Hypothesis green |
| 3.4 | Rhythm, key, energy, sections, chords | 7 | P0 | unit tests on synthetic audio |
| 3.5 | Pipeline orchestration + progress + web upload page | 8–9 | P0 | upload → `/play/<id>` |
| 3.6 | Pre-analysed demo song fixture | 10 | P0 | demo loads instantly |
| 3.7 | Lyrics: `.lrc` parser | 6.2 | P1 | — |
| 3.8 | Lyrics: Muse Voice on vocal stem (only if 1.6 was positive) | 6.1–6.2 | P2 | — |

## Phase 4 — Default look (spec `04-default-template` — create with Kiro, P0, owner: `world-builder`)

| # | Task | Done when |
|---|---|---|
| 4.1 | Generate spec 04 from `PROJECT.md` §2 + `world-template` skill checklist | spec reviewed |
| 4.2 | Camera, plate, cracks, edge mountains | checklist items 1 |
| 4.3 | Diagonal curved staff, clefs, glyph look | items 2–3 |
| 4.4 | City + equalizer spikes gradient; arcs, particles, bloom | items 4–6 |
| 4.5 | Side-by-side with reference image; fix mismatches | all items ticked |

## Phase 5 — AI World Director (spec `05-ai-world-director`, P1, owner: `ai-director`)

| # | Task | Priority | Done when |
|---|---|---|---|
| 5.1 | Generate design + tasks from requirements | P1 | spec reviewed |
| 5.2 | Port + mock provider + validation/clamp + fallback + property test | P1 | green without any key |
| 5.3 | Muse Spark provider (verify docs first) + cache + spend cap | P1 | one real call OK |
| 5.4 | Web: "Generate world with AI" + provider selector + "generated by" label | P1 | works on demo |
| 5.5 | Bedrock Claude provider + switch | P2 | both providers selectable |
| 5.6 | ShapeRecipe generation (Wonder) | P2 | recipe renders under budget |

## Phase 6 — Template store (spec `06-template-store` — create with Kiro, P1, owner: any)

| # | Task | Priority | Done when |
|---|---|---|---|
| 6.1 | Generate spec 06 from `PROJECT.md` §8 | P1 | reviewed |
| 6.2 | Accounts (magic link or GitHub OAuth) | P1 | login works |
| 6.3 | Publish template (validate, license, thumbnail) | P1 | template listed |
| 6.4 | Gallery + use a template during playback | P1 | another user's template plays |
| 6.5 | Halloween template published (Kiroween theme) | P1 | in gallery |
| 6.6 | Report/flag + rate limits | P2 | — |

## Phase 7 — XR mode (spec `07-xr-mode` — create with Kiro, owner: `world-builder`)

| # | Task | Priority | Done when |
|---|---|---|---|
| 7a | Enter VR + tabletop diorama placement + play/pause in VR | P0 | works in IWER and Quest |
| 7b | Spatial panel (seek, template picker), hands pinch | P1 | `xr-verify` skill passed |
| 7c | Perf pass on Quest 3 (≥ 72 fps, < 100 draw calls) | P1 | numbers in handoff |
| 7d | Desktop / mobile navigation mode (spec `08-navigation-mode`): cinematic ↔ explore, orbit / pan / zoom, keyboard fly, presets, reset | P1 (done) | tests + headless check; VR still passes `xr-check.mjs` |

## Phase 8 — Deploy and hardening (P0, skill `deploy-ovh`)

| # | Task | Done when |
|---|---|---|
| 8.1 | Server setup, `.env`, first deploy, HTTPS | `/api/health` public OK |
| 8.2 | Demo song pre-analysed in prod; upload flow works | judge path works |
| 8.3 | Quest Browser on public URL | Enter VR OK |
| 8.4 | Security review (`reviewer` agent + `review-change`) | no high findings |
| 8.5 | Uptime: restart policies, disk space check, backup of DB | stays up until 2027-01-29 |

## Phase 9 — Submission (P0, human + agent)

| # | Task | Done when |
|---|---|---|
| 9.1 | README: what, how to test (URL, demo song), run locally, architecture, Kiro section | judge can test in 2 min |
| 9.2 | `KIRO_USAGE.md` final write-up: specs, steering, hooks, custom agents, PBT findings, MCP, vibe vs spec | complete |
| 9.3 | Video < 3 min, English, royalty-free audio, web + Quest footage, public on YouTube | link works logged-out |
| 9.4 | Devpost form: category Frankenstein, repo, URL, video, description, Kiro write-up | submitted |
| 9.5 | P2 bonuses: blog post (mention Kiroween 2026), social post starting with `#KiroweenHackathon26` | links in form |

---

## Token and safety rules (apply to every session)

**Spend few tokens**
1. **One task per session.** Start with the "Start session" hook (or `/start`), end with "Write handoff", then clear
   the context. Never carry two phases in one conversation.
2. **Read narrowly.** Only `docs/handoff.md`, the cited spec section and the files to touch. Search first
   (`grep -n`), then read a line range. Never open whole large files, the archive or `PROJECT.md` in full.
3. **Short outputs.** Pipe commands: `| tail -n 40`; run only the tests of the touched area; no pasting of full logs.
4. **Precise prompts.** Give the task id, files and done-criteria ("`03` task 2.2, `engine/world-state.ts`, make the
   seek property pass"). Avoid open-ended chat.
5. **Sub-agents only for parallel, independent areas** (e.g. `audio-analyst` on phase 3 while you do phase 2). Each
   sub-agent reloads context: do not delegate small tasks.
6. **Fixtures over regeneration.** Reuse the demo analysis fixture and the mock LLM provider in development; real
   Demucs and real LLM calls only in dedicated checks.
7. **Model choice.** Use the strongest available model for spec/design reviews, architecture decisions and hard
   bugs; use Kiro's automatic/faster model for mechanical tasks (scaffolding, renames, tests from a clear spec).

**Stay safe**
1. Never auto-approve destructive or outward-facing commands (deploy, `rm -rf`, force-push, DB drops). Trust only
   test, lint, typecheck and build commands in Kiro's trusted commands.
2. Secrets only in `.env` files that are git-ignored; never paste keys into chat or specs.
3. Commit after each green task (`<spec>: <task> <summary>`), push at least once a day — the repo is the backup.
4. Before each deploy: `make check` + `reviewer` agent. Keep the previous commit for rollback.
5. If a task fails twice the same way, stop, write the handoff with the pitfall, and switch to the documented
   fallback instead of looping.
