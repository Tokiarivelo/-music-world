# I43 — Walk pegman and map

Problem: in walk mode the viewer could end up inside a building with no idea where they stood.

- Walk mode shows a top-down map of the walkable area (structures as dots, the walker with its view cone).
  Click or drag on it to stand anywhere; the position is clamped to the area and pushed out of structures.
- A pegman button (the little person, as in Street View) next to Walk: press and drag it onto the map to drop the
  walker there. It switches to walk mode when the drag starts.
- Icons on the Explore, Walk, pegman and reset buttons (`NavIcons.tsx`).
- Code: `NavigationController.walkMap()` / `placeWalker()`, `WorldHandle` of the same names, `WalkMap.tsx`.
