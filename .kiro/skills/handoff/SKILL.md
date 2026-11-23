---
name: handoff
description: Write the Music World handoff so another agent or session can continue — verify, tick spec tasks, archive the previous session, rewrite docs/handoff.md (6 fixed sections, ≤ 150 lines), update KIRO_USAGE.md, give the resume line. Use at the end of a session, when context reaches ~70–80 %, before switching agent, or before a risky operation.
---

# Write the handoff

1. **Verify**: run the tests of the touched area and `bash scripts/agents/validate-architecture.sh`. Note exact
   commands and pass/fail counts.
2. **Tick** finished tasks in `.kiro/specs/<spec>/tasks.md`. Do not tick a task whose tests fail.
3. **Archive**: cut section "2. Last session" from `docs/handoff.md` and paste it at the top of
   `docs/handoff-archive/<YYYY-MM>.md` (create the file with a `# Handoff archive — <YYYY-MM>` title if missing).
4. **Rewrite** `docs/handoff.md` (header: date, author agent; then the 6 sections):
   1. Repository state — branch, last commit (`git log -1 --oneline`), uncommitted files (`git status --short`),
      test results, running services.
   2. Last session — 5–10 bullets: done, decisions, deviations from the spec (and where the spec was updated).
   3. Next actions — ordered: `<spec> task <n>` + files + exact section to read.
   4. Task ownership — `| task | owner | status | note |`; release tasks you will not finish (owner `—`, status `todo`).
   5. Active pitfalls — add new ones, remove obsolete ones.
   6. Open specs — `| spec | status | next task | section to read |`.
   Long details go into the spec `design.md`, `PROJECT.md` or `KIRO_USAGE.md`, linked from the handoff.
   Check the file is ≤ 150 lines (`wc -l docs/handoff.md`).
5. **Kiro log**: append a dated entry to `KIRO_USAGE.md` (specs/tasks done, hooks that fired and what they caught,
   property tests that found bugs, steering changes).
6. **Resume line** — tell the user to open a new session with:
   `Read docs/handoff.md and continue with the next actions.`
