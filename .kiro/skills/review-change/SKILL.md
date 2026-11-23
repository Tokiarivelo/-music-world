---
name: review-change
description: Review a Music World change (uncommitted diff, branch or PR) against the project rules — architecture boundaries, determinism and sync, data-only LLM and templates, security, performance budget, tests and docs. Use when asked to review, audit or check changes before a commit, PR or handoff.
---

# Review a change

Get the diff (`git diff`, `git diff --cached` or `git diff main...HEAD`). Report findings ordered by severity with
`file:line`, the failing scenario and a fix. Do not report style nits that tools already enforce.

## Checklist

**Architecture**
- [ ] `bash scripts/agents/validate-architecture.sh` passes.
- [ ] Backend: routers thin, logic in use cases, SDKs only in infrastructure, wiring only in `shared/container.py`.
- [ ] Web: pages thin, cross-feature imports through barrels, no Three.js in React components.

**Engine and sync**
- [ ] `engine/` stays pure (no DOM, timers, `Math.random`, Three.js); seeded PRNG only.
- [ ] Visual time comes from `AudioClock.now()`; no `setTimeout`/`setInterval` scheduling; no frame-accumulated state.
- [ ] Property tests still present and not weakened.

**AI and templates**
- [ ] Every LLM/template input validated by schema with clamping; fallback chain intact; nothing executed or
      interpolated into code/SQL/shell/HTML.
- [ ] No `*-contributor` model with user data; no full lyrics or secrets in logs; keys server-side only.

**Security**
- [ ] Auth on non-public routes; ownership mismatch → 404; upload limits and content sniffing; rate limits.

**Performance**
- [ ] InstancedMesh per kind; no per-note allocations in the frame loop; draw calls < 100.

**Tests and docs**
- [ ] Tests for new behaviour (incl. error paths); fixtures royalty-free and small.
- [ ] Docs updated per `documentation.md`; spec tasks ticked; handoff current; English text.
