# I34 — One big world: horizon objects, scale, sky, aurora

- Explore / cinematic in the dome world now see the big world (plate 80 m, landscape 330 m radius): the diorama orbit
  pose is mapped to it by `viewToWorld` (`xr/scale.ts`, `VIEW_SCALE` = plate width ratio), and the fog reach follows the
  camera distance (`scaleStore.fogBoost`), never past the edge of the ground. Walk and VR are unchanged.
- `HorizonView` (`xr/views/horizon-view.ts`): up to 720 instances of the static kinds of the template's scenery (trees,
  conifers, bushes when it has none; corals, kelp and the rest of the reef for Nemo, swimmers floating) in forest-like
  clumps around the plate, so objects stand on every horizon. Unlit, one draw call per kind (8 at most), static.
- Realistic sizes in the big world (`KIND_FOOTPRINT` / `KIND_HEIGHT`): tree 3.5-5 m wide, car 4 m, plane 7 m, cloud 11 m.
  Clouds drift slower and higher (28-45 m), planes fly at 45-70 m; the dome sky draws 36 cloud puffs (was 90) and the
  Living City asks for 3 clouds and 2 planes at the start, and only loud vocals / very high loud notes add more.
- Northern lights: the five staff ribbons were 4 gaps tall at 1.6 glow and stacked into one white blob. They are now
  1.7 gaps tall at 0.75 glow and the three sky curtains 0.55, so the lines and the note glyphs stay readable.

## Follow-up: trees, sun, hills, aurora, walk lens

- Trees: horizon foliage is tinted to deep, varied greens (lime to forest, blue-green conifers, olive bushes, the odd
  autumn tree) and each instance varies in width and height (`foliageTint` in `horizon-view.ts`).
- Sun: it crawls (about 70 degrees of azimuth over the song) instead of racing across the sky in a minute. Day: bright
  sun rising and falling; sunset: a big orange sun sinking toward the horizon; night: a small cool moon. A sharp disc
  sits inside the soft glow.
- Hills: the ring "walls" are replaced by a polar height field (`hillsGeometry`): flat where it meets the ground, gentle
  rolling near the plate, mountains far away, baked slope light, no vertical edge.
- Aurora: three full-circle curtains (`buildRingGeometry`, patches of light with dark gaps) fill the whole horizon, on
  top of the three curtains over the plate. The shader variable `patch` is reserved in GLSL: it is `lightPatch`.
- Walk lens: 72 degrees (was the 20 degree tele lens of the diorama), so Walk is an immersive view like VR.
