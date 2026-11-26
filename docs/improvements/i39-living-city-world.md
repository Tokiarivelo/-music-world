# I39 — A complete city that fills the whole world

Templates whose notes make buildings (Neon Nocturne, Living City) no longer stop at a plate in the middle: the music
builds a town over a world four times wider than the plate (`CITY_SPAN` in `engine/city.ts`; objects keep their size,
the walkable area, roads, terrain and horizon follow `worldSize(template)`).

- **City plan** (`engine/city.ts`, pure from seed + size): street grid, blocks cut into lots and gardens, parks, lakes
  with bridges where a street crosses one, traffic lights at crossings (they cycle on the beat), the ring boulevards of
  `roads.ts` (cars, flyovers, tunnels) when the template drives vehicles.
- **Five building types** (`xr/shapes/house-shapes.ts`): tower, house, apartment block, shop, skyscraper, chosen by
  district (core, mid, edge).
- **Built by the music**: lots are ranked from the centre outwards; a note owns a share of the ranking
  (`SpawnRecord.siteFrom/siteTo`) and builds those spots one after another, so a few hundred notes cover the whole town.
  Streets, lakes and lights appear inside `cityFront(t)`, a radius that grows with the song (bright rim on the front).
- **Construction animation** (`structure-view.ts`): foundation slab, floors rising one after another, scaffolding,
  a swinging tower crane for tall buildings, bare concrete turning into the building colour.
- Placement of buildings, trees and bushes bypasses zones and layouts in a city template; needles and hills stand in parks.
- Limits: cars on the boulevards do not stop at the lights (decorative, beat-synced); the horizon tree ring is off in a city.
