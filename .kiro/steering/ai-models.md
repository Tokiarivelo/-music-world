---
inclusion: fileMatch
fileMatchPattern: "apps/api/music_world/director/**"
---

# AI World Director guidance (applies to `apps/api/music_world/director/**`)

## Role of each model

| Task | Model | Input | Output |
|---|---|---|---|
| Lyrics | `muse-voice-transcribe-1.0` | Demucs vocal stem | timed text segments |
| World direction | `muse-spark-1.3` | text summary of `AnalysisResult` + lyrics | `WorldTemplate` JSON |
| Custom shapes (optional) | `muse-wonder-1.0` | shape intent from the template | `ShapeRecipe` JSON |

Bedrock equivalents (Claude in Amazon Bedrock, `bedrock-mantle`): director `anthropic.claude-sonnet-5-5`, shapes
`anthropic.claude-opus-5-5`. Mock: `mock-director-1`. Current prompt: `PROMPT_VERSION = "director-v1"`
(`director/infrastructure/prompts/director.py`). Verified facts and sources: spec `05-ai-world-director/design.md`.

## Provider switch

- All calls go through the `LLMProvider` port (`director/application/ports.py`:
  `complete_json(PromptRequest) -> ProviderReply`, the request carries the structured summary for the mock and the
  reply the cost estimate), implemented in
  `director/infrastructure/providers/{muse,bedrock,mock}.py`; the fallback chain and cache are adapters too.
- Equivalent roles on Bedrock: director → a Claude Sonnet-class model, shapes → a Claude Opus-class model
  (ids from `BEDROCK_MODEL_ID` / `BEDROCK_SHAPE_MODEL_ID`).
- The UI shows which provider produced a template (`template.meta.generatedBy`), and the user can regenerate with
  the other one to compare.
- Prompts are provider-neutral; provider-specific formatting stays inside the provider module.
- Cache key = (audio hash, provider, model id, `PROMPT_VERSION`).

## Prompt rules

- Send a compact **text summary**, never raw note lists: key, tempo, chord progression per section, energy curve
  (downsampled to ~32 points), pitch range, note density per section, lyrics themes.
- Ask for JSON only, conforming to the provided JSON Schema. Put the schema in the system prompt.
- Allowed values (biomes, shape kinds, ops, styles) are closed enums: list them in the prompt.
- Bump `PROMPT_VERSION` on any prompt change; it is part of the cache key.

## Safety and robustness

- Parse → validate with pydantic → clamp numeric values to schema ranges → if anything fails, retry once with the
  validation errors, then fall back to the default template. Log the failure.
- Never execute or interpolate model output into code, SQL, shell or HTML.
- `META_API_KEY` empty, HTTP error, timeout (30 s) or spend cap reached → `MockDirector`, which derives a template
  deterministically from the analysis (minor key → cooler palette, high energy → denser city, etc.).
- Do not use `*-contributor` model ids with user data.
- Lyrics are user content: do not log them in full.
