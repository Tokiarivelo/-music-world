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

## Follow-up: zoom out and notes in the aurora

- Zooming out in the big world took the camera outside the sky dome: the dome showed as a black ball and the ground as a
  sand ring. Camera poses are now capped at 4.2 diorama metres (224 m) while the world is big (`NavigationController.maxDistance`,
  set by the host); the diorama keeps 9 m.
- Northern lights: the ribbon of each staff line wears the aurora color of the notes on it (`auroraColor`, treble staff:
  E4 to F5 from green through cyan to violet) and the note halo is reduced to 30 %, so the notes are points of the aurora
  and not blobs.

## Follow-up: traffic that steers, notes that move in time, aurora that follows the notes

- Cars and bicycles (`engine/crowd.ts`): they now steer around every fixed record (buildings, trees, ridges) and around
  each other, always sideways to their heading, so they never back up or shuttle to and fro. The dodge grows
  continuously with the overlap, so it is a smooth curve. Each direction of travel keeps its own lane on the ring road
  (`loopAt`), so head-on cars pass each other. Planes and clouds keep the old push-apart rule.
- Note editor: a drag now also moves the note along the staff in time (50 ms grid); releasing it plants the note at its
  new pitch and onset (`NoteMove.time`, `editStore.ghost.dt`, undoable like any edit). VR rays still change pitch only.
- Northern-lights mode: the notes now hang inside the aurora curtains in the sky (the positions of `engine/sky.ts`,
  height = pitch, drifting with the song time), not on the plate staff. Each curtain glows in a soft knot of its own
  colour around every note that hangs in it (`uNotes`, with a height, in `aurora-curtain.ts`), strongest for the note
  that sounds. Notes are coloured from green (low) to violet (high). A click still picks and plays a sky note; the
  pitch/time drag belongs to the staff and is off in this mode.

## Follow-up: celestial aurora in the sky, scene scale and full-view explore

- Celestial aurora notes in the sky: the aurora path (`skyPath` in `engine/sky.ts`) forms an expansive celestial arc
  high in the sky dome (`SKY_AURORA_HEIGHT_RATIO = 1.15`, 180–240 m above ground), sweeping across the horizon from
  edge to edge. The notes hang inside the aurora curtains in the sky at any camera view and never block the city
  below. The aurora curtain shader (`aurora-curtain.ts`) softly diffuses note lighting with delicate luminous flares,
  keeping the curtains ethereal and translucent without white blowout.
- Natural view perspective: Explore and dome world camera views open to a 52° lens (replacing the flat 20° diorama telephoto),
  giving rich 3D depth and panoramic presence. The overview camera sits at 1.15x cinematic distance, framing the entire
  world without surrounding void.
- Calibrated presence: objects maintain full calibrated volume (`IMMERSIVE_OBJECT_SCALE = 1`), with a 110 m immersive plate.
  Horizon foliage starts right at the plate boundary (`IMMERSIVE_PLATE_M / 2 + 2`), seamlessly integrating city and nature.
- Sky-wide clouds: clouds drift across the entire sky canopy (`halfWidth: half * 3.6`) at 6–11 m plate altitude, and
  airplanes cross from horizon to horizon, populating the full sky rather than clustering in the center.
