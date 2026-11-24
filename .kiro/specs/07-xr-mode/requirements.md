# Requirements Document

## Introduction

Make the Music World playable in a Meta Quest 3 through WebXR (`PROJECT.md` §7, `xr-iwsdk.md`, skill `xr-verify`).
The world engine and the default look already render the diorama on the desktop (`03-world-engine-core`,
`04-default-template`). This spec adds the immersive session, the tabletop placement of the plate, playback control
from controllers and hands, a spatial panel and the Quest performance check. The audio clock stays the only time
source in VR: the headset changes the camera and the input, never the timing of the world.

Priorities follow `docs/roadmap.md` Phase 7: requirements 1–3 and 7 are **P0** (7a), 4–5 are **P1** (7b), 6 is
**P1** (7c, the Quest measurements need a human with a headset).

## Requirements

### Requirement 1 — Enter and exit VR

**User Story:** As a listener with a Quest, I want an "Enter VR" button on the play page so that I can step into my
song's world.

#### Acceptance Criteria

1. WHEN the browser supports `immersive-vr` (Quest Browser, or the IWER emulator in development) THE play page SHALL
   show an "Enter VR" button above the world.
2. WHEN the button is pressed THE world SHALL request an `immersive-vr` session with the `local-floor` reference space
   through `world.launchXR()`; hand tracking SHALL be requested as an optional feature.
3. WHILE the session is active THE 2D button SHALL read "Exit VR" and end the session with `world.exitXR()`.
4. WHEN the session ends THE desktop camera pose and the desktop diorama placement SHALL be restored.
5. Entering or leaving VR SHALL NOT pause, restart or seek the song, and SHALL NOT rebuild the spawn plan.

### Requirement 2 — Tabletop diorama placement

**User Story:** As a listener in VR, I want the world on a virtual table in front of me so that I can walk around it.

#### Acceptance Criteria

1. WHEN a session starts THE plate (≈ 1.5 m wide) SHALL be placed in front of the user's head at table height
   (plate top ≈ 0.85 m above the floor), at a fixed distance from the head along its horizontal forward direction,
   rotated so its front edge faces the user.
2. Placement SHALL use only the head's horizontal position and yaw (pitch and roll ignored), and SHALL be computed by
   a pure, unit-tested function.
3. WHEN the user presses the recenter control THE plate SHALL be placed again in front of the current head pose.
4. THE plate SHALL not move by itself during the session (the user walks around it).

### Requirement 3 — Playback control in VR

**User Story:** As a listener in VR, I want to play, pause and seek without removing the headset.

#### Acceptance Criteria

1. WHEN the A or X controller button is pressed THE song SHALL toggle between play and pause.
2. WHEN a thumbstick is pushed left or right THE song SHALL seek −5 s or +5 s (edge-triggered: one seek per push).
3. WHEN a squeeze (grip) button is pressed THE plate SHALL be recentered (requirement 2.3).
4. VR commands SHALL go through the same player as the 2D player bar (one `AudioPlayer`, one clock), so the 2D bar
   shows the same state after leaving VR.
5. After pause, seek and resume in VR, notes and structures SHALL match the desktop state at the same `t`
   (`worldStateAt(plan, t)` unchanged).

### Requirement 4 — Spatial panel (P1)

**User Story:** As a listener in VR, I want a floating control panel so that I can see the time and change the song
position and the template.

#### Acceptance Criteria

1. IN VR a UIKitML `PanelUI` panel SHALL float above the front edge of the plate, tilted toward the user, and follow
   the plate when it is recentered; it SHALL be hidden on the desktop (the 2D player bar is used there).
2. THE panel SHALL show the song title, play/pause, restart, seek −10 s / +10 s, the current time / duration and a
   progress bar driven by the audio clock.
3. THE panel SHALL list the available templates (template picker); selecting one SHALL rebuild the world with that
   template at the current song time, without stopping the song.
4. THE panel SHALL offer "Recenter" and "Exit VR".
5. Panel buttons SHALL respond to controller rays (trigger), hand rays (pinch) and poke.

### Requirement 5 — Hand pinch (P1)

**User Story:** As a listener using hand tracking, I want a pinch gesture to play or pause.

#### Acceptance Criteria

1. Pinch SHALL be detected from the hand's pinch strength (0 = open, 1 = closed) with a press threshold of 0.75 and a
   release threshold of 0.6 (hysteresis); the press threshold SHALL never be 0.5 or below.
2. A pinch of the left hand SHALL toggle play/pause, unless a pointer is hovering the spatial panel (then the pinch is
   a panel click).
3. Pinch detection SHALL be a pure, unit-tested state machine.

### Requirement 6 — Performance in VR (P1)

**User Story:** As a listener on a Quest 3, I want a smooth world.

#### Acceptance Criteria

1. IN VR (panel shown, controllers or hands visible) THE world SHALL stay under 100 draw calls per view.
2. THE XR systems SHALL not allocate per frame in their steady state (reuse vectors) and SHALL not mark instance
   buffers dirty when nothing changed.
3. ON a Quest 3 the demo song SHALL run at ≥ 72 fps; the session SHALL request 90 Hz only once this holds (human
   check, recorded in `design.md` § Performance).
4. Custom shaders (building windows, glyphs, halos) SHALL compile and render in multiview stereo (super-three
   `multiviewStereo`, used by IWSDK on the Quest).

### Requirement 7 — Verification

**User Story:** As a developer, I want a repeatable XR check without a headset.

#### Acceptance Criteria

1. A headless Chromium script SHALL enter VR in IWER on `/play/demo`, check the plate placement, toggle play/pause and
   seek from emulated controllers, and read `renderer.info` in VR.
2. Results (date, device, draw calls, frame time, fps when measurable) SHALL be recorded in `design.md` and the
   handoff; checks that need a Quest SHALL be listed as human steps.
