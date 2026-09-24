# Parent Portal — Glass Floating Nav

Date: 2026-09-24
Scope: `parent/` only. The registrar SIMS (`src/`) is untouched.

## Goal

Replace the parent portal's edge-pinned, text-only bottom bar with a frosted
("glassmorphism") floating pill nav modelled on the Iconly "VPN App" reference:
the active tab is an expanded chip showing icon + label, inactive tabs are
icon-only. Give cards and banners a light matching frost so the nav belongs to
the page. No screen layouts change.

## Decisions (agreed)

| Topic | Decision |
|---|---|
| Scope | Nav bar + light touch on `Card` / `Banner` |
| Floating action button | None |
| Tabs | Keep 3: Home, Inbox, Settings (no new routes, no badge) |
| Active style | Indigo-tinted glass chip, filled indigo icon + label |
| Background | Lavender base + 2–3 soft blurred color glows (pure CSS) |
| Motion | Chip slides to the tapped tab, label expands, ~250ms |
| Icons | Hand-drawn inline SVG, outline + filled variants, no dependency |

## Components

### 1. `parent/src/components/Icon.jsx` (new)

- Exports `Icon({ name, filled, size = 24 })` for `home`, `inbox`, `settings`.
- 24×24 viewBox, 1.75 stroke, round caps/joins, `currentColor`, so color is
  set by the parent. `filled` swaps in the solid variant.
- `aria-hidden="true"`; the button's text label carries the accessible name.

### 2. `parent/src/lib/nav.js` (new, pure)

- `NAV_TABS`: `[{ path: '/', key: 'home' }, { path: '/inbox', key: 'inbox' }, { path: '/settings', key: 'settings' }]`.
- `activeTab(routeName)` returns the tab key or `null`:
  - `home`, `learner` → `home`
  - `inbox`, `report` → `inbox` (a report is opened from an inbox item or its push;
    today no tab lights up there, this is a small deliberate fix)
  - `settings` → `settings`
  - anything else (verify, consent, activate, requestAccess, notFound) → `null`
- Pulled out of `Shell.jsx` so it can be unit-tested without rendering.

### 3. `parent/src/components/Shell.jsx` (nav rewritten)

- `<nav aria-label="Main">` is `position: fixed`, centered, width
  `min(100% - 32px, 360px)`, bottom `calc(12px + env(safe-area-inset-bottom))`.
- Pill: `border-radius: 999px`, padding 6px, glass surface (see §5).
- Buttons are a flex row. Active button: `flex: 0 0 auto`, shows icon + label.
  Inactive buttons: `flex: 1`, show icon only; the label stays in the DOM, visually
  hidden (clip pattern), so every tab keeps its accessible name. Each button is
  ≥ 48px tall and keeps `aria-current="page"` when active.
- **Sliding chip**: one absolutely positioned element behind the buttons. A
  `ResizeObserver` plus a `useLayoutEffect` on the active key read the active
  button's `offsetLeft` / `offsetWidth` and set `transform: translateX(..)` and
  `width`. Transition `transform, width 250ms cubic-bezier(.2,.8,.2,1)`. The
  label reveals via `max-width` + `opacity` over the same 250ms. The chip is not
  rendered when `activeTab` is `null`. The chip does not animate on first paint
  (transitions are enabled only after the first measurement).
- The existing global `prefers-reduced-motion` rule in `main.jsx` already turns
  off these transitions; no extra work.
- Colors: inactive icon `T.inkMuted`; active icon/label `T.primary`, label 14px/700;
  chip `rgba(91,79,232,0.12)`.
- `main` bottom padding grows from 88px to
  `calc(96px + env(safe-area-inset-bottom))` so the last card clears the floating nav.
- Header and banners stay in place; behaviour unchanged.

### 4. `parent/src/components/ui.jsx` (light touch)

- `Card`: background `rgba(255,255,255,0.78)`, border `1px solid rgba(255,255,255,0.7)`,
  a faint shadow `0 4px 24px rgba(30,27,51,0.06)`, and the `glass` class for the blur.
- `Banner`: add the `glass` class and a white hairline border; the existing tinted
  backgrounds and text colors stay, so tone meanings are unchanged.
- Inputs, buttons, `EmptyState`, `Spinner`: unchanged.
- Text contrast on the frosted surfaces must stay ≥ 4.5:1 for body text; the
  surfaces are mostly opaque white over pale glows, so this holds with the
  current `T.ink` / `T.inkMuted`.

### 5. `parent/src/glass.css` (new, imported in `main.jsx`)

- **Background glows**: `body` keeps `T.bg`; a `body::before` fixed full-screen
  layer (`pointer-events: none; z-index: -1`) holds 3 radial gradients —
  indigo `#5B4FE8`, violet `#A78BFA`, pink `#F9A8D4` — at low opacity (≈0.18–0.28),
  placed top-left, right-middle, bottom-left. No images.
- `.glass`: `backdrop-filter: blur(12px) saturate(160%)` (+ `-webkit-` prefix).
- `.glass-nav`: `background: rgba(255,255,255,0.62)`, `border: 1px solid rgba(255,255,255,0.8)`,
  `box-shadow: 0 10px 30px rgba(70,56,194,0.16), inset 0 1px 0 rgba(255,255,255,0.9)`,
  `backdrop-filter: blur(18px) saturate(180%)`.
- **Fallback**: `@supports not (backdrop-filter: blur(1px))` → nav and cards get a
  solid `#FFFFFF` background, so nothing becomes see-through-and-unreadable.
- Blur radii stay ≤ 18px to keep scrolling smooth on budget Android phones.
- The Shell's `background: T.bg` moves to `body` so the glow layer shows through.

## Data flow

No data changes. `Shell` still receives `route` and `navigate` from `App.jsx`;
the nav calls `navigate(path)` exactly as today. No Firestore, routing, or
strings changes (labels reuse `S.navHome`, `S.navInbox`, `S.navSettings`).

## Error / edge handling

- No `backdrop-filter` support → solid white fallback (§5).
- Screens with no active tab (verify, consent, activate, request access,
  not found) → nav shows three icon-only tabs, no chip.
- Very narrow screens (≤ 320px): the pill fills the width minus 16px gutters;
  the active label still fits ("Settings" is the longest).
- Reduced motion → instant switch via the existing global rule.

## Testing

- `parent/src/lib/nav.test.js`: `activeTab` for every route name in
  `lib/router.js`, including `learner → home`, `report → inbox`, and `null` cases.
- Existing `vitest` suite passes (`npm test` in `parent/`).
- `npm run build && npm run size` in `parent/` stays under the 260 KB budget.
- Visual check in the browser pane at 375px wide: Home, Inbox, Settings, a learner
  page, and one tab switch to watch the chip slide; one check with reduced motion
  emulated.

## Out of scope

- A floating action button, a fourth tab, and unread badges.
- Glass inputs, buttons, or reworked screen layouts.
- Dark mode (the portal has none today).
- Any change to the registrar SIMS.
