---
name: BNHS SIMS
description: Registrar console for BNHS learner records, flat bordered surfaces with a teal accent in light and dark.
colors:
  light-page: "#F5F7FA"
  light-sidebar: "#FFFFFF"
  light-card: "#FFFFFF"
  light-selected: "#E7F3F4"
  light-border: "#E3E8EF"
  light-control-border: "#848FA0"
  light-ink: "#17212F"
  light-muted: "#5F6E83"
  light-primary: "#077683"
  light-primary-hover: "#06636E"
  dark-page: "#0B0F19"
  dark-sidebar: "#151A26"
  dark-card: "#101522"
  dark-menu: "#1A2030"
  dark-selected: "#232B3B"
  dark-border: "#283040"
  dark-control-border: "#626F85"
  dark-ink: "#F5F7FA"
  dark-muted: "#939CAC"
  dark-primary: "#24A9B5"
  dark-on-primary: "#061418"
  present: "#15803D"
  late: "#B45309"
  absent: "#DC2626"
  excused: "#64748B"
  info: "#1D4ED8"
typography:
  page-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, SF Pro Display, SF Pro, Inter, Segoe UI, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  section-title:
    fontSize: "16px"
    fontWeight: 600
    letterSpacing: "-0.01em"
  metric:
    fontSize: "26px"
    fontWeight: 600
    fontFeature: "tnum"
  body:
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontSize: "13px"
    fontWeight: 500
  table-header:
    fontSize: "12px"
    fontWeight: 500
rounded:
  control: "8px"
  menu: "10px"
  card: "12px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.light-primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.control}"
    height: "38px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.light-primary-hover}"
  button-secondary:
    backgroundColor: "{colors.light-card}"
    textColor: "{colors.light-ink}"
    rounded: "{rounded.control}"
    height: "38px"
  input:
    backgroundColor: "{colors.light-card}"
    textColor: "{colors.light-ink}"
    rounded: "{rounded.control}"
    height: "38px"
    padding: "0 12px"
  nav-item-current:
    backgroundColor: "{colors.light-selected}"
    textColor: "{colors.light-ink}"
    rounded: "{rounded.control}"
    height: "36px"
  card:
    backgroundColor: "{colors.light-card}"
    rounded: "{rounded.card}"
---

# Design System: BNHS SIMS

## Overview

**The registrar's console.** A calm, dense, desktop-first administration surface for staff who spend the working day enrolling learners, taking attendance and producing DepEd-shaped reports. The dark theme follows a premium management dashboard: charcoal-navy page, a slightly lighter sidebar panel, cards separated by hairlines rather than shadows, and a single teal accent for actions, the current page and state. The light theme is its daylight twin: cool white surfaces on #F5F7FA with a deeper teal.

The interface should disappear into the task. Expression lives in precise details (type rhythm, borders, the teal accent used sparingly), never in glows, gradients, glass or decoration.

Scope: the registrar shell and shared components: Dashboard, Students, Sections, Schedules, Enrollment, Attendance, ID Cards, Guardians, Announcements, Settings and Accounts, plus Login and Change password. The Parents App (`parent/`) uses the same tokens, font stack and flat material; its rules are under **Parents App** below. Print sheets (ID cards, slips, SF2) keep their own fixed light styles and Inter.

Specification: [SIMS UI modernization](docs/superpowers/specs/2026-10-20-sims-ui-modernization-design.md).
Tokens: `shared/theme/theme.css` (colors, `--font-sans`), `src/registrar.css` (components and shell), `src/styles.js` (JS mirrors used by inline styles).

## Colors

Restrained strategy: neutrals plus one accent. Every screen color is a `--t-*` token in `shared/theme/theme.css`, shared with the Parents App; components never hard-code colors (`shared/theme/literals.test.js` enforces this).

- **Surfaces.** Page `--t-bg`, sidebar `--t-sidebar`, card `--t-surface`, dialog `--t-dialog`, dropdown `--t-menu`, field `--t-input-bg`. In dark mode the sidebar and dialogs sit one step lighter than cards; the page is darkest.
- **Lines.** `--t-border` for hairlines and card edges, `--t-border-strong` for secondary-button outlines, `--t-control-border` (at least 3:1) for input outlines.
- **Text.** `--t-ink` primary, `--t-subtle` labels, `--t-nav-ink` inactive navigation, `--t-muted` secondary and table headers, `--t-placeholder`.
- **Accent.** `--t-primary` with `--t-primary-hover` / `--t-primary-active`; `--t-primary-deep` for accent text on tinted fills; `--t-focus` for focus rings. The supplied light accent #087F8C is kept as `--t-decor` (charts); the interactive light primary is one step deeper (#077683) so it passes 4.5:1 as text on the #F5F7FA page. The supplied light muted #66758A is likewise deepened to #5F6E83.
- **Selection.** `--t-selected` (#E7F3F4 / #232B3B) marks the current page, selected tab and selected row. `--t-hover` / `--t-hover-strong` / `--t-row-hover` are quieter neutral steps.
- **Semantic.** Attendance colors are functional and keep their text labels: Present, Late, Absent, Excused (`--t-present`, `--t-late`, `--t-absent`, `--t-excused`). Error uses `--t-danger*` and `--t-feedback-*`, success `--t-success-*`, warning `--t-warn-*`, information `--t-info*`, disabled `--t-disabled-*`.
- **Dark-mode text on teal** is near-black (`--t-on-primary` #061418); white on #24A9B5 is only 2.8:1.

`<html data-theme="dark">` switches the palette. The preference (Auto / Light / Dark, default Auto, saved per device) is set from the sidebar account menu. The pre-paint script in `index.html` applies it before first render, so there is no wrong-theme flash. Dark rules live only under `@media screen`, so print is always light, and `.paper` keeps on-screen previews of printed documents white. `shared/theme/contrast.test.js` checks every text and control pair in both palettes.

## Typography

One family carries everything: `--font-sans` = `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "SF Pro", Inter, "Segoe UI", system-ui, sans-serif`. Mac, iPhone and iPad render SF Pro natively; a machine with SF Pro installed locally picks it up by name; Windows and Android fall back to Inter (loaded from Google Fonts). SF Pro files are never bundled or served, because Apple's license limits SF Pro to Apple platforms.

Fixed px scale, ratio about 1.15: page title 24px/600 (22px on phones), dialog title 18px/600, section title 16px/600, body and controls 14px, labels 13px/500, table headers and supporting text 12–13px, metrics 26–36px/600 with tabular figures. Avoid 700+ weights in the shell; hierarchy comes from size and the ink/muted split. Printed cards and slips keep Inter (`T.print`) so their fixed layouts set identically on every device.

## Layout

- **Shell.** Desktop: an inset sidebar panel (240px expanded / 64px collapsed, 8px from the window edge, 12px radius) and an independently scrolling main column (16px top, 32px sides; 20px below 1024px). The collapse preference is saved per device; below 1024px it defaults to collapsed. Below 768px the sidebar becomes a modal drawer opened from a sticky 56px mobile bar (menu button, page title, SY chip).
- **Page header.** A slim row holds the breadcrumb (`BNHS SIMS / Page`) and the school-year chip. Under it, each page's `.sims-heading` puts the title left and page actions right, closed by a hairline 16px below and 24px of space before content. Primary action rightmost.
- **Content.** Max width 1440px, centered. 4px spacing scale; card padding 16–24px; gaps 16–24px. Dashboard pairs become one column at 1100px; totals stack below 768px. Dense tables scroll horizontally inside named regions rather than hiding columns.
- **Enrollment** keeps its grade-filtered, searchable section directory beside the selected class list (stacked on phones), with the enrollment form in a drawer opened by "Enroll a learner".

## Elevation & Depth

Flat. Surfaces separate by tone and 1px borders, not shadows. Shadows exist only on things that float above the page: dropdown menus, the bulk-action bar, tooltips and dialogs, each with a vertical offset and soft blur at low opacity. No blur, glass or background glows anywhere in SIMS or the Parents App.

## Shapes

8px controls (buttons, inputs, nav items, tabs), 10px menus, 12px cards, dialogs and the sidebar panel, full pills only for badges, status pills and the SY chip. Borders are 1px.

## Components

- **Buttons** (`Btn` in `src/components/ui.jsx`, styles in `registrar.css`). Variants: `solid` (primary teal), `ghost` (secondary: surface fill, strong border), `danger` (red, for destructive actions; always behind a confirmation), `quiet` (text-only teal), `icon` (square, needs `aria-label`). 38px tall (44px on touch screens), 0 16px padding, 14px/500. Every variant has hover, active, focus-visible (2px focus ring, 2px offset), disabled (neutral fill, muted text) and `loading` (spinner, `aria-busy`, disabled) states. Avoid several solid buttons side by side; secondary row actions go behind a ⋯ menu.
- **Fields** (`Inp`, `Sel`, `Field`). 38px, 8px radius, `--t-input-bg`, `--t-control-border`. Focus turns the border teal and adds a 3px translucent teal ring. `aria-invalid` turns the border red; the `Field` error text is linked by `aria-describedby`. Disabled and read-only states have their own fills. Labels sit above, 13px/500.
- **Cards** (`Card`). One flat material: surface fill, 1px border, 12px radius. The `surface` prop remains only as a modifier class.
- **Dialogs** (`Modal`, `Confirm`, `DialogFrame`). Native `<dialog>` with focus return, Escape and backdrop dismissal. Title row with an icon close button; actions right-aligned, secondary before primary. Short fade-and-rise entrance, removed under reduced motion.
- **Sidebar.** Wordmark and collapse toggle on top; nav items 36px with 18px outline icons (muted, teal when current); the current page uses the selected fill and a hairline border. When collapsed, icon-only controls show a tooltip on hover or focus. The account row at the bottom (initials avatar, name, role) opens a menu with the Auto / Light / Dark radios and Sign out; arrow keys, Home/End and Escape work inside it.
- **Tables.** No header fill; 12px/500 muted headers, 12px 16px cells, hairline row dividers, row hover `--t-row-hover`, numeric columns right-aligned with tabular figures (`is-num`). Ordinary cells use `--t-subtle` (`S.td`); the row's primary cell, usually the name, uses ink at 500 (`S.tdStrong`). The trailing actions cell (`S.tdActions`) shows at most one visible secondary button, usually Edit, and puts everything else in a ⋯ `RowMenu`.
- **Row menus** (`RowMenu`). An icon button opens a fixed-position menu that never gets clipped by a table's scroll container and flips above near the window's bottom edge. Destructive items are red, and disabled items keep their reason as a tooltip (`hint`). Arrow keys, Home/End, Escape and Tab work; focus returns to the button before the chosen action runs. Items stay mounted (hidden) while the menu is closed.
- **Badges** (`Badge`). Pill with a 6px dot, 12px/500, in tones success, warning, danger, info, accent and neutral, using the paired `--t-*-bg` / `--t-*-ink` tokens. Used for account and learner status, Pinned and Printed.
- **Segmented filters** (`.sims-segmented`, `GradePills`). One-of-many filters such as grade or announcement status: a bordered track on the page tone, with the chosen segment raised onto the surface. Counts sit beside the label in muted tabular figures, and screen readers hear them as "Grade 7 (4)".
- **Stat and tally cards.** A muted label with a 16px icon (dashboard) or an 8px status dot (attendance tallies), and the value below it in 24–26px/600 tabular figures. The value stays ink; color lives only in the dot.
- **Checkboxes and radios** use `accent-color: --t-primary` at 16px inside `.sims-check` labels. File inputs get a secondary-button `::file-selector-button`. Form sub-headings (`.sims-form-section`) are 13px/600 sentence case with a hairline above, never tracked uppercase.
- **Tabs.** Use these for switching views within a page (Attendance, Guardians, ID Cards): 36px, 8px radius, and the selected tab uses the selected fill and hairline border. Filters use the segmented control instead.
- **Empty and loading states.** Empty states are a centered title and one-line hint. While loading, `ResourceState` shows a three-bar skeleton (the pulse is off under reduced motion), and screen readers still hear "Loading …". It also handles errors and retry.
- **Login / Change password.** A single 380px card on the page background: wordmark, title, one-line subtitle, alert, fields, a full-width primary button. Real `<form>` submission so Enter and password managers work.

## Parents App

A phone-first PWA built on the same system. Styles live in `parent/src/app.css`, and components in `parent/src/components/ui.jsx`.

- **Kept from before:** the floating pill nav, the iOS-style settings groups, the Messages-style learner list, chat bubbles for history and inbox, and the collapsing page header.
- **Material:** flat `.card` surfaces with a 1px border. The pill nav and the class select bar sit on `--t-sidebar` with one soft shadow, because they float. The collapsed page header is a solid page-tone bar with a hairline.
- **Controls:** buttons (`p-btn`: solid, ghost, danger) are 48px tall with a 12px radius. Inputs (`p-input`) are 48px with 16px text, so iOS doesn't zoom on focus, and get the same teal focus ring as SIMS. Banners (`p-banner`) use the info, warning and danger token pairs.
- **Restrained accent:** teal marks the screen's main action, the active nav icon and switches that are on. Settings icon tiles are neutral, a hover fill with an outline icon, rather than the old iOS rainbow. The current nav tab uses the selected fill.
- **Type:** headings are 600, never 800. Group headers are sentence case. The page title is 30px/600.
- **Theme color:** the browser bar uses the page color (#F5F7FA light, #0B0F19 dark), and so do the manifest's `theme_color` and `background_color`.

## Do's and Don'ts

- Do use the `--t-*` tokens and the shared components; never hard-code a color in JSX or the themed stylesheets.
- Do keep attendance status readable without color: every status carries its text label.
- Do keep 44px touch targets on coarse pointers and a visible focus ring everywhere.
- Do respect `prefers-reduced-motion`; motion is limited to 120–200ms state changes.
- Don't add gradients, glows, glass/blur, or colored side borders on cards.
- Don't fill the page with solid teal: the accent marks actions, the current page and state only.
- Don't use bold (700+) for emphasis inside dense tables; use ink versus muted instead.
- Don't restyle print sheets (ID cards, slips, SF2) from screen tokens; they stay light and fixed.
