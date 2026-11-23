# Implementation Plan

- [x] 1. Create this spec from `PROJECT.md` §7, `xr-iwsdk.md` and the `xr-verify` skill.
  - _Requirements: all_
- [x] 2. (7a, P0) Enter / exit VR: hand tracking optional feature, session state to the 2D button, desktop pose
  restored; anchor group; tabletop placement (pure `tabletopPose`, `yawFromQuaternion`) on session start.
  - _Requirements: 1.1–1.5, 2.1, 2.2, 2.4_
- [x] 3. (7a, P0) Playback in VR: `WorldControls` from the player, controller command map (A/X toggle, thumbstick
  seek, squeeze recenter), `XRControlSystem`; IWER check script (enter VR, placement, toggle, seek, `renderer.info`)
  and multiview shader check.
  - _Requirements: 2.3, 3.1–3.5, 6.4, 7.1_
- [ ] 4. (7b, P1) Spatial panel: UIKitML markup, `PanelUI` entity on the anchor, time / progress, play, restart,
  seek ±10 s, template picker, recenter, exit VR; hidden on the desktop.
  - _Requirements: 4.1–4.5_
- [ ] 5. (7b, P1) Hand pinch: `PinchGesture` (0.75 / 0.6 hysteresis), left-hand pinch toggles play unless the panel
  is hovered; IWER check with hands.
  - _Requirements: 5.1–5.3_
- [ ] 6. (7c, P1) Performance pass in IWER (draw calls with panel and controllers, frame time, memory after seeks and
  a template switch), steady-state allocation review; record numbers and the Quest 3 human steps.
  - _Requirements: 6.1–6.4, 7.2_
