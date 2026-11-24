---
inclusion: fileMatch
fileMatchPattern: "apps/web/src/xr/**"
---

# IWSDK / WebXR guidance (applies to `apps/web/src/xr/**`)

- Verify every IWSDK API against the current official docs (developers.meta.com, IWSDK guides) before using it.
  IWSDK evolves fast; do not rely on memory for API names.
- Package: `@iwsdk/core` (re-exports xr-input and locomotor). The old `@meta-quest/iwsdk` package is obsolete.
- Components: `createComponent(name, schema, description)`. Systems: `class X extends createSystem({ query: { required: [C] } })`
  with `update(delta)`. Entities with meshes: `world.createTransformEntity(object3D)`.
- Systems must read time from the audio clock passed in (`AudioClock.now()`), not from `delta` accumulation,
  so that pause and seek stay exact.
- Render notes and structures with one `InstancedMesh` per shape kind. Update instance matrices and colors from
  `worldStateAt(plan, t)` each frame; set `instanceMatrix.needsUpdate = true` only when something changed.
- The world plate in VR defaults to the **immersive scale** (I7): 80 m wide, its top is the floor, the viewer starts 10 m inside
  its near edge (eye at the tracked head height, 1.6 m on desktop). B / Y switches to the tabletop diorama (~1.5 m, in front of
  the user at table height). Scale is view state in `xr/scale.ts` (`scaleStore`): never put it in `worldStateAt` or the plan.
  Locomotion moves the plate around the head (`xr/locomotion.ts`): left stick glide ≤ 2 m/s, right stick 30° snap turn.
- Spatial UI: UIKitML `PanelUI` for play/pause, timeline and template picker.
- Hand pinch threshold ≈ 0.7–0.8; never 0.5.
- HMR can break XR sessions: do a full reload if the scene goes black after a hot update.
- Use `xrSession.requestAnimationFrame` semantics via IWSDK's loop; never `window.requestAnimationFrame` inside XR.
