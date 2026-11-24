# Implementation Plan

- [x] 1. Create this spec from the `mitsinjo-grid` `/simulation` viewport (read-only reference), `xr-iwsdk.md`,
  `frontend.md` and `07-xr-mode`.
  - _Requirements: all_
- [x] 2. Pure camera math `xr/navigation/orbit-camera.ts`: `OrbitPose`, `poseToCamera`, `cinematicPose`, `orbit`,
  `pan`, `zoom`, `fly`, `clampPose`, `approachPose`, `VIEW_PRESETS`; unit + property tests (clamps hold after any op
  sequence, camera above the plate, cinematic pose = `desktopCameraPose()`).
  - _Requirements: 1.1, 2.2, 2.3, 3.1, 4.1, 4.4_
- [x] 3. Input: `NavigationInput` reducer (one / two pointers, wheel, keys, blur), `isEditableTarget`,
  `bindNavigationInput` DOM binding (touch-action, context menu, wheel, unbind); tests.
  - _Requirements: 2.1, 2.4, 2.5, 3.1, 3.3, 3.5, 6.3_
- [x] 4. `NavigationSystem` + `WorldHandle` commands (`setCameraMode`, `setViewPreset`, `resetView`,
  `onNavigationChange`); XR gating; reduced motion; listeners removed on dispose; tests.
  - _Requirements: 1.1–1.3, 1.5, 4.2–4.4, 5.1, 5.3, 6.1, 6.2_
- [ ] 5. UI: `NavigationControls` (Explore toggle, presets, reset, hint) and `useNavigationShortcuts` (N, R, 1–4) in
  `features/world-view`, hidden in VR; Testing Library tests.
  - _Requirements: 1.2, 1.4, 3.2, 3.3, 3.4, 4.1–4.3, 5.2_
- [ ] 6. Verify in headless Chromium (screenshots, draw calls) and with `xr-check.mjs`; record in `design.md`
  § As built; README, `PROJECT.md` §7, roadmap.
  - _Requirements: 5.4, 6.2_
