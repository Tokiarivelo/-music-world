# Requirements Document

## Introduction

Besides the immersive VR mode (`07-xr-mode`), let a listener on a desktop or a phone explore the 3D world freely on
`/play/demo` and `/play/<id>`. Today the desktop camera is fixed on the isometric "cinematic" pose of the reference
image (`04-default-template` requirement 1). This spec adds a navigation mode: orbit, pan and zoom with the mouse or
touch, keyboard fly, reset view and view presets. The idea comes from the author's own `mitsinjo-grid` project
(`/simulation` viewport: orbit/pan/dolly, camera presets, reset, hand tool, orbit disabled in XR), reimplemented in
Music World's architecture (pure camera math in `src/xr`, one IWSDK system, React only for 2D buttons).

The camera is never part of the world state: navigation changes what the viewer sees, never `worldStateAt(plan, t)`
or the audio clock. Priority: **P1** (roadmap Phase 7, line 7d).

## Requirements

### Requirement 1 — Camera modes

**User Story:** As a listener on a desktop or a phone, I want to switch between the cinematic view and a free
navigation mode so that I can look at the world from anywhere.

#### Acceptance Criteria

1. THE play page SHALL open in the **cinematic** mode: the fixed isometric pose of the default look
   (`desktopCameraPose()`), unchanged by pointer, wheel or keyboard input.
2. WHEN the user presses the "Explore" toggle (or the `N` key) THE world SHALL switch to the **explore** mode,
   starting from the current camera pose (no jump).
3. WHEN the user leaves the explore mode THE camera SHALL return to the cinematic pose.
4. THE toggle SHALL be a labelled button reporting its state (`aria-pressed`), with a visible focus ring.
5. Switching modes SHALL NOT pause, seek or rebuild the world.

### Requirement 2 — Mouse and touch navigation

**User Story:** As a listener in the explore mode, I want to orbit, pan and zoom with the mouse or my fingers.

#### Acceptance Criteria

1. WHILE in the explore mode, a left-button (or one-finger) drag SHALL orbit the camera around its target; a
   right-button, middle-button or Shift + left drag (or a two-finger drag) SHALL pan the target along the ground plane;
   the wheel (or a two-finger pinch) SHALL zoom toward the target.
2. THE pitch SHALL stay within [5°, 85°] above the plate, the distance within [0.35 m, 6 m] and the target within
   0.9 m of the plate centre horizontally, so the camera never goes under the plate or loses it.
3. THE camera math (pose → camera position, orbit, pan, zoom, clamping) SHALL be pure functions with property tests.
4. WHILE in the explore mode THE canvas SHALL not scroll or zoom the page on touch (`touch-action: none`) and the
   context menu SHALL not open on right-drag; in the cinematic mode the page behaves as before.
5. Pointer input on the 2D controls floating above the canvas SHALL NOT move the camera.

### Requirement 3 — Keyboard navigation

**User Story:** As a keyboard user, I want to move the camera without a mouse.

#### Acceptance Criteria

1. WHILE in the explore mode, `W`/`S` SHALL move the target forward / backward and `A`/`D` left / right (relative to
   the view, along the ground), `Q`/`E` SHALL turn the view, `+`/`-` SHALL zoom in / out; Shift SHALL move faster.
2. `N` SHALL toggle the explore mode, `R` SHALL reset the view, `1`–`4` SHALL select the view presets.
3. Navigation keys SHALL NOT fire while the focus is in a text input, a textarea, a select or an editable element,
   and SHALL NOT be used with Ctrl, Alt or Meta.
4. The player keys stay unchanged: space = play/pause, arrows = seek ±5 s.
5. Held keys SHALL be released when the window loses focus.

### Requirement 4 — Reset and view presets

**User Story:** As a listener, I want to jump to useful viewpoints and back.

#### Acceptance Criteria

1. THE explore mode SHALL offer presets **Overview** (the cinematic pose), **Staff** (close-up of the staff),
   **City** (the city side) and **Top** (from above), each a labelled button with `aria-pressed`.
2. Choosing a preset SHALL switch to the explore mode if needed and move the camera to it; moving the camera by hand
   SHALL clear the selected preset.
3. "Reset view" SHALL move the camera back to the Overview pose.
4. Camera moves to a preset or back to the cinematic pose SHALL ease over a short time, and SHALL snap when the user
   prefers reduced motion. The easing uses frame time: it moves only the camera, never a world event.

### Requirement 5 — Coexistence with VR

**User Story:** As a listener with a Quest, I want VR to keep working whatever the camera mode.

#### Acceptance Criteria

1. WHILE an immersive session runs, navigation input SHALL be ignored and cleared, and the navigation system SHALL
   not write the camera (the headset drives it).
2. THE navigation buttons SHALL be hidden during the immersive session.
3. WHEN the session ends THE camera SHALL show the pose of the current mode again (explore pose kept).
4. THE IWER check script (`scripts/xr-check.mjs`) SHALL still pass.

### Requirement 6 — Purity and performance

**User Story:** As a developer, I want navigation not to touch the timing or the budget.

#### Acceptance Criteria

1. Navigation SHALL NOT read or write the audio clock or the spawn plan; `worldStateAt(plan, t)` stays pure.
2. Navigation SHALL add no draw call and SHALL not allocate per frame in its steady state.
3. Input listeners SHALL be removed when the world is disposed.
