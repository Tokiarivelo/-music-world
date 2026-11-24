# Design Document — 05 AI World Director

## Overview

Sources: `requirements.md`, `PROJECT.md` §5 (models, provider switch), §6 (ShapeRecipe), §8 (template contract),
`.kiro/steering/ai-models.md`, `tech.md` (LLM providers, env), skill `llm-provider`.

The director runs **once per (analysis, provider, model, prompt version)**, before playback, on the API server. It
turns a compact text summary of an `AnalysisResult` into a `music-world.template.v1` document. Whatever a model
returns is untrusted JSON: it is sanitized, clamped, validated with pydantic and checked by a renderability
specification; anything else is rejected. Nothing generated is executed or interpolated into code, SQL, shell or
HTML (requirement 3.4): the web app renders text with React text nodes only.

```text
web DirectorPanel ── POST /api/projects/{id}/director {provider?} ──┐
               └──── POST /api/director/demo {analysis, provider?} ──┤   (demo song: no project row)
                                                                     ▼
director/interfaces/http.py ─► GenerateWorld (application/use_cases/generate_world.py)
   │  summary = summarize(analysis)                 application/summary.py (pure)
   │  for provider in chain(selected):              domain/providers.py  selected → other real → mock
   │     cache hit?  ─► return                      port DirectorCache   (object store JSON)
   │     spend ≥ cap? ─► next                       port SpendTracker    (object store JSON, per audio hash)
   │     reply = provider.complete_json(request)    port LLMProvider     (muse | bedrock | mock adapters)
   │     doc = parse_template(reply)                application/template_output.py: sanitize → clamp → validate
   │     invalid? retry once with the errors          → renderability spec (domain/renderable.py)
   │     ok ─► stamp id/license/meta.generatedBy, cache, return DirectorResult
   └─ chain exhausted (cannot happen: mock is valid) ─► default template `neon-nocturne`
```

## Provider switch (requirement 1)

- Provider ids: `muse | bedrock | mock` (`director/domain/providers.py`). `LLM_PROVIDER` picks the default.
- A provider is **configured** when its credentials exist: `muse` needs `META_API_KEY` (and a model id that does not
  end in `-contributor`, requirement 5.3); `bedrock` needs `AWS_REGION` plus AWS credentials
  (`AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`, or `AWS_PROFILE`, or `AWS_BEARER_TOKEN_BEDROCK`); `mock` always.
- Chain (`fallback_chain(selected, configured)`): the selected provider if configured, then the other real provider
  if configured, then `mock`. Unknown or unconfigured selections are skipped with reason `NOT_CONFIGURED`.
- Every skipped step is reported in `DirectorResult.fallbacks = [{provider, reason}]` with reasons
  `NOT_CONFIGURED | SPEND_CAP | TIMEOUT | HTTP_ERROR | RATE_LIMITED | REFUSED | INVALID_JSON | INVALID_OUTPUT`.
- Timeout: the use case wraps each provider call in `asyncio.timeout(DIRECTOR_TIMEOUT_SEC = 30)`; adapters also set
  a 30 s HTTP timeout and retry once on 429 / 5xx (backoff 0.5 s, `Retry-After` honoured up to 2 s).
- `template.meta.generatedBy = {provider, model, promptVersion}` is stamped by the use case, never taken from the model
  (requirement 1.4). The template id is `ai-<provider>-<8 hex of the cache key>`, so regenerating with another
  provider yields a new id and the web keeps both (requirement 1.5).
- `GET /api/director/providers` returns `{default, providers: [{id, model, configured}]}`; the web selector lists the
  configured ones only (requirement 1.2).

## Port (deviation from the skill signature)

```python
class LLMProvider(Protocol):
    name: ProviderId
    model: str
    async def complete_json(self, request: PromptRequest) -> ProviderReply: ...
```

`PromptRequest = {system, user, schema, summary, audio=None}` and `ProviderReply = {data: dict, cost_usd: float}`.
Two deviations from `llm-provider` step 2, both deliberate: the request carries the structured `summary` so the
deterministic `mock` can derive a template without parsing prompt text, and the reply carries the estimated cost
(tokens × catalogue price) so the use case can feed the spend tracker. Providers do not validate business rules; on
failure they raise `ProviderError(reason)`.

## Prompt input (requirement 2)

`application/summary.py` → `AnalysisSummary` (pure, deterministic):

- key, tempo (BPM), duration, pitch range (min / median / max MIDI), overall note density (notes/s);
- per section: label, start, end, note density, mean energy, chord progression (consecutive duplicates removed,
  ≤ 8 labels);
- energy curve: mean of the analysis energy in 32 equal time buckets (≤ 32 points, requirement 2.1), 2 decimals;
- lyrics: up to 1 500 characters of the timed lines (user content: sent to the provider, never logged — logs carry
  the line count and a hash only).

Never the raw note list. `summary.text()` is the user prompt body; `sha256(summary.text())` is part of the cache key.

`director/infrastructure/prompts/` (provider-neutral, `PROMPT_VERSION = "director-v1"`):

- system: role, rules (JSON only, no prose, no code, no URLs), the closed enums (terrain style, mountains, staff
  path/clef, spawn kinds, color roles, stems, particles, chord links, height sources) and the
  `WorldTemplate` JSON Schema (`model_json_schema(by_alias=True)`, requirement 2.2);
- user: the summary text + "Return one WorldTemplate JSON object.";
- repair: the previous validation errors (≤ 20, paths + messages, no model text echoed) for the single retry.

Audio hint (requirement 2.3, MAY): `DIRECTOR_AUDIO_HINT` exists (default `false`) and `PromptRequest.audio` is
plumbed, but no provider attaches audio yet; the result never depends on it.

## Output validation (requirement 3)

`application/template_output.py`:

1. **Parse** (adapter): the text reply is parsed with `json.loads` after stripping one optional Markdown code fence;
   a non-object → `ProviderError(INVALID_JSON)`.
2. **Sanitize + clamp** against the template JSON Schema (walks `$ref`, `anyOf`): unknown keys dropped, numbers
   clamped to `minimum`/`maximum` (NaN / ±inf dropped so defaults apply), integers rounded, strings cut to
   `maxLength`, arrays cut to `maxItems`, booleans never treated as numbers.
3. **Stamp** director-owned fields: `schema`, `id`, `license = CC-BY-4.0`, `meta.generatedBy`; `name` defaults to
   "AI world" when missing or invalid.
4. **Validate** with `WorldTemplate.model_validate` (pydantic, zone ordering included).
5. **Renderability spec** (`domain/renderable.py`, pure): every spawn / zone kind is a built-in kind (recipe kinds
   need recipes, which the director does not produce until task 6), the staff color is readable on the background
   (relative-luminance difference ≥ 0.2), the serialized template is ≤ 32 KB.
6. Errors → one retry with the repair prompt → still invalid → next provider (`INVALID_OUTPUT`). `mock` is last and
   always valid; if even it failed, the stored default template `neon-nocturne` is returned (requirement 3.2).

Property test (requirement 3.3, Hypothesis): arbitrary JSON values and template-shaped near-valid documents →
`parse_template` either returns errors or a document that (a) validates as `WorldTemplate`, (b) passes an
independent oracle written in the test from the engine's rules (range syntax of `engine/mapping.ts`, built-in kinds,
zone order, palette hex), (c) is a fixed point (re-parsing gives the same document).

## Mock director (deterministic, requirement 1.3 / ai-models.md)

`infrastructure/providers/mock.py` derives a template from the summary only, starting from the default look:

- minor key → cooler palette (primary toward blue-violet, accent toward cyan); major → warmer (magenta / amber);
- mean energy → bloom (0.6–1.4) and particles (`dust` below 0.25, else `arcs`);
- tempo → staff lookahead (fast songs 3 s, slow songs 5 s); note density → `budget.instancesPerKind`;
- pitch range → mapping thresholds at the song's own terciles (low → `terrain_ridge`, mid → `building`, high →
  `spike`) with a catch-all `building`; vocals stem → `crystal` when present;
- name like "Cool Nocturne · A minor · 92 BPM". Cost 0.

## Cost, cache, privacy (requirement 5)

- Cache key = `sha256(audioHash | sha256(summary) | provider | model | PROMPT_VERSION)` (requirement 5.1); the summary
  digest prevents a forged analysis that reuses a real audio hash from poisoning the cache. Stored as JSON in the
  object store under `director/cache/<key>.json` (works with the local store and S3).
- Spend: `director/spend/<audio hash>.json` keeps the USD estimate spent for that audio; a provider is skipped with
  `SPEND_CAP` once `spent ≥ META_SPEND_CAP_USD` (default 1, both real providers, requirement 5.2). The demo shares the
  cap of its audio hash, which bounds what the public demo endpoint can spend.
- Catalogue prices (USD per 1M tokens, input / output): `muse-spark-1.3` 1.25 / 4.25, `muse-wonder-1.0` 4 / 20,
  Bedrock Claude Sonnet 5.5 2 / 10, Claude Opus 5.5 4 / 20 (Anthropic list prices; Bedrock bills separately, so these
  are estimates for the cap). Unknown model → the highest known price.
- `*-contributor` Muse ids are refused at configuration time (provider reported unconfigured, warning logged).
- Keys only from env (`SecretStr` settings), never returned by the API or logged; logs carry provider, model,
  durations, token counts, reasons, hashes — never prompts or lyrics.
- Abuse: the director routes are rate-limited per client IP (`DIRECTOR_RATE_LIMIT_PER_HOUR`, default 30, in-memory,
  `429 RATE_LIMITED`).

## HTTP API

| Route | Body | Response |
|---|---|---|
| `GET /api/director/providers` | — | `music-world.director-providers.v1` |
| `POST /api/projects/{id}/director` | `{provider?}` | `music-world.director-result.v1`; 404 unknown project, 409 `ANALYSIS_NOT_READY` |
| `POST /api/director/demo` | `{analysis, provider?}` | same; 422 unless `analysis.audioHash` is the shipped demo hash |

`DirectorResult = {template, provider, model, requestedProvider, cached, fallbacks}`. The template contract gains an
optional `meta: {generatedBy: {provider, model, promptVersion}}` (additive, schema stays v1). No auth yet (accounts
context missing, see handoff): project ids are unguessable UUIDv7.

## Web (requirement 1.2, 1.5)

`features/director/` (barrel `index.ts`): `api/director.api.ts` (zod-validated with the generated schemas),
`hooks/use-director.ts` (providers, selection, status, generated templates in generation order),
`components/DirectorPanel.tsx` (provider `<select>` limited to configured providers, "Generate world with AI" button,
"Generated by <provider> · <model>" label for the current template, fallback note, error text), `consts/`.
The player passes `[...BUILTIN_TEMPLATES, ...director.templates]` to `useTemplateChoice` and selects each new result,
so the 2D page and the VR template picker both list every generated template; nothing is overwritten.

## Verified provider facts (2026-11-24)

- Meta Model API (preview): base `https://api.meta.ai/v1`, `Authorization: Bearer <key>`, OpenAI-compatible
  `POST /chat/completions` with `model`, `messages`, `max_completion_tokens`, `response_format`
  (`{type: json_schema, json_schema: {name, schema, strict}}`, `strict` defaults to false); reply text in
  `choices[0].message.content`, `message.refusal`, `finish_reason ∈ stop|length|content_filter|…`, usage
  `prompt_tokens` / `completion_tokens`. Errors `{error: {message, type, param, code}}`; retry 429 / 500 / 503.
  Model ids: `muse-spark-1.3` (recommended), `muse-wonder-1.0` (preview), contributor id
  `muse-spark-1.3-contributor`. Sources: https://dev.meta.ai/docs/models.md,
  https://dev.meta.ai/docs/structured-output.md, https://dev.meta.ai/docs/api-reference/chat-completions/schemas.md,
  https://dev.meta.ai/docs/error-handling.md, https://dev.meta.ai/docs/pricing-rate-limits.md.
- Claude in Amazon Bedrock (`bedrock-mantle`, Messages API): Python `anthropic[bedrock]`,
  `AsyncAnthropicBedrockMantle(aws_region=…)`, credentials from `AWS_BEARER_TOKEN_BEDROCK` or the AWS chain; model ids
  carry the `anthropic.` prefix: director `anthropic.claude-sonnet-5-5` (Sonnet class), shapes
  `anthropic.claude-opus-5-5` (Opus class). Adaptive thinking is on by default on these models; the director sends
  `output_config.effort = "low"` to stay inside the 30 s budget and asks for JSON in the prompt (no
  `output_config.format`: the template schema uses `pattern` / bounds that structured outputs may not accept).
  Source: https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock and the `claude-api` skill.

## Testing

- `domain`: chain order, spend arithmetic, renderability spec (Hypothesis on colors).
- `application`: summary (≤ 32 energy points, no note list, deterministic), `parse_template` property test,
  `GenerateWorld` with fake providers: fallback order and reasons, retry-once with errors, spend cap → mock,
  cache key includes provider + model + prompt version, cache hit skips the provider, timeout.
- `infrastructure`: Muse and Bedrock adapters against recorded/hand-written fixture responses through mocked HTTP
  (`httpx.MockTransport`, `httpx2.MockTransport`): request shape, parsing, fences, refusal, 429 retry, 5xx, cost;
  mock provider determinism and validity over generated summaries; contributor ids refused.
- `interfaces`: providers list, project route (404, 409, 200), demo route (hash check), rate limit 429.
- Web: api parsing, `useDirector`, `DirectorPanel` (selector limited to configured providers, label, error).
- No test calls a real LLM or the network.

## Human checks (not done — need credentials)

1. Muse: set `META_API_KEY` (and `LLM_PROVIDER=muse`) in `infra/.env`, start the API, then
   `curl -s -X POST localhost:8000/api/director/demo -H 'content-type: application/json'
   -d "{\"analysis\": $(cat apps/web/src/features/player/demo/neon-nocturne.analysis.json), \"provider\": \"muse\"}"
   | jq '.provider, .model, .fallbacks, .template.meta'` → `provider` is `muse`, `fallbacks` is `[]`.
2. Bedrock: set `AWS_REGION` and AWS credentials (or `AWS_BEARER_TOKEN_BEDROCK`), enable access to the Claude model in
   the Bedrock console, same command with `"provider": "bedrock"`.
3. On `/play/demo`, pick each provider, click "Generate world with AI", check the label and the world.

## As built (Phase 5, 2026-11-25)

- Task 2: `apps/api/music_world/director/` — domain (`providers.py` chain, `renderable.py`, `spend.py`, `demo.py`,
  `errors.py`), application (`summary.py`, `template_output.py`, `ports.py`, use cases `GenerateWorld`,
  `GenerateProjectWorld`, `GenerateDemoWorld`, `ListProviders`), infrastructure (`prompts/`, `providers/mock.py`,
  `object_store_cache.py`, `default_template.json` = copy of the web default, kept equal by a test), interfaces
  (`http.py`). Wiring: `shared/container.py` `build_director` (`Container.director`). Rate limiter:
  `shared/rate_limit.py`.
- Selecting `mock` never calls a paid provider (chain = `[mock]`).
- The rate limit is in memory per API worker (2 uvicorn workers → up to 2× the limit); uvicorn trusts Caddy's
  `X-Forwarded-For` (`--forwarded-allow-ips '*'`, the api port is not published).
- Property test `tests/unit/director/test_template_output.py`: arbitrary JSON (300 examples) and near-valid templates
  (400 examples, ~20 % renderable / 80 % rejected) against an oracle written from the engine's rules. Mutation
  checks (each caught): recipe kinds allowed, staff contrast check removed, minimum clamp removed, NaN kept,
  model-provided `id` kept. The first strategy version produced 0 % renderable documents (vacuous property): fixed
  by biasing each field toward valid values.
- Task 3: `providers/muse.py` (`httpx.AsyncClient`, 30 s, one retry on 429/500/502/503 with `Retry-After` ≤ 2 s,
  `response_format` json_schema non-strict, `max_completion_tokens` 8000), `providers/_json.py` (fence stripping),
  `providers/pricing.py`. Replies that were billed but unusable (refusal, truncated, not JSON) raise
  `ProviderError(cost_usd=…)` so the spend tracker still counts them. Tested on
  `tests/fixtures/director/muse-chat-completion.json` (hand-written in the documented shape) through
  `httpx.MockTransport`. **Not verified against the live API** (no `META_API_KEY`): see § Human checks.
