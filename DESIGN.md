<!-- Supersedes the earlier "Card File" system, fully retired. See
docs/superpowers/specs/2026-07-24-bnhs-sims-dashboard-redesign-design.md
(in the bnhs-attendance repo) for the design rationale and process. -->

---
name: BNHS Student SIMS
description: A modern indigo/lavender SaaS dashboard for registrar enrollment and attendance.
colors:
  primary: "#5B4FE8"
  primary-deep: "#4638C2"
  bg: "#F5F4FC"
  surface: "#FFFFFF"
  border: "#E7E5F5"
  ink: "#1E1B33"
  ink-muted: "#6B6890"
  present: "#15803D"
  late: "#B45309"
  absent: "#DC2626"
  excused: "#64748B"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontWeight: 700
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontWeight: 400
rounded:
  card: "14px"
  input: "10px"
  pill: "999px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "10px 20px"
---

# Design System: BNHS Student SIMS

## Overview

**Creative North Star: "The Dashboard"**

A registrar's real-time overview, adapted from a modern SaaS admin-dashboard
register: indigo/lavender palette, a sidebar + top-bar shell, rounded white
cards floating on a soft lavender ground, and pill-shaped status badges. This
system fully replaces the earlier "Card File" world (walnut/manila/brass,
nearly-square shapes, trapezoidal guide-tabs) — a deliberate, user-directed
redesign, not an accidental drift back to a generic look. Retired: Courier
Prime, walnut/manila/brass tokens, the "never a pill" shape rule, and the
`GuideTab` trapezoid (replaced by `StatusPill`, a plain rounded badge).

**Key Characteristics:**
- Indigo primary (`#5B4FE8`) on a lavender-tinted page background, white cards
- Inter throughout, tabular figures for LRNs/dates/counts
- 14px card radius; full pill radius for badges, buttons, and active nav
- Attendance status (Present/Late/Absent/Excused) as colored rounded pills

## Colors

### Primary
- **Indigo** (`#5B4FE8`): the sole interactive/accent color — buttons, active nav pill, focus borders, the SY badge. 5.63:1 with white text.

### Neutral
- **Lavender bg** (`#F5F4FC`): page background.
- **Surface white** (`#FFFFFF`): card panels, the sidebar, the top bar.
- **Border** (`#E7E5F5`): hairlines, default input/select borders.
- **Ink** (`#1E1B33`): primary text — 15.26:1 on bg, 16.67:1 on surface.
- **Ink Muted** (`#6B6890`): secondary/muted text — 4.80:1 on bg, 5.24:1 on surface.

### Status roles (pill colors — attendance semantics; Brick doubles as this system's danger/error color too, e.g. delete buttons and validation errors)
- **Present** (`#15803D`) — 5.02:1 white-text contrast
- **Late** (`#B45309`) — 5.02:1 white-text contrast
- **Absent** (`#DC2626`) — 4.83:1 white-text contrast
- **Excused** (`#64748B`) — 4.76:1 white-text contrast

## Typography

**Display/Body Font:** Inter (both roles use the same family; weight carries the hierarchy — 700/800 for display, 400–600 for body/UI).

### Hierarchy
- **Display** (700–800, 20–28px): page titles (`S.h1`), stat tile values.
- **Title** (600, 16px): card section headings (`S.h2`).
- **Body** (400–600, 12–13px): UI chrome, table cells, form fields.
- **Data/Mono** (`fontVariantNumeric: tabular-nums`, 12–13px): LRNs, dates, counts.
- **Label** (600, 11–12px, uppercase where used): table headers, field labels.

## Layout

Two-column shell: a 220px white sidebar (logo, nav, profile footer) and a
main column with a 60px white top bar (SY badge) above a scrollable content
area on the lavender background. Pages follow a simple shape: a title row
(`S.plate`) directly on the lavender ground, then one or more white `Card`
panels below holding the actual controls and data — unlike the retired
system, there's no light/dark surface distinction to track, since the whole
background is uniformly light.

## Elevation & Depth

Soft, cool-neutral shadows on cards (`0 1px 3px rgba(30,27,51,0.08), 0 4px 12px rgba(30,27,51,0.06)`) — standard SaaS-dashboard elevation, a deliberate reversal of the retired system's warm-paper-only shadow rule.

## Shapes

14px card radius; full pill radius (999px) for every badge, button, and the
active nav item — the explicit opposite of the retired "nearly-square, never
a pill" rule.

## Components

### Buttons
- **Shape:** full pill.
- **Primary:** solid indigo fill, white text.
- **Ghost:** transparent fill, indigo border and text.

### Status Pill (signature component)
The attendance-status control: a small solid-color rounded pill carrying its
status label in white text. Tapping/clicking cycles the status (on
Attendance Take); it's decorative (no click) everywhere else it appears.

### Cards / Containers
- **Corner Style:** 14px radius.
- **Background:** white.
- **Shadow:** per Elevation & Depth above.
- **Border:** 1px solid Border color.

### Inputs / Fields
- **Style:** bordered rounded box (10px radius), white background.
- **Focus:** border becomes indigo.

### Navigation
Sidebar: white ground, pill nav items, active item filled solid indigo.
Top bar: white ground, right-aligned SY badge (light indigo tint, indigo text).

## Do's and Don'ts

### Do:
- **Do** use pill shapes for badges, buttons, and the active nav state.
- **Do** keep card radius at 14px consistently.
- **Do** use Brick (`#DC2626`) as both the Absent status color and the system's one danger/error color.

### Don't:
- **Don't** reintroduce Courier Prime, walnut/manila/brass tokens, or the trapezoid `GuideTab` shape from the retired Card File system.
- **Don't** use a near-square/no-radius shape anywhere — that belonged to the retired system's rules, not this one.
- **Don't** repurpose Present, Late, or Excused for anything other than attendance/enrollment status.
