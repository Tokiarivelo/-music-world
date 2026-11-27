# Archived session 2026-11-26 (phase I51)

## 2. Last session (2026-11-26, Claude Code, phase I51 `phase-I51-workspace-limits`)

- Lifted the three limits of the object workspace (phase I50, spec 12 phase 7):
  multi-selection (shift / ctrl click, box select with shift + drag or the select tool, `A`), re-parenting (outliner drag and
  drop, "Parent" list, world pose kept), and a scale gizmo that scales a part with its children (`scaleGroupBy`).
- The inventory now has an "Added by the world" list (`engineObjects`): the nine city building variants (real thumbnails),
  construction, streets, lakes, bridges, traffic lights; reef and realm patch themes. Read-only.
- Pure maths in `lib/gizmo-math.ts` (`applyGizmoDelta`, `reparentNode`) and `lib/node-model.ts` (`effectiveRoots`,
  `canReparent`, `scaleGroupBy`) with tests; `ThumbCanvas` shared by object and engine thumbnails. i18n en/fr/mg.
- Checked in headless Chromium: shift + drag box select ("6 parts selected"), engine list with thumbnails, Parent list.
- Limits: engine objects are not editable (code, not recipes); box select uses part centres; mirror / array act on the
  primary part only. The gizmo drag itself was not scripted in the browser (covered by the pure tests).
- Checks: see section 1.
