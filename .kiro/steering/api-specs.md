---
inclusion: fileMatch
fileMatchPattern: "apps/api/music_world/*/interfaces/**"
---

# HTTP API conventions (FastAPI)

- Every route declares `response_model`, `tags`, `summary`, `responses` for each error status, and examples on
  request/response models. OpenAPI is served at `/api/docs` (disabled in production unless `API_DOCS=true`).
- Routers are thin: parse and validate → call one use case → map domain errors. No business logic, no SDK calls.
- Prefix: everything under `/api`. Resource names are plural nouns: `/api/projects`, `/api/templates`,
  `/api/projects/{id}/analysis`, `/api/projects/{id}/director`, `/api/jobs/{id}`.
- Error body is always `{ "error": { "code": "TEMPLATE_INVALID", "message": "…", "details": [...] } }`.
  Codes are stable UPPER_SNAKE strings defined in the domain.
- Auth: `Depends(current_user)` on every non-public route. Public routes: `/api/health`, `GET /api/templates`
  (published only), `GET /api/templates/{id}` (published only), demo project read.
- Ownership: load the resource, compare `owner_id` with the caller, answer **404** on mismatch.
- Uploads: `multipart/form-data`, streamed to object storage; reject by content sniffing, size (25 MB) and
  duration (180 s) with `413` / `415` / `422`.
- Long operations return `202` with `{ "jobId": "…" }`; clients poll `GET /api/jobs/{id}` (status, stage, progress).
- Pagination: `?cursor=&limit=` (max 50), response `{ "items": [...], "nextCursor": "…" | null }`.
- JSON field names are camelCase on the wire (pydantic `alias_generator=to_camel`), snake_case in Python.
- Health: `/api/health` (liveness + dependencies), `/api/ready` (readiness).
