# I1 — Way back from `/play/{id}`

## Goal

"When I am on `/play/{id}` I have no way to go back to the file upload." A listener must be able to leave the world,
analyse another song, or reach the home page and the store, from the play page (demo and project), on desktop, phone
and in VR.

## Current state

- `/play/demo` and `/play/[projectId]` render `DemoPlayback` / `ProjectPlayback` with the world full height and the
  `PlayerBar` (play, seek, director, template actions). There is no link to `/`, `/upload` or `/templates`.
- The root layout has no header (`app/layout.tsx`), so no page has navigation; the browser back button is the only way.
- Navigation controls of `08-navigation-mode` sit top-right of the canvas, the player bar covers the bottom edge.

## Requirements

1. THE play pages SHALL show a compact top-left bar with: a "Home" link (logo), "New song" (→ `/upload`), "Templates"
   (→ `/templates`). The bar SHALL NOT overlap the navigation controls (top-right) or the player bar (bottom).
2. THE links SHALL be real `<a>` elements (Next `Link`), keyboard reachable, with visible focus rings, and the bar a
   `<nav aria-label>`.
3. WHILE a song plays, leaving the page SHALL stop the audio and dispose the world (no leak, no second `World.create`).
4. ON a phone the bar SHALL collapse to one icon button (menu) that opens the same three links.
5. IN VR the spatial panel SHALL get an "Exit VR" button (already: Enter/Exit) and, after exiting, the 2D bar is
   visible again. No navigation inside VR (a page change would end the session).
6. THE labels SHALL come from the locale files (phase I3); until then from `PLAYER_TEXT`.
7. An unsaved edit (future template editor `09`) SHALL ask for confirmation before leaving (`beforeunload`), only when
   the document is dirty.

## Design

- Shared `features/navigation/components/SiteNav.tsx` (thin, no state), used by the play pages and reusable on the
  other pages later. Placed by the page, not by the world canvas, so the canvas stays full-bleed (I2).
- Z-order: canvas (0) < nav + controls (10) < player bar (20) < modals (50).
- `useEffect` cleanup of `WorldCanvas` already disposes the world; add a test that unmounting twice and remounting
  creates one world.

## Tasks (one commit each)

1. `SiteNav` component + text constants + Testing Library tests (links, labels, focus, collapse).
2. Add it to both play pages; layout with controls and player bar; test no overlap with a bounding-box check in
   headless Chromium.
3. Unmount / remount test and audio stop; README "pages" list.

## Verification

Vitest for the component; Playwright screenshot at 1280×720 and 390×844; manual: play, click "New song", upload page
opens, audio stopped.
