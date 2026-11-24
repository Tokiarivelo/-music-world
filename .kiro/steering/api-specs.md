---
inclusion: fileMatch
fileMatchPattern: "apps/api/music_world/*/interfaces/**"
---

# HTTP API conventions (FastAPI)

- Every route declares `response_model`, `tags`, `summary`, `responses` for each error status, and examples on
  request/response models. OpenAPI is served at `/api/docs` (disabled in production unless `API_DOCS=true`).
- Routers are thin: parse and validate → call one use case → map domain errors. No business logic, no SDK calls.
- Prefix: everything under `/api`. Resource names are plural nouns: `/api/projects`, `/api/templates`,
  `/api/projects/{id}/analysis`, `/api/projects/{id}/director`, `/api/projects/{id}/edits` (the signed-in owner's note
  edits, `music-world.edits.v1`, ≤ 64 KB, 404 for anyone else), `/api/jobs/{id}`.
- Error body is always `{ "error": { "code": "TEMPLATE_INVALID", "message": "…", "details": [...] } }`.
  Codes are stable UPPER_SNAKE strings defined in the domain.
- Auth: `Depends(current_user)` on every non-public route. Public routes: `/api/health`, `GET /api/templates`
  (published only), `GET /api/templates/{id}` (published only), demo project read.
- Moderation: `/api/moderation/templates` (queue, `ModerationQueue` contract), `POST …/{id}/restore` and
  `POST …/{id}/remove` (204, 409 `TEMPLATE_NOT_HIDDEN`, 429). Guarded by `require_moderator`
  (`MODERATOR_EMAILS`): **404 for everyone else, before CSRF, and for all when the list is empty**; a moderator's
  POST needs CSRF like any write. Every decision writes a `moderation_actions` row.
- Ownership: load the resource, compare `owner_id` with the caller, answer **404** on mismatch.
- Uploads: `multipart/form-data`, streamed to object storage; reject by content sniffing, size (25 MB) and
  duration (180 s) with `413` / `415` / `422`.
- Body size: `shared/body_limit.py` refuses bodies over 1 MiB (26 MiB + 64 KiB + 1 MiB for `POST /api/projects`)
  with `413 REQUEST_TOO_LARGE` before FastAPI parses them; Caddy enforces the same limits. A new upload route needs
  its own entry in `path_limits` (`main.py`) and in the Caddyfile.
- Production: the API refuses to start with `SESSION_COOKIE_SECURE=false` or an `http://` `PUBLIC_BASE_URL`.
- Long operations return `202` with `{ "jobId": "…" }`; clients poll `GET /api/jobs/{id}` (status, stage, progress).
- Pagination: `?cursor=&limit=` (max 50), response `{ "items": [...], "nextCursor": "…" | null }`.
- JSON field names are camelCase on the wire (pydantic `alias_generator=to_camel`), snake_case in Python.
- Health: `/api/health` (liveness + dependencies), `/api/ready` (readiness).
