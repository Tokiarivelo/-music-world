# Token budget — keeping AI-generated code cheap

Applies to every agent (Claude Code, Kiro, Codex, Cursor). The rule in `.kiro/steering/rules.md` points here. Sizes
below are bytes measured on 2026-11-24; tokens ≈ bytes / 3.8 for this Markdown-and-table content.

## 1. Where the tokens go

| Source | Size | Loaded | Comment |
|---|---|---|---|
| `CLAUDE.md` + `rules.md` | 4.8 KB | every session | tables of rules, skills, agents |
| Steering `always` files (`product`, `tech`, `structure`, `coding-standards`, `handoff`, `documentation`) | 19.6 KB | every session | `tech.md` was 9.6 KB; the core/accounts env tables (2.5 KB) moved to `env.md` (file-match) |
| `docs/handoff.md` | 11.3 KB | every session (`/start`) | § 5 pitfalls alone are 4 KB |
| `start` skill | 1.6 KB | every session | |
| **Fixed cost at session start** | **≈ 37 KB ≈ 9–10 k tokens** | | paid again after every `/clear` and in every sub-agent that loads steering |
| File-match steering (`architecture`, `frontend`, `ai-models`…) | 1.4–3.6 KB each | only when you touch the area | good as is |
| Skills | 1.6–2.2 KB each | only when invoked | good as is |
| Specs `design.md` | 9–18 KB each | only the cited section | read by range, never whole |
| `PROJECT.md` (French) | 32 KB | never by default | read by § only |
| Files you must **not** read | `pnpm-lock.yaml` 187 KB, `uv.lock` 449 KB, `neon-nocturne.analysis.json` 120 KB, `packages/schemas/*.json` ~90 KB, `templates/generated/*`, `bravura-outlines.ts`, `docs/handoff-archive/` 17 KB | | denied in `.claude/settings.json` (Claude Code) and the ignore files `.cursorignore`, `.geminiignore`, `.codeiumignore`, `.aiderignore`; Codex, Kiro and others follow `rules.md` "Never read" |

The expensive part of a session is not the 10 k fixed tokens: it is **re-reading** (whole files, full test logs,
the same file twice) and **re-writing** (a whole file for a 3-line change). The rules below target those.

## 2. Rules for the agent

**Reading**

1. `grep -n` / search first, then read the range (`offset` + `limit`). Never open a file over ~200 lines whole.
2. Never open lockfiles, generated files, build output, `node_modules`, `.venv`, audio, or archives (denied in
   `.claude/settings.json`). To know a schema, read the pydantic model, not the exported JSON.
3. Do not re-read a file you just edited: the edit tool fails loudly when it does not apply.
4. For "where is X used?" across many files, one search (or an exploration sub-agent) returning file:line pairs, not
   a manual crawl. Sub-agents start cold and re-load the steering (~10 k tokens): use them only for broad sweeps.
5. Specs: read the requirement ids and the one design section a task cites (`grep -n "^## "` then a range).

**Writing**

6. Edit with small exact replacements; write a whole file only when it is new or mostly rewritten.
7. Scaffold from the skills (`new-web-feature`, `new-api-module`, `shape-kind`…): they hold the file layout, so
   you do not re-derive it from the codebase.
8. Copy a nearby, similar file's conventions by reading **one** example, not the directory.
9. Do not paste generated code or long diffs into the chat or the handoff: say which files changed.

**Running things**

10. Run only the tests of the touched area: `uv run pytest -q path::test`, `pnpm -C apps/web exec vitest run <file>`;
    the whole `make -j3 check` once before the commit. Pipe long output: `| tail -30`.
11. Quiet flags: `pytest -q`, `vitest run --reporter=dot`, `docker compose ... --quiet-pull`, `ruff --quiet`.
12. After a failure, read the failing assertion, not the whole log; fix, rerun that test.
13. Docker: `make dev` / `make build` skip unchanged images; never `docker compose up --build` by hand.

**Session hygiene**

14. One spec task per session; `/clear` (or a fresh session) between tasks, `/handoff` before it. Do not drag a
    finished task's file reads into the next one.
15. `/compact` at ~60 % rather than letting the context fill; the handoff is the durable memory.
16. Put stable instructions first and do not edit `CLAUDE.md`, `rules.md` or `always` steering files mid-session:
    the cached prompt prefix stays valid, so repeated turns are billed at the cache rate.
17. Match the model to the work: a small model for mechanical edits, renames, docs and test scaffolds; the large one
    for design, debugging and contract changes.
18. Keep only the MCP servers you use enabled for this project: every connected server adds tool names (and the
    full schemas of tools you load) to the context. This project needs none of Slack, Drive or Docs for coding.

## 3. Rules for the repository (keeps the fixed cost low)

- `always` steering files hold **rules**, not reference data. Tables that restate code (env defaults, settings)
  go in a `fileMatch` file: `env.md` is the example. Target: the always-loaded total stays under 20 KB.
- `docs/handoff.md` stays ≤ 150 lines (target 100): § 5 keeps only pitfalls that bite daily, the others live next to
  the code they concern (backlog B6). Old sessions go to `docs/handoff-archive/`, never read by default.
- Generated files carry a "generated, never read or edit" header and are listed in `.claude/settings.json` `deny`
  and in `.dockerignore` where relevant. A new generated file → add it to both.
- Specs: design sections get stable `##` headings so an agent can read one range. Prefer a new small file over
  growing a 18 KB `design.md` further.
- Skills stay under ~2.5 KB and name the files to read, so an agent does not explore.
- Code that is easy to find is cheap: keep one concept per file, feature-first folders, barrels (`index.ts`) that list
  what a feature exports, and tests next to the code (the architecture already does this).

## 4. Checking the budget

```bash
wc -c CLAUDE.md .kiro/steering/{rules,product,tech,structure,coding-standards,handoff,documentation}.md docs/handoff.md
```

Fixed cost = the sum / 3.8. If it passes 40 KB, trim before adding anything new. Record the number in the handoff
when you change an `always` file.
