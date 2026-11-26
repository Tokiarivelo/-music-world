# I41 — Layout written by the director, staged Enchanted Realm

## What changed

- **Inventory and layout are part of the template schema.** `WorldTemplate.layout` (optional, `music-world.template.v1`)
  holds `inventory` (every kind with its role), `patches` (regions of the plate in normalized -1..1 coordinates, each
  with a theme) and `sequence` (ordered steps: object kind, patch id, weight). `WorldLayout` validates unique patch ids
  and steps that only use known patches. Schemas and zod files regenerated (`make schemas`).
- **The user chooses the template, the AI writes the layout.** `POST /api/projects/{id}/layout` takes the chosen template
  and gives back a `LayoutResult` (`music-world.layout-result.v1`). `DirectLayout` (`director/application/use_cases/`)
  sends the song summary and the template's inventory to the provider chain (prompt `layout-v1`), validates the answer
  (`parse_layout`: unknown kinds and bad patches are dropped) and falls back to a deterministic mock layout
  (`mock_layout`: keep at the centre, villages, forests and crystals outwards; reef themes for underwater templates).
  The same rate limit and spend cap as the world director apply.
- **The engine follows the layout** (`engine/world-plan.ts`): patches come from the layout (scaled to the world), the
  notes walk through the sequence in order (smooth weighted round robin, so a rare object comes back at regular
  intervals), and each object grows inside the patches its steps name. Without a layout the engine derives the same plan
  from the inventory, as in I40, so the world never waits on the network. The web client asks for the layout when a
  project plays a reef or realm template (`useDirectedLayout`), once per project and template.
- **Realm staging.** The castle stands at the centre of the keep and is bigger (`scale` in `model-catalog.ts`); dragons
  fly (`recipe:dragon` is a flying "swimmer" with wing beats, `FLYERS` in `engine/swim.ts`); fairy lights and low mist
  drift over a realm (`xr/views/realm-glow-view.ts`, pure function of the song time).

## Limits

- Cities keep the street plan of `city.ts`; the director's layout only drives reef and realm worlds.
- Notes whose rule already gives a grounded object keep it: the sequence orders the other notes' objects.
- The demo song does not call the director for a layout (no project): it uses the derived layout.
