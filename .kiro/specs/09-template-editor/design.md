# Design

## Overview

`features/template-editor` (web) + one new API use case (`PUT /api/templates/{id}`, draft update). No new contract:
the document is `music-world.template.v1`.

```text
/editor page (thin) → EditorShell
   ├─ EditorForm (sections: Identity, Palette, Terrain, Staff, Effects, Mappings, Zones)
   ├─ WorldPreview (WorldCanvas + player bar, template from the draft store)
   └─ EditorActions (Save draft, Publish, Reset, Download JSON)
state: useTemplateDraft (Zustand): { source, draft, errors, draftId, dirty }
pure:  editor-model.ts  setPaletteColor / setNumber / moveRule / addRule / removeRule / addZone … (immutable)
       editor-validate.ts  zod parse + store specification (contrast, name, kinds, size) → errors keyed by path
```

## Preview

`WorldHandle` already swaps templates for the director and the store. The preview calls it with the last **valid**
draft, debounced 300 ms; the audio clock is untouched (`worldStateAt` stays pure).

## API addition

`PUT /api/templates/{id}` (owner only, draft only, same body as `POST`, same validation, same rate limit family):
replaces the draft's document. 404 for another user's template (as for the other routes), 409 when already published.
Use case `UpdateDraftTemplate` in `templates/application/use_cases`, repository method `update_document`.

As built (task 1): the use case reuses the existing `repo.save` (no separate `update_document`). It keeps the row id
and recomputes the document id as `<submitted id>-<row suffix>`. A published or hidden template answers 409
`TEMPLATE_NOT_EDITABLE`. The `publish` field of the body is ignored. Rate limit: the publish limiter.

## Errors

Server `TEMPLATE_INVALID` details carry `loc` like `["template","palette","staff"]`; the editor maps them to
`palette.staff`. Unknown paths go to a form-level alert.

## Testing

Pure model: property tests (sequence of updates → valid or ≥ 1 error; inputs not mutated; bounds clamp). Components:
Testing Library on the form (labels, errors, keyboard). API: unit tests for the use case, integration test for
ownership (404 / 409) and validation reuse. Browser: Playwright screenshot of the editor over the demo song.

## As built

- No Zustand (not a dependency of the app): the draft is a small external store (`store/template-draft.store.ts`) read
  with `useSyncExternalStore`, like the palette store. Files: `lib/editor-model.ts`, `lib/editor-validate.ts`,
  `hooks/use-editor-source.ts`, `hooks/use-save-template.ts`, `components/EditorShell.tsx`, page `app/editor/page.tsx`.
- `?from=` accepts a built-in id, a store id or `session`. "Edit a copy" (`EditCopyLink` in `template-store`) opens a
  built-in by id and hands any other template over in `sessionStorage` (`mw.editor.handoff`, `src/lib/template-stash.ts`).
- The unsaved document is kept in `sessionStorage` (`mw.editor.unsaved`) when the signed-out user clicks "Sign in to
  save", restored by the shell and cleared after a save. `sessionStorage` is per tab: a magic link opened in another tab
  loses it (README known limitation).
- Preview: `PreviewPlayback` (player feature) renders one song with the template; a new template only changes the
  `scene`, never the audio player or its clock. The player bar's global keys are off in the editor (`shortcuts={false}`)
  so arrow keys stay with the fields. The world is `fixed inset-0`: the preview section uses `contain: layout paint` to
  become its containing block, otherwise the canvas covers the form.
- Publishing a saved draft is `PUT` (if changed) then `POST /publish`; afterwards the draft id is dropped and the next
  save creates a new draft. `ApiError` now carries the `details` of the error body, mapped to fields with `pathFromLoc`.
- Browser check: `node apps/web/scripts/editor-check.mjs --shots=docs/template-editor` (needs `next dev` on 3125);
  screenshots in `docs/template-editor/`.

## Human checks

None required. Optional: try the editor on a phone and on the Quest Browser 2D page.
