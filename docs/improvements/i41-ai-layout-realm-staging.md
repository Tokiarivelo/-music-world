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

- **The director also lays out cities and the demo.** A city layout has no patches: its `sequence` is the mix of
  buildings, trees, cars and so on that the notes become, in order (`patch` is optional on a step). The demo song asks
  `POST /api/director/layout/demo` (the shipped analysis only). With a layout, every grounded note follows the sequence,
  whatever its rule gave it; swimmers and giants keep their rule.
- **Wider reefs and realms.** A world with grounded objects spans twice its plate (`GROUNDED_SPAN`, capped at 48 m).
- **Street traffic** (`engine/traffic.ts`, replaces the ring boulevards in cities). Cars and bicycles follow closed routes
  on the street grid, in the right-hand lane, turning right at rounded corners; they stop at the stop line on red (and on
  yellow when they can still stop), keep their distance to the vehicle ahead and brake smoothly. The signals are real:
  green 8 s, yellow 2 s, red, one street after the other with a 1 s all-red gap, each crossing with its own phase
  (`signalColor`, 22 s cycle; the lamps in `city-view.ts` use the same function, poles stand on the right of the road
  past the stop line). The song is simulated once per plan in 0.1 s steps into a table of poses, so a seek lands
  exactly where playing would have been. Vehicles are shown once the growing city has reached their route.
  The elliptical boulevards, their flyovers and tunnels are gone in cities: the only bridges are those that carry a
  street over a lake, on the grid. Cars and trees are smaller in a city (`CITY_FOOTPRINT`: a car fits its lane and is
  smaller than a house). The hills of a daylight city are grassy; any template's hills keep a readable luminance.
- **Rainbow notes** colour their glyph while they fall (also outside the aurora), so the object they touch is no surprise.

## Limits

- Non-city templates that drive vehicles (scenery cars) keep the elliptical roads with flyovers and tunnels.
- Traffic does not model priorities at crossings other than the lights and the distance to the vehicle ahead, and
  vehicles only turn right (closed loops).
- Playlist entries stay in one browser.
