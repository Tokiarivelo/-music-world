---
inclusion: fileMatch
fileMatchPattern: "apps/web/src/**"
---

# Web app architecture (`apps/web`, Next.js App Router)

## Layout

```text
apps/web/src/
├── app/                      # routes only — thin pages that compose feature components
├── features/<feature>/       # upload | player | world-view | director | template-store | template-editor | auth
│   ├── components/           # one component per file, no inline sub-components
│   ├── hooks/                # one hook per file
│   ├── store/                # Zustand store owned by this feature (only if needed)
│   ├── api/                  # typed API calls for this feature (validated with zod)
│   ├── consts/               # <feature>.consts.ts — no magic values in components
│   ├── interfaces/           # feature-specific types
│   └── index.ts              # barrel: the only import surface for other features
├── engine/                   # framework-free world engine (see tech.md)
├── xr/                       # IWSDK systems/components, ShapeRecipe builder (see xr-iwsdk.md)
├── templates/                # generated zod + default templates
└── lib/                      # api client, env, utils shared by several features
```

## Rules

- **Thin pages**: `app/**/page.tsx` composes feature components; no fetching, hooks or logic there.
- **Barrel imports only** across features: `import { PlayerBar } from '@/features/player'`, never a deep path into
  another feature.
- **No global `hooks/` or `store/`**. A store is shared only when two features really need it (then it lives in the
  feature that owns the data and is exported from its barrel).
- **3D stays out of React**: React mounts `features/world-view/components/WorldCanvas.tsx`, which calls
  `xr/world-host.ts`. React never renders Three.js objects (no React Three Fiber). Communication React ↔ world goes
  through a small typed command API (`world.setTemplate`, `world.seek`), not shared mutable objects.
- **Server/client split**: components that touch `window`, Web Audio or IWSDK are client components; the world is
  loaded with `dynamic(..., { ssr: false })`.
- **Secrets**: the web app never sees LLM keys; it calls `/api/*` only.
- **UI**: follow the skill `design-system` (tokens, recipes, checklist) for every screen; Tailwind CSS, mobile-first (`sm: md: lg:`), checked at 375, 768 and 1280 px. Dark theme by default using the
  palette tokens of the default template (`--mw-bg`, `--mw-primary`, `--mw-accent`, `--mw-secondary`).
- **Full-screen world**: `WorldCanvas` is `fixed inset-0` (overlays are absolute children, using
  `env(safe-area-inset-*)`); the host resizes the renderer with a `ResizeObserver` (pixel ratio capped at 2) and feeds
  the aspect to the cinematic camera (`cinematicDistance(aspect)`, 16:9 framing unchanged). Nothing may leave a flat
  `palette.background` area: the environment (`xr/views/environment-view.ts`, ≤ 6 draw calls, ≤ 5 k triangles, no
  texture) surrounds the plate. After touching the scene, camera or layout run `node apps/web/scripts/blank-ratio.mjs`
  (needs `next dev` on 3125): it must report ≥ 99 % filled at 16:9, 21:9, 4:3, 1:1 and 9:16.
- **Accessibility**: every control has a label; player controls work with the keyboard (space = play/pause,
  arrows = seek ±5 s).
- **Text (i18n)**: no literal user-visible text in `.tsx`, `aria-*`, `title`, `placeholder`, metadata or the VR panel.
  Every string is a key in `src/i18n/messages/<locale>/<namespace>.json` (`en` is the source; `fr`, `mg` follow),
  read with `useT('<namespace>')` (client) or `getT` (server). API errors stay codes: `t.error(code)` maps
  `errors.<CODE>` and falls back to `errors.UNKNOWN`. Add a key to `en` first; every locale must have the same keys
  and parameters (`src/i18n/i18n.test.ts`) and `no-literal-text.test.ts` fails on raw JSX text. Code, comments, logs,
  prompts and docs stay English.
