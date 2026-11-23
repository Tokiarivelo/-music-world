---
name: new-web-feature
description: Scaffold or extend a feature-first module in apps/web/src/features (components, hooks, store, api, consts, interfaces, barrel) following Music World frontend rules. Use when adding UI such as upload, player, world-view, director, template-store, template-editor or auth.
---

# New web feature

Rules: `.kiro/steering/frontend.md`, `coding-standards.md`.

1. **Name** the feature in kebab-case; check `apps/web/src/features/` that it does not already exist.
2. **Create** only the folders you need:
   ```text
   features/<feature>/
   ├── components/<Name>.tsx      # one component per file
   ├── hooks/use-<name>.ts        # one hook per file
   ├── store/<feature>.store.ts   # Zustand, only if the feature owns client state
   ├── api/<feature>.api.ts       # fetch /api/* + parse with generated zod schemas
   ├── consts/<feature>.consts.ts # strings, numbers, keys — English
   ├── interfaces/<feature>.types.ts
   └── index.ts                   # barrel: export only what other features/pages need
   ```
3. **API calls**: go through `src/lib/api-client.ts`; validate every response with the generated zod schema;
   map error codes to messages in `consts/`.
4. **Page**: add or edit `src/app/<route>/page.tsx` so it only composes components imported from the barrel.
5. **3D**: never render Three.js in React. If the feature affects the world, call the typed command API exported by
   `features/world-view` (e.g. `useWorldCommands()`), which talks to `src/xr/world-host.ts`.
6. **UI**: Tailwind mobile-first; palette CSS variables (`--mw-*`); keyboard access; check 375 / 768 / 1280 px.
7. **Tests**: Vitest + Testing Library for hooks and interactive components (`__tests__/` next to the code).
8. **Docs**: `README.md` if the feature is user-visible; spec task ticked; handoff updated.
9. Run `pnpm -C apps/web exec vitest run src/features/<feature>` and `pnpm -C apps/web typecheck`.
