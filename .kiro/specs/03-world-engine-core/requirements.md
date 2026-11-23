# Requirements Document

## Introduction

The world engine turns an `AnalysisResult` and a `WorldTemplate` into a 3D world that is a pure function of playback
time. It shows notes on the glowing staff, drops them onto the terrain at their onset and grows structures, matching
the default look of `assets/reference-image-original.png`. The engine core (`apps/web/src/engine`) is framework-free;
IWSDK systems (`apps/web/src/xr`) render its output.

## Requirements

### Requirement 1 — Spawn plan

**User Story:** As a viewer, I want every note to build something, so that the world reflects the music.

#### Acceptance Criteria

1. WHEN a song is loaded THEN the engine SHALL compute a spawn plan once from (analysis, template, seed).
2. Each note SHALL map to exactly one spawn record using the first matching rule of the template's `mappings`.
3. Each chord SHALL produce one group record linking its notes' spawns with a light arc.
4. Spawn positions SHALL lie inside the zone defined by the template for that shape kind, and SHALL be derived from
   pitch and the seeded PRNG only.
5. THE plan SHALL cap total instances per shape kind at the template budget (default 2 000); notes above the cap
   SHALL reuse the oldest instance slot.

### Requirement 2 — World state as a function of time

**User Story:** As a viewer, I want pause, resume and seek to always show the right world.

#### Acceptance Criteria

1. `worldStateAt(plan, t)` SHALL depend only on `plan` and `t`.
2. FOR ALL `t`, calling `worldStateAt` after any sequence of other calls SHALL return the same result as a fresh call.
3. FOR ALL `t1 ≤ t2`, the number of spawned structures at `t2` SHALL be ≥ the number at `t1`.
4. WHEN the same analysis, template and seed are used THEN the plan and every state SHALL be identical.

### Requirement 3 — Staff and notes

**User Story:** As a viewer, I want to see notes on a glowing staff like the reference image, then watch them fall.

#### Acceptance Criteria

1. THE staff SHALL be 5 glowing lines along the template path (default: diagonal soft curve across the plate) with a
   treble clef at both ends.
2. A note SHALL appear at the far end of the staff `lookahead` seconds before its onset, at the vertical position of
   its pitch, and slide to the playhead.
3. AT its onset a note SHALL leave the staff and fall to its spawn point in `fallDuration` seconds (default 0.35 s).
4. Note glyphs SHALL use Bravura (quarter, eighth, sixteenth by duration relative to the beat).
5. WHEN a note reaches the terrain THEN its structure SHALL grow over `max(0.2, duration)` seconds, with height and
   emissive intensity scaled by velocity.

### Requirement 4 — Default look

**User Story:** As a viewer, I want the default world to look like the reference image.

#### Acceptance Criteria

1. THE default template SHALL render a dark cracked terrain plate with low edge mountains, an isometric camera, a city
   of buildings and equalizer spikes on the left side, light arcs, particles and bloom, using the default palette.
2. WHEN a kick onset occurs THEN the terrain cracks SHALL pulse with light.

### Requirement 5 — Performance and sync

1. THE renderer SHALL use one `InstancedMesh` per shape kind and stay under 100 draw calls with the demo song.
2. THE rendered state SHALL be computed from `AudioClock.now()` every frame; the visual onset SHALL be within one
   frame of the audio onset.
3. THE scene SHALL hold ≥ 72 fps on Meta Quest 3 and 60 fps on an integrated-GPU laptop with the demo song.
