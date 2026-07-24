<!-- BUILT: the seed below was carried into the first implementation across all 7 surfaces (Login, Shell, Students, Sections, Enrollment, Attendance Take, Attendance Summary) with no drift — every value here matches the shipped code in src/styles.js and src/components/ui.jsx, confirmed via computed-style inspection. The mechanical detector (impeccable detect) passed with zero findings against all 11 changed files. -->

---
name: BNHS Student SIMS
description: A registrar's card-catalog, rebuilt on screen — every learner is a filed index card.
---

# Design System: BNHS Student SIMS

## Overview

**Creative North Star: "The Card File"**

Registration isn't a dashboard task here, it's filing. Every surface is a
drawer of physical index cards: the registrar pulls a drawer for a section,
flips through its filed cards, stamps today's mark with a tap, and refiles.
This is a deliberate, full replacement of an earlier navy/maroon "status pill"
identity — that system is retired entirely, not extended or referenced.

The world is drawn from the real material culture of a Philippine school
registrar's office and library card-catalog systems: buff manila card stock,
a walnut drawer frame, brass tab fittings, and entries typed on a manual
typewriter — not a generic admin-dashboard-with-sidebar, and not a twee
"aged parchment" pastiche. The card is the unit of truth throughout: a
student is a card, a section is a drawer, enrolling is filing, attendance is
stamping the day's mark onto the card in view.

**Confirmed visual rejections:** the previous Zilla Slab display face, the
maroon/navy institutional palette, and the small colored status-dot/pill
component are all retired — do not reintroduce them. Avoid glassmorphism,
blur, gradients, or pill/rounded-2xl radii; none belong to this material
world.

**Key Characteristics:**
- Buff manila card surfaces on a deep walnut drawer ground
- Courier Prime (typewriter revival) for every typed data field; Work Sans for UI chrome
- Attendance/status states render as colored guide-tab flags, not badges or dots
- Nearly-square corners (2–4px); paper-thickness shadows, never glass
- Brass as the sole interactive accent color, used sparingly

## Colors

A warm, materials-grounded palette: walnut and manila carry the surfaces,
brass carries interaction, and four muted "guide-tab" colors carry attendance
status — nothing else borrows those four.

### Primary
- **Brass Bright** (`#9C7A3C`) — for use on Walnut Drawer (dark) grounds only: the active nav-drawer fill (via Brass Plate, see Neutral), masthead accents. Verified 3.35:1 against Walnut — meets the 3:1 graphical/large-text floor for that surface. Not used directly as the active-nav fill in the shipped build — see Brass Plate.
- **Brass Deep** (`#7A5C28`) — for use on Manila Card (light) grounds: button fill/border, input focus underline, icons on cards. Verified 4.53:1 against Manila Card — meets the 4.5:1 floor even for small text/borders on that surface. Shipped on every `Btn` (solid variant) and `Inp`/`Sel` focus state. The single Brass Bright value fails the 3:1 floor on Manila (2.92:1) and must never be used there; the two values are the same metal read under different light, not two unrelated accents.

### Neutral
- **Walnut Drawer** (`#3E2B1F`) — the page/frame ground; the "cabinet" the cards live inside. Also used for the top masthead bar and the nav rail.
- **Manila Card** (`#E8DCB8`) — the surface for every card/row/panel — the actual content-bearing surface. 11.5:1 contrast with Typewriter Ink.
- **Typewriter Ink** (`#2A2118`) — primary text color on manila surfaces; a warm near-black, not pure `#000`, evoking aged ribbon ink.
- **Card Line** (`#C9B98A`) — hairline dividers, card borders, and the default (unfocused) underline on inputs, all on manila surfaces.
- **Brass Plate** (`#5C4527`) — walnut warmed toward brass; the fill for the active nav-rail item (the "pulled-out drawer front"). Manila text on Brass Plate is 6.58:1.

### Status roles (guide-tab colors — attendance semantics only)
- **Present — Sage Tab** (`#4B6B4F`) — 5.97:1 white-text contrast
- **Late — Mustard Tab** (`#8B6914`) — 5.08:1 white-text contrast
- **Absent — Brick Tab** (`#8B3A2F`) — 7.65:1 white-text contrast
- **Excused — Slate Tab** (`#4A5568`) — 7.52:1 white-text contrast

All four clear 4.5:1 with white label text, confirmed by calculation. These
four colors are reserved for attendance/enrollment status only — never
repurposed as decoration (an earlier draft of the Login screen reused
Excused's slate for a generic "busy" state; fixed before shipping).

**Sanctioned exception:** Brick doubles as the system's one danger/error
color — delete buttons, the destructive `Confirm` action, and validation
error text all use `#8B3A2F`. This is a deliberate call, not a leak: it
avoids fragmenting the palette with a fifth red under the One Accent Rule's
spirit, and "something is wrong" is a coherent enough kinship between a
learner's absence and a destructive/error state to share one color. No
other status color (Sage/Mustard/Slate) may be repurposed this way — Brick
alone carries the double duty.

### Named Rules
**The One Accent Rule.** Brass (Bright on Walnut, Deep on Manila — never cross the two) is the only interactive/accent color outside the four status tabs. If a screen needs a second accent, that is a sign the direction has drifted, not a reason to add a color.
**The Tabs-Not-Dots Rule.** Status is always shown as a labeled guide-tab (a small shaped flag with a text label), never as an unlabeled color dot or pill badge — the previous design's dot/pill pattern is explicitly retired.

## Typography

**Display/Content Font:** Courier Prime, with `ui-monospace, Menlo, Consolas, monospace` fallback
**Body/UI Font:** Work Sans, with `system-ui, sans-serif` fallback

**Character:** Courier Prime is the voice of the filed record itself — every
typed data field (learner names, LRNs, dates, section names) is set in it,
so the interface reads like real catalog-card typing, irregular baseline
implied by the face's own character. Work Sans carries everything that is
interface chrome rather than record content — labels, buttons, navigation —
staying quiet so the typed data remains the thing you actually read.

### Hierarchy
- **Display** (Courier Prime, 600, `clamp(1.5rem, 3vw, 2rem)`): page/section titles, styled like a drawer's engraved label plate.
- **Title** (Courier Prime, 500, 1.125rem): a card's primary field — a learner's name, a section's name.
- **Body** (Work Sans, 400, 0.9375rem): UI chrome, form labels, button text, navigation.
- **Data/Mono** (Courier Prime, 400, 0.875rem, tabular by construction): LRNs, dates, numeric tallies — monospace gives authentic fixed-width alignment without needing a separate tabular-figure feature.
- **Label** (Work Sans, 600, 0.6875rem, uppercase, `0.04em` tracking): guide-tab text, small structural labels.

### Named Rules
**The Typed-Field Rule.** Any value that is *filed data* (a name, an LRN, a date, a status label taken from the record) sets in Courier Prime. Any value that is *interface furniture* (a button, a nav item, a form field label) sets in Work Sans. Mixing the two inside one semantic role is a drift signal.

## Layout

The frame is a walnut "cabinet" ground (`<main>`, the nav rail, and the
masthead all share it) with manila "card" panels floating inside at a
28px page inset and 16–20px gaps between panels — enough negative space
around each card group to read as a drawer, not a dense spreadsheet. Every
page follows the same two-part shape: a walnut "label plate" header row
(page title in Manila-colored Courier Prime, plus any self-contained
primary-action button) directly on the cabinet ground, then one or more
manila Cards below holding the actual controls and data. Table rows stack
with a visible hairline (Card Line) between them rather than alternating-row
shading; table headers get a faint Card Line tint (32% opacity) rather than
a hard-colored bar. The left nav rail is a bank of labeled drawer-fronts
(210px wide) — one per app section — replacing a flat nav list.

## Elevation & Depth

Flat-with-paper-shadow, not glass. Each manila card sits a few pixels "above"
the walnut ground with a soft, warm-toned shadow implying real paper
thickness — never a cool-gray or blurred glassmorphic shadow. Guide-tabs
protrude slightly further and carry a marginally stronger shadow than the
card body, since a real tab physically overhangs the card edge.

### Named Rules
**The Paper-Not-Glass Rule.** Shadows describe the thickness of stacked paper — soft, warm-toned, close to the surface. No blur-heavy "glass panel" shadows, no backdrop-filter, no glow.

## Shapes

Index cards are nearly square: a consistent 3px corner radius everywhere
(`T.radius`), never the large rounded-2xl/pill radii of generic SaaS UI — the
detector confirmed zero pill-radius (`border-radius: 999`) findings across
the shipped build. Guide-tabs use a trapezoidal clip-path
(`polygon(0 0, 100% 8%, 100% 92%, 0 100%)`) — a distinct notched silhouette,
not a plain rounded rectangle. This is the system's signature shape and
should not be diluted.

## Components

### Buttons
- **Shape:** nearly square (2–4px radius), matching the card silhouette.
- **Primary:** Brass Deep border and/or fill (buttons sit on Manila), Work Sans label, uppercase, small tracking — reads like a stamped control plate, not a bubbly CTA.
- **Ghost/Secondary:** manila surface, ink-colored text, hairline (Card Line) border only.

### Cards / Rows (signature component)
- **Corner style:** 2–4px radius.
- **Background:** Manila Card.
- **Shadow:** per Elevation & Depth above.
- **Border:** hairline Card Line, bottom edge only between stacked rows.
- **Content:** Courier Prime for the record's own data (name, LRN), Work Sans for row-level UI (an edit/delete action).

### Guide Tab (signature component)
The attendance-status control: a small trapezoidal tab at a card's right
edge, filled with the current status color, carrying its short uppercase
label in white Work Sans. Tapping/clicking cycles the status and the tab's
fill color changes immediately — this is the direct descendant of the
previous design's "stamp" interaction, now literalized as a guide-tab flip
rather than an abstract colored dot.

### Inputs / Fields
- **Style:** minimal chrome — a manila surface with only a bottom hairline border (Card Line), suggesting "a line ready to be typed on," rather than a fully boxed input.
- **Focus:** the bottom border becomes Brass Deep (fields sit on Manila) and gains slight weight; no glow/ring.

### Navigation
Left rail as a bank of labeled drawer-fronts, one per section (Students,
Sections, Enrollment, Attendance) — Walnut ground, Work Sans uppercase
labels. The active drawer shows "pulled out": a Brass Plate background fill,
a `translateX(6px)` shift, and a stronger shadow — a real physical
displacement rather than a border accent or a plain color swap. Brass
Bright itself is not yet used anywhere in the shipped build; it remains
reserved for a future small graphical/icon accent directly on Walnut
(masthead iconography, drawer-pull glyphs) rather than being forced into a
use it doesn't earn yet.

## Do's and Don'ts

### Do:
- **Do** set every piece of *filed data* (names, LRNs, dates, section identifiers) in Courier Prime.
- **Do** represent attendance/enrollment status exclusively as a colored, labeled guide-tab — never a dot, pill, or badge.
- **Do** keep corner radii small and near-square (2–4px) everywhere.
- **Do** use brass as the only accent/interactive color outside the four status-tab colors.

### Don't:
- **Don't** reintroduce Zilla Slab, the maroon/navy palette, or the status-pill/dot component from the retired design.
- **Don't** use glassmorphism, backdrop blur, glow, or large pill radii anywhere.
- **Don't** use a cool-gray or blue-tinted shadow — shadows stay warm-toned, implying paper.
- **Don't** repurpose Sage, Mustard, or Slate for anything other than attendance/enrollment status. Brick alone is the sanctioned exception, doubling as the system's danger/error color (see Colors).
