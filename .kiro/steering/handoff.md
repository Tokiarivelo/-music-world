---
inclusion: always
---

# Handoff between sessions and agents

Context and tasks move between agents (Kiro, its custom agents, Claude Code, others) through **one short file**:
`docs/handoff.md`. Specs (`.kiro/specs/*/tasks.md`) are the task backlog; the handoff says where we are in it.

## `docs/handoff.md` format

**150 lines maximum, 6 fixed sections, rewritten at each handoff** (sessions are never stacked):

1. **Repository state** — branch, last commit, uncommitted files, last test results (command + pass/fail counts),
   running services.
2. **Last session** — 5 to 10 bullets: what was done, decisions, deviations from the spec. Agent name + date.
3. **Next actions** — ordered; each item = `<spec> task <n>` + files to touch + exact section to read
   (e.g. `03-world-engine-core task 2.2 — design.md § Engine`).
4. **Task ownership** — table `task | owner agent | status (todo / in progress / blocked / done) | note`.
   An agent only works on tasks it owns or that are unowned; it sets itself as owner before starting.
5. **Active pitfalls** — the few that bite every session (≤ 8 lines); everything area-specific goes in `docs/pitfalls.md`.
   Remove those that no longer apply.
6. **Open specs** — table `spec | status | next task | section to read`.

Long details (measurements, screenshots, logs, ids) go into the spec `design.md`, `PROJECT.md` or `KIRO_USAGE.md`;
the handoff links to them.

## Outgoing agent

1. Run the tests of the touched area and `bash scripts/agents/validate-architecture.sh`.
2. Tick finished tasks in the spec `tasks.md`.
3. Move the previous section 2 to the top of `docs/handoff-archive/<YYYY-MM>.md` (create the month file if needed).
4. Rewrite the 6 sections of `docs/handoff.md`; update its header date and author.
5. Append a dated entry to `KIRO_USAGE.md` if Kiro features were used (hook "Update Kiro usage log").
6. Give the user the resume line:
   **`Read docs/handoff.md and continue with the next actions.`** (Kiro: run the "Start session" hook;
   Claude Code: `/start`.)

## Incoming agent

1. Read `docs/handoff.md` only (never the archive by default) and run `git status --short`.
2. Take the first next action you can own; if it is blocked or needs a human (credentials, headset, deployment
   access), say so and take the next one.
3. Read only the spec sections and files that action cites.
4. State in ≤ 5 lines: task, files to touch, verification command. Then start.

## When to hand off

Context at ~70–80 %, end of a spec task group, change of agent, end of session, or before a risky operation
(deployment, schema version bump).

## Delegating to a custom agent

When delegating (Kiro `invoke_sub_agent`, Claude Code subagent…), pass: the spec task id, the sections to read, the
files to touch, the acceptance criteria ids and the verification command. The sub-agent reports back changed files,
test results and open issues; the delegating agent records them in the handoff.
