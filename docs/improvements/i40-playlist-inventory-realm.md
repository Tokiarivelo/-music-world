# I40 — Playlist, template choice, world plans and the Enchanted Realm

## What changed

- **Template choice at upload.** The upload form has a "World template" list (Neon Nocturne by default plus the published
  store templates). When the analysis is ready the player opens `/play/<id>?template=<store id>`.
- **My songs (`/playlist`).** Every song a user plays (the demo and uploaded songs) is recorded with its metadata (title,
  duration, key, tempo, template, play count, last played). The list lives in the browser's `localStorage`
  (`mw.playlist.v1`), never on the server, and each entry carries the id of the signed-in user (null for a guest), so a
  page only lists its own songs and no other user can see them. `features/playlist/`.
- **Inventory and world plans (`engine/world-plan.ts`).** `inventoryOf(template)` lists every kind a template can put in
  the world (mappings, scenery, recipes) with a role. `worldPlanKind` picks the plan from it: `city` (buildings), `reef`
  (underwater with seabed life), `realm` (fantasy), `open` (zones, unchanged). A reef or realm plan lays patches over the
  plate (kelp forests, coral gardens, sandy flats, a wreck; or a keep, villages, enchanted forests, crystal fields),
  nearest the centre first, and 40 % of the notes become seabed or ground life of the inventory, built where they land.
  The inventory is derived from the template, so no schema change was needed.
- **Models in cities.** A city template always uses the authored models (cars, trees, bushes) even when its material is
  `flat`, and the procedural fallback is hidden until the model has loaded (no cube flash before the real shape).
- **Enchanted Realm** (`featured/enchanted-realm.json`, store id `…0006`): eight Blender models
  (`scripts/blender/build_fantasy.py`, `make fantasy-models`): castle, wizard tower, mushroom house, giant mushroom,
  crystal cluster, magic tree, dragon, glow flower.

## Limits

- The inventory is derived at runtime, not a field of the template schema; adding it to the schema would mean a Pydantic
  change, regenerated zod files and a director prompt version bump.
- The plan is not written by the director LLM: the director picks the template, the plan is derived from it.
- Playlist entries stay in one browser; a server-side list tied to the account would be needed to follow the user.
