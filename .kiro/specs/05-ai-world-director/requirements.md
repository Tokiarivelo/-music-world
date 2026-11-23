# Requirements Document

## Introduction

The AI World Director reads a text summary of an `AnalysisResult` (and lyrics) and proposes a `WorldTemplate`, and
optionally `ShapeRecipe`s for custom 3D forms. It runs once before playback, never in the playback loop. The LLM
provider is switchable between Meta Muse and Claude on Amazon Bedrock, with a deterministic mock as the final fallback.
Every output is data validated against a schema; nothing generated is ever executed.

Design and tasks: generate them with Kiro from this document, `PROJECT.md` §5–§6 and the `ai-models` steering file.

## Requirements

### Requirement 1 — Provider switch

**User Story:** As a user, I want to choose which AI generates my world, so that I can compare Muse and Claude.

#### Acceptance Criteria

1. THE system SHALL support providers `muse`, `bedrock` and `mock` behind one `LLMProvider` interface.
2. THE default provider SHALL come from `LLM_PROVIDER`; the play page SHALL offer a selector limited to configured providers.
3. IF the selected provider is unconfigured, errors, times out (30 s) or exceeds the spend cap THEN the system SHALL try
   the other real provider if configured, then `mock`, and record which provider produced the result.
4. THE generated template SHALL record `meta.generatedBy = { provider, model, promptVersion }`.
5. WHEN the user asks to regenerate with another provider THEN the system SHALL produce a new template without
   overwriting the previous one.

### Requirement 2 — Prompt input

1. THE director SHALL send a compact text summary (key, tempo, chord progression per section, energy curve of ≤ 32
   points, pitch range, note density per section, lyrics or lyric themes), never the raw note list.
2. THE system prompt SHALL include the `WorldTemplate` JSON Schema and the closed enums of allowed values.
3. WHERE the provider supports audio input and `DIRECTOR_AUDIO_HINT=true` THE director MAY attach a 30 s excerpt as a
   mood hint; the result SHALL NOT depend on it being available.

### Requirement 3 — Output validation

1. THE response SHALL be parsed as JSON and validated with pydantic; numeric values SHALL be clamped to schema ranges.
2. IF validation fails THEN the director SHALL retry once with the validation errors, then fall back to the default template.
3. FOR ALL model outputs (property test with arbitrary JSON), the result SHALL be either rejected or a template that the
   engine can render.
4. THE system SHALL NEVER execute, `eval` or interpolate model output into code, SQL, shell or HTML.

### Requirement 4 — Shapes

1. WHERE the template asks for a custom shape THE director MAY request a `ShapeRecipe` (closed op list, triangle budget).
2. Every recipe SHALL be validated and its triangle count checked by building it before acceptance.

### Requirement 5 — Cost, cache and privacy

1. Results SHALL be cached by (audio hash, provider, model id, prompt version).
2. A per-analysis spend cap (`META_SPEND_CAP_USD`, default 1) SHALL be enforced; over it → mock.
3. `*-contributor` Muse model ids SHALL NOT be used with user audio or lyrics.
4. API keys and AWS credentials SHALL stay on the server; full lyrics SHALL NOT be logged.
