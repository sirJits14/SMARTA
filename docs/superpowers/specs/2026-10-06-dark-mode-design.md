# Dark mode (Auto / Light / Dark) for SIMS and the Parents App

Date: 2026-10-06
Status: approved in brainstorming, pending spec review

## Goal

Let every user of the SIMS (registrar, admins, coordinators) and the Parents
App choose **Auto**, **Light**, or **Dark**, so the apps are comfortable in dim
rooms and at night. Auto follows the device's light/dark setting live.

## Decisions

| Question | Decision |
| --- | --- |
| Where the control lives | Full setting **plus** a quick menu in each app |
| Persistence | **Per device** (`localStorage`); no Firestore, no rules change |
| Default | **Auto** |
| Dark look | **Night teal**: deep teal-charcoal, glass and soft glows kept |
| Quick control behavior | Sun/moon button opens a **3-option menu** (Auto, Light, Dark) |
| Printable previews | **Stay paper-white** on screen (ID cards, activation slips); print is always light. SF2 is an Excel download with no on-screen preview, so it's unaffected |
| SIMS full-setting location | **Sidebar account block → Appearance** (every role); school Settings stays admin-only |

## Out of scope

- Syncing the preference across devices or to a user profile.
- The SMARTA kiosk (`bnhs-SMARTA/`) and the existing teacher-attendance app.
- Any change to print layouts, SF2 calculations, or exported files.

## Architecture

### Approach: palette values become CSS variables

Both apps already route color through one palette object `T`
(`src/styles.js`, `parent/src/styles.js`; about 290 uses in SIMS). Each color
value becomes a CSS custom property reference (`ink: 'var(--t-ink)'`), and
the actual light and dark values live in CSS, keyed on
`<html data-theme="light|dark">`. Switching theme rewrites one attribute; the
browser re-colors every inline style and stylesheet without a React re-render.
No code concatenates onto `T` color strings (verified), so references stay
valid. Non-color tokens (fonts, radii, sizes) are unchanged.

Rejected: a React-context palette (about 300 call-site edits, flash of the wrong
theme before hydrate) and a CSS `filter: invert()` hack (inverts photos, logo,
and status meaning).

### Units

1. **`shared/theme/theme.js`**: the single source of preference logic, used by
   both apps. `shared/theme/` is browser-only, so `scripts/syncShared.mjs` skips
   it when copying `shared/` into `functions/`.
   - `PREFS = ['auto', 'light', 'dark']`, storage key `bnhs-theme`.
   - `readPref()`: returns the stored pref, or `'auto'` when missing, invalid,
     or storage throws.
   - `writePref(pref)`: stores the value; a storage failure is swallowed, and
     the choice still applies for the session.
   - `resolveTheme(pref, systemDark)` returns `'light' | 'dark'` (pure).
   - `applyTheme(theme)`: sets `data-theme` on `<html>` and the
     `<meta name="theme-color">` content (from the meta's `data-light` /
     `data-dark` attributes). `color-scheme` follows `data-theme` in CSS.
   - `stepPref(pref, key)`: the arrow/Home/End order shared by both apps'
     controls.
   - `createThemeStore()`: one per tab. It listens to
     `matchMedia('(prefers-color-scheme: dark)')` changes (for Auto) and to
     `storage` events (cross-tab sync) for the life of the tab, and exposes
     `getPref`, `getTheme`, `setPref`, and `subscribe` for React's
     `useSyncExternalStore`.
2. **Pre-paint snippet**: a small inline `<script>` in `index.html` and
   `parent/index.html` that runs the same read → resolve → apply logic before
   first paint, so there is no flash. A unit test asserts the snippet and
   `theme.js` agree on key name, valid values, and fallback.
3. **`useTheme()` hook** in each app (thin wrapper over the store):
   `{ pref, theme, setPref }`.
4. **`ThemeControl`**: one per app, styled with that app's CSS. (Each Vite app
   bundles its own React, so shared React components would load two copies;
   only the framework-free logic is shared.) It is a three-option
   segmented control (radio-group semantics, arrow-key navigation, visible
   labels "Auto", "Light", "Dark") plus a status line, for example "Auto:
   following your device (currently dark)".
5. **`ThemeMenuButton`**: the quick control. It is a 44×44 icon button showing
   a sun or moon for the active theme, with a small "A" badge when the
   preference is Auto. It opens a small menu (`role="menu"`, three
   `menuitemradio` items, current item checked). Escape and an outside click
   close it, and focus returns to the button.

### Tokens

Variables are named `--t-<token>` and declared on `:root` (light) and
`:root[data-theme="dark"]` (dark). `src/registrar.css`, `src/enrollment.css`,
and `parent/src/glass.css` replace their literal colors with these variables
(including the background gradients, glass fills, borders, shadows, the
tooltip, the dialog, and the backdrop).

Night teal dark values. Contrast is measured against surface `#14262a`, with
the background figure in parentheses.

| Token | Light (current) | Dark | Contrast (dark) |
| --- | --- | --- | --- |
| bg | `#F2F8F7` / `#eef5f4` | `#0e1c1f` | — |
| surface (working, 97%) | `#FFFFFF` | `#14262a` | — |
| dialog | `#FFFFFF` | `#172b2f` | — |
| nav glass | white 76% | `rgba(20,38,42,.76)` | — |
| summary glass | white 82% | `rgba(20,38,42,.82)` | — |
| border (decorative) | `#DCEBE8` | `#24403f` | — |
| control border | `#7a9294` | `#5d7a7b` | 3.38:1 (≥3) |
| ink | `#12313A` | `#e2eeec` | 13.19:1 |
| muted | `#55706F` | `#93aeab` | 6.63:1 |
| primary (fill and text/links) | `#007A72` | `#2bb5aa` | 6.19:1 as text |
| on-primary text | `#FFFFFF` | `#04211e` | 6.68:1 on fill |
| focus outline | `#154854` | `#7fe3d8` | 10.36:1 |
| present | `#15803D` | `#4cc38a` | 7.07:1 |
| late | `#B45309` | `#f0a35a` | 7.53:1 |
| absent / danger | `#DC2626` | `#f27b7b` | 5.89:1 |
| excused | `#64748B` | `#a3b1c2` | 7.18:1 |
| on-status text | `#FFFFFF` | `#0b1a1c` | ≥6.70:1 on every status fill |

The ink is intentionally off-white, not `#fff`, to reduce halation. Background
glows in dark mode are dim teal (`rgba(0,167,157,.10)`,
`rgba(94,234,212,.06)`, `rgba(21,72,84,.35)`). Shadows switch to a black base
at low opacity. A new `T.onStatus` token replaces the literal `'#fff'` on
attendance pills (`src/components/ui.jsx:125`), and `T.onPrimary` replaces
white text on primary fills.

Status colors always keep their text labels; meaning never depends on color
alone (unchanged rule).

### Paper scope and print

- A `.paper` class re-declares the full light token set. It is applied to the
  roots of ID card previews (`IdCardsPrintable`, `idCards/`), activation slips
  (`ActivationSlipsPrintable`). They render white on the dark page. The
  on-screen attendance summary grid is working UI and follows the theme; the
  SF2 export is an `.xlsx` file and is unaffected.
- `@media print` forces the light token set on `:root`, whatever the
  preference.

### Browser chrome

- `color-scheme: light | dark` follows `data-theme` in CSS, so native inputs, selects,
  date pickers, and scrollbars match.
- The Parents App `<meta name="theme-color">` is `#00A79D` in light and
  `#0e1c1f` in dark. SIMS gains the same meta tag.

## Controls and placement

### SIMS

- **Quick menu**: `ThemeMenuButton` in the top bar (`src/components/Shell.jsx`,
  `.app-topbar`), placed immediately left of the "SY …" pill. It is styled as
  the existing `.sims-icon-button`.
- **Appearance item**: a new `sims-nav-item` in `.sims-account`, below the name
  and role and above "Sign out", with a new `NavIcon` (`theme`). It opens a small
  `DialogFrame` titled "Appearance" containing `ThemeControl` and the line
  "Saved on this device." When the sidebar is collapsed, it shows an icon with
  the existing rail tooltip; in the mobile drawer, it is the same item. It is
  visible to every role; `access.js` is unchanged.

### Parents App

- **Quick menu**: `ThemeMenuButton` top-right in the `Shell` header
  (`parent/src/components/Shell.jsx`), so it appears on every screen
  wrapped in `Shell`, including `Verify` and `Consent`. `SignIn` renders
  outside `Shell` (`App.jsx:59`), so it gets its own top-right
  `ThemeMenuButton`; sign-in at night is not a white flash. It sits away from
  the bottom glass nav.
- **Appearance card**: the first card in `screens/Settings.jsx`, containing
  `ThemeControl`. All new copy goes into `parent/src/strings.js` (the
  forbidden-words test still applies).

### Transition

Switching cross-fades `background-color`, `color`, and `border-color` over
200ms. A `prefers-reduced-motion: reduce` setting makes the switch instant.
The pre-paint application never animates.

## Hardcoded colors to migrate

- `src/components/dashboard/AttentionPanel.jsx`: hex literals → tokens.
- About 16 `rgba(...)` and white literals in SIMS JSX and about 13 in Parents
  JSX (`Bubble`, `Icon`, `ScanSheet`, `ui.jsx`, `Report`) → tokens.
- `src/registrar.css`, `src/enrollment.css`, `parent/src/glass.css`: every
  literal color → `--t-*` variables.
- Legacy `src/styles.js` login and print fallbacks: the login screen follows
  the theme; print fallbacks stay light through the print rule.

## Logo

The SMARTA wordmark (`src/assets/smarta-wordmark.png`, sidebar cut) is checked
on `#0e1c1f`. If the dark-teal lettering falls below 3:1, a light-ink variant is
generated with the existing `scripts/build-logos.py` and swapped in under
`data-theme="dark"`. No new artwork is commissioned.

## Edge cases

| Case | Behavior |
| --- | --- |
| Storage blocked or throws | Pref reads as Auto; changes apply for the session only |
| Stored value invalid | Treated as Auto |
| No `matchMedia` / no color-scheme support | Auto resolves to Light; manual Dark still works |
| Two tabs open | `storage` event syncs the other tab |
| Device flips light/dark while on Auto | App follows immediately |
| `backdrop-filter` unsupported or reduced transparency | Existing solid fallback uses dark surface `#14262a` instead of white |
| Printing in dark mode | Always light |

## Testing

- **Unit (Vitest)** for `shared/theme/theme.js`: `resolveTheme` truth table,
  `readPref` with missing, invalid, and throwing storage, `writePref` swallowing
  errors, the `subscribe` media and storage paths (with fake `matchMedia` and
  `storage` events), and snippet/module agreement.
- **Contrast test**: every ink, muted, accent, focus, control-border, and
  status pair in both palettes against bg, surface, and dialog, plus each
  on-fill pair. The test fails below WCAG AA (4.5:1 for text, 3:1 for
  non-text).
- **Leftover-color guard**: a test that fails on new hex or `rgba` color
  literals in `src/**/*.jsx` and `parent/src/**/*.jsx` outside `styles.js`,
  printable components, and an explicit allowlist.
- **Keyboard behavior**: the shared arrow/Home/End order (`stepPref`) is unit
  tested. The test runner has no DOM, so `ThemeControl` and `ThemeMenuButton`
  focus, Escape, and ARIA state are checked in the browser pass below.
- **Browser verification**: every SIMS page and every Parents screen in Light,
  Dark, and Auto (with the system theme emulated), at 375px and desktop widths.
  Also print preview of ID cards and activation slips (must be light), and
  the Impeccable detector over changed UI files.

## Docs to update after implementation

- `DESIGN.md`: add the dark token table, the paper scope, and the theme
  control placement.
- Parents App guide (`docs/guardian-account-guide.md`): one short "Appearance"
  note.
