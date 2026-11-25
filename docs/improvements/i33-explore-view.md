# I33 — Explore view and key bindings

- Bug: the dome world (on by default) forced the eye-level scale (80 m plate) in every camera mode, while the explore
  presets are tuned for the 1.5 m diorama: Explore / Overview looked at grass, and leaving Walk landed on grass too.
- Now only Walk and VR use the eye-level scale. Explore (and the cinematic view) always show the whole world as a
  diorama, like the global view of mitsinjo-grid, while Walk is the immersion mode. The dome landscape stays under it.
- The ground tile scales with the plate (`fitGroundTexture`), so the grass keeps its size relative to the notes.
- Keys of Explore: drag orbit, right-drag / Shift-drag pan, wheel or `+` `-` zoom, `WASD` move, `Q` `E` or arrows
  left / right turn, arrows up / down raise / lower the camera (new: they did nothing before), `Shift` faster,
  `1`-`5` views (Horizon had no key; buttons now follow key order), `R` reset, `N` explore, `G` walk.
  Hint texts updated in en / fr / mg.

## Presets raised (follow-up)

The presets sat too low and too close (the plate was cropped, Horizon left the plate at the bottom edge). New poses
(`orbit-camera.ts`): Overview is its own pose (`overviewPose`, 46° and 1.35× the cinematic distance), Staff 40° at 2.2 m,
City 42° at 2.4 m, Top 82° at 6 m, Horizon 16° at 1.6 m on the wide lens. Entering Explore from the cinematic view now
eases up to the Overview; Reset view returns to it. The default cinematic look is unchanged.
