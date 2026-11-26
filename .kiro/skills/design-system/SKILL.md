---
name: design-system
description: The current Music World UI design system — tokens, page layout, buttons, cards, forms, alerts, overlays over the 3D world, focus, responsive and i18n rules — so every agent builds screens that look like the existing app. Use before creating or restyling any page or component in apps/web (features, pages, overlays, the editor, the store, the moderation queue), and when reviewing UI.
---

# Design system

Single source for how the web UI looks **today**. It is extracted from the shipped code; when you change the look,
update this file in the same change (see "Keeping it current"). Rules: `frontend.md` (UI, a11y, i18n), `product.md`
(default look of the 3D world). The 3D world itself is data (templates), not styled here.

## Principles

1. Dark first: near-black blue page, translucent white surfaces, neon accents. No light theme.
2. The palette comes from CSS variables, never hard-coded hex in components.
3. Mobile first (`sm: md: lg:`), checked at 375, 768 and 1280 px. No horizontal scroll.
4. Text only through i18n (`useT`), never literal strings in `.tsx` (en, fr, mg catalogs).
5. Every control is keyboard reachable, labelled and shows a visible focus ring.
6. Reuse an existing component before adding a new one; copy the class recipe below, do not invent a variant.

## Tokens

Defined once in `apps/web/src/app/globals.css` (`:root`). Use them as `bg-[var(--mw-bg)]`, `text-[var(--mw-accent)]`…

| Token | Value | Use |
|---|---|---|
| `--mw-bg` | `#07051a` | page background, popovers that must hide the world |
| `--mw-primary` | `#b04cff` | the one filled call-to-action per view |
| `--mw-accent` | `#ff4fd8` | errors (`role="alert"`), focus outline, highlights |
| `--mw-secondary` | `#22d3ee` | informative tags, secondary highlights |
| body text | `#e8ecff` | set on `html, body`; do not override |

Neutral surfaces use white at low opacity: `bg-white/5` (card), `bg-white/10` (pill, hover), borders `border-white/10`
(card), `/20` (field), `/30` (button). Over the live 3D world use `bg-black/50`–`/70` + `backdrop-blur` + `text-white`.
Never add a new color; if a new role is needed, add a token in `globals.css` **and** here.

## Layout

- Page: `<main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">` (`max-w-3xl` and
  centered content for forms such as sign-in). Pages are thin: they only compose components from a feature barrel.
- Content grid: `grid gap-3 sm:grid-cols-2 lg:grid-cols-3`. Titles `text-2xl font-semibold`, card titles
  `font-semibold`, intro / helper text `text-sm opacity-80`, meta `text-xs opacity-80`.
- The 3D canvas is `fixed inset-0`; overlays are absolute children using `env(safe-area-inset-*)`. A page that mixes a
  form with a canvas needs `contain: layout paint` on the form section (the canvas would cover it otherwise).

## Components (class recipes)

Primary button (one per view):
`rounded-full bg-[var(--mw-primary)] px-4 py-2 font-medium text-black disabled:opacity-50`

Secondary button: `rounded-full border border-white/30 px-4 py-2 disabled:opacity-50` (compact: `px-3 py-1 text-sm`,
hover `hover:bg-white/10`).

Link styled as a button: same classes on `next/link`; plain text links use `underline`.

Card: `flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-3` containing a square preview
(`aspect-square w-full rounded`), title, meta line, tags, then actions pushed down with `mt-auto`.

Tag / pill: `rounded-full bg-white/10 px-2 py-0.5 text-xs`; tinted variants `bg-[var(--mw-accent)]/30` (featured) and
`bg-[var(--mw-secondary)]/30` (AI label).

Field (input, select, textarea): `rounded border border-white/20 bg-transparent px-2 py-1` (selects: options get
`className="bg-[var(--mw-bg)]"`); always a `<label>` (or `sr-only` label) tied by `htmlFor`.

Disclosure: `<details className="text-xs">` with `<summary className="cursor-pointer opacity-70">`.

Error: `<p role="alert" className="text-[var(--mw-accent)]">{t.error(code)}</p>`; status text `<p>` with no color;
empty state is a plain sentence (e.g. "Nothing to review."), loading is "Loading…" text — no spinners.

Overlay panel on the world: `rounded-lg border border-white/20 bg-black/70 p-4 text-sm text-white backdrop-blur`.

Navigation: small rounded bar `rounded-full bg-[var(--mw-bg)]/80 px-1 py-1`, links `rounded-full px-3 py-1 text-sm
hover:bg-white/10`, collapsing behind a ☰ button below `sm`.

Focus ring (add to every interactive element that is not a native default):
`focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--mw-accent)]`

## States and feedback

- Loading, empty, error and success are separate visible states of every list or form; async buttons are `disabled`
  while pending; destructive actions are secondary buttons (never the primary one).
- Errors map API codes to messages with `t.error(code)`; add `errors.<CODE>` to every locale of the namespace.
- Never render user text as markup (`dangerouslySetInnerHTML` is forbidden); show it as text.

## Accessibility

Landmarks (`main`, `nav` with `aria-label`), one `h1` per page, headings in order, `aria-expanded` / `aria-controls` on
disclosures, images with an `alt` from i18n, touch targets ≥ 40 px high on phones, contrast: light text on `--mw-bg`
only (the accent on `--mw-bg` is for short alerts, not paragraphs). Keyboard: space = play/pause, arrows = seek ±5 s.

## i18n

New text → a key in `apps/web/src/i18n/messages/{en,fr,mg}/<namespace>.json`, new namespace → register in
`i18n/catalogs.ts`. `no-literal-text.test.ts` fails on literal JSX text. Use `{count}`-style variables, no string
concatenation.

## Checklist before you finish a UI change

- [ ] Only tokens and the recipes above; no hex, no new color, no new font.
- [ ] 375 / 768 / 1280 px look right; no horizontal scroll.
- [ ] Labels, focus ring, keyboard path, `role="alert"` for errors.
- [ ] Texts in en + fr + mg; `pnpm -C apps/web exec vitest run src/i18n` passes.
- [ ] Tests for interactive components; `tsc` and `eslint` clean.
- [ ] For a visual change: screenshot with `apps/web/scripts/*-check.mjs` or Playwright against `next dev` (3125).

## Keeping it current

If you add a token, a reusable class recipe, or change an existing one, edit this file (tokens table or Components)
in the same commit, and keep `globals.css` as the value source. If a screen you are copying disagrees with this file,
the shipped component wins: fix the doc, not the screen, unless the task is to restyle it.

## Floating surfaces (glass)

Every panel, popover, dialog and floating pill uses `GLASS_PANEL` / `GLASS_PILL` from `apps/web/src/lib/glass.ts`
(translucent `--mw-bg`, `backdrop-blur-2xl`, saturated, iOS-like). Never restyle one with a local opaque background.
Scrollbars are global (thin, shown only while scrolling: `lib/scrollbar-autohide.ts` + `app/globals.css`).
