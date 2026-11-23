---
name: xr-verify
description: Verify a Music World XR or rendering change in the IWER emulator and on a Meta Quest — enter VR, controls, sync after pause/seek, draw calls, fps, memory, dispose. Use after any change in apps/web/src/xr, the engine rendering path, templates or shapes, and before a demo or deployment.
---

# XR verification

Rules: `xr-iwsdk.md`, `tech.md` (performance budget).

1. **Desktop**: `next dev --experimental-https`; open `/play/demo`. Check the default look against the reference
   (see `world-template` checklist).
2. **IWER** (dev mode installs it): click Enter VR; Play mode; Left Shift + WASD to move; toggle hands vs controllers;
   check the diorama is at table height in front of the user and the spatial panel works (play/pause, seek, template).
3. **Sync**: play 10 s, pause, seek back 5 s, resume — notes and structures must match exactly (no duplicate or
   missing structures). Seek to the end and to 0.
4. **Budget** (log once per second in dev): `renderer.info.render.calls` < 100, triangles, `renderer.info.memory`
   (geometries/textures stable over time — no leak after 3 seeks and a template switch).
5. **Quest**: open the HTTPS dev or deployed URL in Quest Browser (same network, accept the certificate), Enter VR,
   check ≥ 72 fps (Quest Browser performance HUD or `metavr` tooling if installed), pinch threshold, readability of
   note glyphs at 1 m.
6. **Dispose**: navigate away and back 5 times; no WebGL context warnings in the console.
7. Record results (date, device, fps, draw calls) in the spec `design.md` performance section and in the handoff.
