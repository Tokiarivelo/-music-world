# 002. i18n: in-house provider with typed JSON catalogs
**Date:** 2026-11-24 · **Status:** Accepted
## Context
Phase I3 needs every UI text in locale files (`en`, `fr`, `mg`), cookie-based locale without a URL prefix, a language
switch that does not interrupt the audio or the world, typed keys, plurals and a bundle under 15 KB.
## Decision
An in-house module `apps/web/src/i18n` (≈ 300 lines, no dependency): `format.ts` (ICU subset: arguments, `plural`,
`select`, `Intl` numbers and plural rules), `resolve-locale.ts` (cookie > `Accept-Language` > `en`), `translator.ts`,
`provider.tsx` (`useT`, `useLocale`), `server.ts` (`getT`, `getLocale`), `LanguageSwitch.tsx`. Catalogs are flat JSON
files per namespace; `catalogs.ts` types every locale against `en`, so a missing key is a compile error.
## Why not `next-intl`
The network is not available in the agent environment, so the dependency could not be installed or evaluated, and the
needs (cookie locale, no prefix, plural, typed keys) fit in a few hundred lines. A switch to `next-intl` later only
changes the module, not the call sites (`t('key', params)`).
## Consequences
- All catalogs of all languages are bundled client-side (a few KB each); switching is instant and does not remount the
  tree. Per-route namespace loading is not done.
- Parameter types are not checked by TypeScript (JSON values are `string`): the parity test checks them instead.
- No quoting in messages: a literal `{` or `}` cannot be written (none is needed).
