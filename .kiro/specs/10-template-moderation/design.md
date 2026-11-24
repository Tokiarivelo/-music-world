# Design

## Overview

Extends the `templates` bounded context. No new schema for templates; one migration for `moderation_actions` and a
`reports_since` marker on the template row (reports older than the marker are ignored by the threshold count).

```text
interfaces/moderation_http.py   GET /api/moderation/templates, POST …/{id}/restore, POST …/{id}/remove
application/use_cases/          ListHiddenTemplates, RestoreTemplate, RemoveTemplate
application/ports.py            ModerationAudit.record(action), ModeratorDirectory.is_moderator(user)
infrastructure/                 repository methods list_hidden / restore / delete_reports; audit table
shared/settings.py              moderator_emails (SecretStr-free list of strings, hashed at start-up)
web: features/moderation (QueueList, ReasonList, DecisionButtons), app/moderation/page.tsx (thin)
```

## Moderator check

At start-up the e-mails are normalized (strip, lower-case) and hashed with the same function the accounts context uses
for its log prefix and the user lookup; the check compares user id → stored e-mail hash. `ModeratorDirectory` is a
port so tests inject a fake. The session response gains an optional `moderator` field: a **contract change** to
`music-world.session.v1` (`make schemas`, `PROJECT.md` §9).

## Restore semantics

`restore` sets `status = published`, `reports_since = now`, deletes the report rows. The threshold query counts
distinct reporters with `created_at >= reports_since`. This keeps the one-report-per-user rule intact.

## Errors

404 for non-moderators and unknown ids, 409 `NOT_HIDDEN`, 422 never (no body). Error codes follow `api-specs.md`.

## Testing

Use cases with fakes; HTTP: empty list → 404 for everyone, non-moderator 404, CSRF 403, 409, audit row written; the
restore property test; Testing Library for the page; one Playwright screenshot of the queue with a seeded hidden
template.

## Human checks

Set `MODERATOR_EMAILS` on the server and review one real hidden template after the public deploy.
