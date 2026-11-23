---
name: start
description: Begin a work session on Music World — load docs/handoff.md and only the spec section it names, claim the task, then state the plan. Use at the start of every session, after a context reset, or when asked "what's next", "continue", or "Read docs/handoff.md and continue".
---

# Start a session

1. Read `docs/handoff.md` (≤ 150 lines) and run `git status --short`. Do not open `docs/handoff-archive/`.
2. Take the first item of "3. Next actions" that is not owned by another agent in "4. Task ownership".
   If it is blocked or needs a human (credentials, Quest headset, server access, Kiro credits), say so and take the next.
3. Claim it: set yourself as owner with status `in progress` in section 4 of `docs/handoff.md`.
4. Open the spec task in `.kiro/specs/<spec>/tasks.md`. Read only the requirement ids it cites (`requirements.md`)
   and the design section it names (`design.md`, search headings with `grep -n "^## "` then read that range).
5. Load the rule file of the touched area (see the table in `.kiro/steering/rules.md`) and the matching skill if any
   (`new-web-feature`, `new-api-module`, `analysis-stage`, `llm-provider`, `shape-kind`, `world-template`, `xr-verify`).
6. Reply in ≤ 5 lines: task id, files you expect to touch, acceptance criteria ids, the exact verification command.
   Then start.
7. While working: run only the tests of the touched area. Before stopping, run the `handoff` skill.

If `docs/handoff.md` does not exist yet, create it from the format in `.kiro/steering/handoff.md` with the first
unticked task of `.kiro/specs/01-foundation/tasks.md` as next action.
