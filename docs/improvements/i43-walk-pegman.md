# I43 — Walk pegman (Superman landing)

Problem: in walk mode the viewer could end up inside a building with no idea where they stood.

- The Walk button carries the pegman icon. A click toggles the walk mode as before; press and move (> 6 px) drags the
  little person over the 3D world. The view does not change during the drag.
- On release over the canvas, the pointer is cast onto the ground (`scene.groundAt`), the walk mode starts and the
  camera dives from the sky onto that spot (`LANDING_SEC` 1.8 s, `landingCamera`), facing where the explore camera
  looked. Input is ignored until it has landed; reduced motion lands at once. The spot is pushed out of structures.
  A release over the sky does nothing.
- Icons on the Explore, Walk and reset buttons (`NavIcons.tsx`).
- Code: `NavigationController.landAt()`, `WorldHandle.landAt()`, `walk-camera.ts` `landingCamera`.

## Memory and map

- A click on Walk resumes where the walker was left (`lastWalkPose`); "Back to start", a new world or the dome reset it.
- A map (`WalkMap.tsx`, bottom left) shows while walking and while the pegman is dragged: streets (city grid) or roads,
  lakes, structures and the walker with its view cone (`walk-map.ts`). Drop the pegman on it, or click it, to land there.

## Whole world, solid objects

- The walkable area was the plate only until the host refreshed the world size (stale on the first landing and on the
  map): it is now refreshed first, and `WALK_MARGIN_M` is 60 m past the edge, over the city or the sea.
- `obstaclesAt` now blocks every spot a city note owns (`siteFrom..siteTo`, built one after another, so the houses and
  trees after the first were walkable), with the building variant footprint, and takes cars, bicycles and ground
  animals at their position at `t` (`crowdPosesAt`, refreshed 5 times a second) instead of where they landed.
  Fliers and objects that left are ignored. Lakes are not obstacles.

## I44 — Water, building variety

- City lakes animate (`shapes/water-material.ts`, `water-store.ts`): a swell and glints, and rings spreading from the walker's feet.
  The sea of the reef worlds is not animated yet.
- Nine building types (villa, warehouse, twin tower and pagoda added; `house-shapes.ts`, `engine/city.ts`), 18 facade colours with a
  per-building light/warm jitter. Four more building meshes: city draw calls 11 → 15 (check on Quest).
- Object editor: spec `12-object-editor`, not started (open question 17).
