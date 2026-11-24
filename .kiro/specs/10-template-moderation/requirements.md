# Requirements Document

## Introduction

`06-template-store` hides a published template from the gallery when enough distinct users report it
(`TEMPLATE_REPORT_HIDE_THRESHOLD`, status `hidden`), but nobody can review it: a hidden template stays hidden forever
and its owner is not told. This spec adds a small review queue for moderators: list the hidden templates with their
reports, restore or remove one, and keep an audit trail. There is no admin role in the code today; moderators are
named by configuration, not by a database flag. Priority: **P2**.

## Requirements

### Requirement 1 — Moderators

**User Story:** As the operator, I want only people I name to review reports.

#### Acceptance Criteria

1. THE API SHALL read `MODERATOR_EMAILS` (comma-separated, case-insensitive, default empty) from the environment; a
   signed-in user is a moderator when the hash of their e-mail matches (compared as stored: hashed, never logged).
2. WITH an empty list THE moderation routes SHALL answer 404 (the feature does not exist) for everyone.
3. A non-moderator SHALL get 404, not 403, on every moderation route (no hint that the routes exist).
4. `GET /api/auth/session` SHALL expose `moderator: true` only to a moderator (the web app shows the link from it).

### Requirement 2 — Review queue

**User Story:** As a moderator, I want to see what was reported and why.

#### Acceptance Criteria

1. `GET /api/moderation/templates` SHALL list the hidden templates (newest report first, page size ≤ 50, cursor
   pagination like the store), each with name, owner display name, thumbnail URL, report count and the reasons
   (≤ 200 characters each, plain text).
2. THE page `/moderation` SHALL show the queue, the template preview (the same `TemplatePreview` as the store) and the
   reasons; reasons SHALL be rendered as text, never as markup.
3. THE queue SHALL be empty-state friendly ("Nothing to review").

### Requirement 3 — Decisions

**User Story:** As a moderator, I want to restore a wrongly hidden template or remove an abusive one.

#### Acceptance Criteria

1. `POST /api/moderation/templates/{id}/restore` SHALL set the status back to `published`, delete the existing
   reports, and make the template count reports again from zero (a restored template is not hidden by old reports).
2. `POST /api/moderation/templates/{id}/remove` SHALL delete the template, its thumbnail and its reports (same effect
   as the owner's delete).
3. BOTH routes SHALL require CSRF (`apiFetch`), be rate limited per moderator, and answer 409 when the template is not
   hidden any more.
4. EVERY decision SHALL write an audit row (`moderation_actions`: id, template id, moderator user id, action,
   created at) and a structured log event without the e-mail address or the reasons.

### Requirement 4 — Owner feedback

1. THE owner's `GET /api/templates/mine` SHALL report `status: "hidden"` (it already does) and the web "My templates"
   list SHALL show a "Hidden after reports, under review" label.
2. A removed template SHALL simply be gone (404), as after an owner delete.

### Requirement 5 — Quality

1. Clean Architecture in the existing `templates` context (use cases `ListHiddenTemplates`, `RestoreTemplate`,
   `RemoveTemplate`, port `ModerationAudit`); the HTTP module is a new router in `templates/interfaces`.
2. Tests: use cases with in-memory fakes, HTTP tests for the 404 rules, CSRF, 409, audit rows; Testing Library tests for
   the page; a property test that reports counted after a restore never hide the template before the threshold.
