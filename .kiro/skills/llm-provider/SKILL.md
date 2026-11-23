---
name: llm-provider
description: Add or change an LLM provider (Meta Muse, Claude on Amazon Bedrock, mock), a model id, a director prompt or the fallback chain of the Music World AI World Director, with schema validation, caching, spend cap and privacy rules. Use for any change in apps/api/music_world/director.
---

# LLM provider / director prompt

Rules: `ai-models.md`, `tech.md` (LLM providers section). Spec: `05-ai-world-director`.

1. **Verify the API first**: check the provider's current docs for model ids, request format, JSON/structured output
   support and audio input. Meta Model API is in preview; Bedrock model ids depend on region and account access.
   Record what you verified (date + link) in the spec `design.md`.
2. **Port**: `LLMProvider.complete_json(system: str, user: str, schema: dict, *, audio: bytes | None = None) -> dict`
   in `director/application/ports.py`. Providers must not validate business rules; they return parsed JSON or raise
   `ProviderError` (timeout, HTTP, refusal, invalid JSON).
3. **Adapter**: `director/infrastructure/providers/<name>.py` with timeout 30 s, one retry on 429/5xx, cost estimate
   per call (tokens × catalogue price) reported to the spend tracker.
4. **Chain**: register it in `shared/container.py` so the order is: selected provider → other configured real
   provider → `mock`. The result records `meta.generatedBy = {provider, model, promptVersion}`.
5. **Prompts**: provider-neutral text in `director/infrastructure/prompts/`; bump `PROMPT_VERSION` on any change.
   Send the compact analysis summary (never the raw notes) and the JSON Schema + closed enums.
6. **Validation**: pydantic parse → clamp → specification checks → on failure retry once with the errors → else
   default template.
7. **Privacy**: no `*-contributor` Muse ids with user data; no full lyrics in logs; keys only from env.
8. **Tests**: fake provider returning arbitrary JSON (Hypothesis) → result is rejected or renderable; fallback order;
   cache key includes provider + model + prompt version; spend cap switches to mock.
9. **Docs**: `ai-models.md` table, `tech.md` env table, `infra/.env.example`, `PROJECT.md` §5.
