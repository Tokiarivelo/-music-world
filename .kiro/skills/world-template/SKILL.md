---
name: world-template
description: Create, edit or review a Music World template (palette, terrain, staff, shapes, mappings, fx) and check that the default neon-nocturne template stays faithful to assets/reference-image-original.png. Use when authoring store templates, the default or Halloween template, or when a rendered world does not look like its template.
---

# World template

Rules: `product.md` (default look), `tech.md` (templates are data). Contract: `music-world.template.v1`.

## Authoring

1. Start from `apps/web/src/templates/default/neon-nocturne.json`; give a new kebab-case `id`, a `name`, a `license`
   from the allowed list.
2. Only use enum values from the schema; colors as `#rrggbb`; mappings evaluated in order (first match wins) — put the
   most specific rules first and end with a catch-all.
3. Validate: `pnpm -C apps/web exec vitest run src/templates` (zod, see `neon-nocturne.test.ts`) and
   `cd apps/api && uv run pytest tests/unit/test_template_schema.py` (pydantic) — the API validates again on publish.
4. Preview on `/play/demo?template=<file or id>` and capture a screenshot at the default isometric camera.

## Default look checklist (neon-nocturne vs reference image)

- [ ] Isometric camera; square dark plate (`#1a1533`) with glowing cracks; low mountains on the edges.
- [ ] Five glowing white-cyan staff lines crossing the plate diagonally with a soft curve; treble clef at both ends.
- [ ] White glowing note glyphs (quarter, eighth, beamed sixteenth) with halo, sliding toward the playhead.
- [ ] City on the left side: lit buildings + equalizer spikes, gradient violet `#b04cff` → magenta `#ff4fd8` → cyan `#22d3ee`.
- [ ] Curved light arcs around the staff; floating particles; bloom present but not washing out the notes.
- [ ] Background near-black blue `#07051a`.
Compare side by side with `assets/reference-image-original.png`; list every mismatch and fix the template (or the
engine if the template cannot express it).

## Store submission review

- No external URLs, no scripts, assets only as recipes or validated GLB under the triangle budget.
- Renders the demo song at ≥ 72 fps on Quest 3 (use `xr-verify`).
- Thumbnail generated; license set.
