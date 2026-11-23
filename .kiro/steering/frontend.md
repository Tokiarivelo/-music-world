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
- **UI**: Tailwind CSS, mobile-first (`sm: md: lg:`), checked at 375, 768 and 1280 px. Dark theme by default using the
  palette tokens of the default template (`--mw-bg`, `--mw-primary`, `--mw-accent`, `--mw-secondary`).
- **Accessibility**: every control has a label; player controls work with the keyboard (space = play/pause,
  arrows = seek ±5 s).
- **Text**: English only; user-facing strings live in the feature's `consts/`.
