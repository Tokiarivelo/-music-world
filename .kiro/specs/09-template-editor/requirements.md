# Requirements Document

## Introduction

Let a signed-in listener edit a world template (palette, terrain, staff, effects, note-to-shape mappings, zones)
in the browser, see the change live in the world, and save it as a draft or publish it to the store. Today a
template can only come from the default look, the AI World Director or the store, and can only be published as is.
Templates stay **data**: the editor produces a `music-world.template.v1` document validated by the same zod schema and
the same server-side rules (`06-template-store` requirement 3); it never produces code, URLs or recipes with unbounded
numbers. Priority: **P2** (after the P0/P1 phases of `docs/roadmap.md`).

## Requirements

### Requirement 1 — Open a template in the editor

**User Story:** As a listener, I want to start from a template I like and change it.

#### Acceptance Criteria

1. THE play page and each store card SHALL offer an "Edit a copy" action; it opens `/editor?from=<templateId>`, or
   the default template when no id is given.
2. THE editor SHALL work on a copy: the source template, the store and the running world are unchanged until the user
   saves.
3. WHEN the source cannot be loaded or fails validation THE editor SHALL show the error and offer the default template.

### Requirement 2 — Edit the fields

**User Story:** As a listener, I want controls that only allow valid values, so that I cannot break my world.

#### Acceptance Criteria

1. THE editor SHALL expose: name; the six palette colors (color input + `#rrggbb` text); terrain style, mountains
   and size; staff path, clef, glow, lookahead and fall duration; fx particles, bloom, beat pulse and chord links;
   the mapping rules (order, `when` pitch / velocity / chord / stem, `spawn` kind, height source, color role); the
   zones (kind and rectangle).
2. EVERY numeric control SHALL use the schema bounds as min / max / step; every enum SHALL be a select.
3. THE mapping list SHALL keep 1–32 rules, the zone list 0–16, the last mapping rule MAY be a catch-all.
4. Recipes are out of scope for the first version: the editor keeps the `recipes` of the source untouched and lists
   the recipe kinds as read-only choices.

### Requirement 3 — Validation

**User Story:** As a listener, I want to know right away what is wrong.

#### Acceptance Criteria

1. THE editor SHALL validate on every change with the generated zod schema and show the first error next to the
   field (`aria-describedby`), plus a count of errors.
2. THE editor SHALL also apply the store specification client-side (staff contrast ≥ 0.2, plain-text name, built-in
   or defined recipe kinds, 32 KB).
3. WHILE the document is invalid THE preview SHALL keep the last valid template and "Save" and "Publish" SHALL be
   disabled.

### Requirement 4 — Live preview

**User Story:** As a listener, I want to hear the song while I change the look.

#### Acceptance Criteria

1. THE editor page SHALL show the world of the demo song (or the project in `?project=<id>`) with the edited template,
   updated within 500 ms after the last valid change, without restarting the audio and keeping the playback time.
2. Applying a template SHALL reuse the engine entry point used by the director and the store (`WorldHandle`
   template swap); it SHALL NOT add a second code path in the engine.

### Requirement 5 — Save and publish

**User Story:** As a listener, I want to keep my work and share it.

#### Acceptance Criteria

1. WHEN signed in, "Save draft" SHALL call `POST /api/templates` (draft) through `apiFetch` (CSRF); the editor then
   knows the draft id and later saves replace it (`PUT`, see `design.md`).
2. "Publish" SHALL reuse the publish flow of `06-template-store` (thumbnail, rate limit, store specification).
3. WHEN not signed in THE editor SHALL work fully and offer sign-in only when saving; the unsaved document SHALL
   survive the sign-in round trip (`sessionStorage`, wrapped in try / catch).
4. A server rejection SHALL be shown with its `loc` mapped to the field.

### Requirement 6 — Accessibility and quality

1. EVERY control SHALL have a visible label and a visible focus ring; the editor SHALL be usable by keyboard only.
2. THE editor SHALL be a feature folder with a thin page (`frontend.md`): pure `editor-model.ts` (update functions,
   no React), a Zustand store for the draft, components under 150 lines.
3. Property tests: any sequence of editor updates yields a template that either validates or is reported invalid with
   at least one error; updates never mutate their input.

## Requirement 7: Recipe editing (follow-up, phase A5)

1. THE editor SHALL list the template's recipes (≤ 16) and let the user add one, remove one and rename one.
2. WHEN a recipe is renamed or removed THE editor SHALL rewrite every `recipe:<name>` reference in mappings, zones and
   scenery (a removed recipe becomes `crystal`), so the draft stays valid.
3. EACH recipe SHALL expose its parts (1–8) with the fields their operation uses, `footprint`, `heightScale` and the
   triangle budget, every number clamped to the schema bounds (`shape.py`).
4. THE editor SHALL show the triangle count of each recipe against its budget and report `recipeBudget` when it is
   exceeded; duplicate or invalid names report `recipeName`. The names follow `^[a-z0-9_]{1,40}$`.
5. THE preview SHALL show the edited recipe live (same swap as the other sections).
6. ALL labels SHALL come from the locale files (en, fr, mg); controls are keyboard operable and labelled.
