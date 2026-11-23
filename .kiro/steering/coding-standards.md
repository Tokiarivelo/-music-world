---
inclusion: always
---

# Coding standards

## TypeScript (`apps/web`, `packages/*`)

- `strict: true`. **No `any`**: use `unknown` and narrow with type guards or zod.
- Explicit return types on exported functions. Prefer `interface` for object contracts, `type` for unions.
- Validate every external input (API responses, uploaded templates, URL params) with the generated zod schemas.
- No magic values: constants in `consts/<feature>.consts.ts` or `engine/constants.ts`.
- Immutability in `engine/`: never mutate inputs; return new objects (or write into caller-owned typed arrays).
- Errors: throw typed errors (`class TemplateInvalidError extends Error`), never strings. UI shows a message key,
  logs the cause.
- Lint/format: ESLint + Prettier; no disabled rules without a comment explaining why.

## Python (`apps/api`)

- Python 3.12, full type hints, `mypy --strict` on `domain/` and `application/`. Ruff for lint and format.
- pydantic v2 for every boundary (HTTP, jobs, LLM output, storage JSON). Domain entities are plain dataclasses
  (`@dataclass(frozen=True)`) and do not import pydantic, FastAPI, SQLAlchemy or SDKs.
- Ports are `typing.Protocol`s in `application/ports.py`; adapters implement them in `infrastructure/`.
- Errors: domain errors subclass `MusicWorldError` with a stable `code`; interfaces map them to HTTP responses.
- Async I/O in API handlers; CPU-heavy work (Demucs, Basic Pitch, librosa) only in the worker, never in a request.
- Every external call has a timeout and a bounded retry with backoff.

## Logging

- Structured JSON logs (structlog in Python, a small JSON logger in Next.js server code).
- Every log line carries `request_id` / `job_id` and `project_id` when known.
- Never log secrets, API keys, full lyrics, raw audio or full LLM prompts with user content (log hashes and sizes).

## Security

- Secrets only from environment variables, read on the server. Nothing secret behind `NEXT_PUBLIC_`.
- Ownership checks on every project/template route: answer **404** when the caller is not the owner (do not leak
  existence).
- Uploads: check MIME by content (not extension), size and duration before storing; random object keys.
- Templates and LLM outputs: schema validation + clamping; no HTML injection (render text, never `dangerouslySetInnerHTML`).
- Rate-limit uploads, director calls and template publication per user and per IP.

## Commits

Conventional style with the spec as scope: `feat(03-world-engine-core): 2.2 worldStateAt phases`. One task per
commit. Never commit generated build output, `.env`, audio fixtures larger than 2 MB, or model weights.
