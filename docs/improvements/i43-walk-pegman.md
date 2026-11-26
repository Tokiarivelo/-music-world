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
