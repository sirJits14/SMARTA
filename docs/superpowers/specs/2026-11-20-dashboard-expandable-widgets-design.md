# SIMS dashboard: widget grid with expandable detail drawers

Date: 2026-11-20
Status: approved design, not yet implemented
Surface: SIMS registrar shell, Dashboard page only (Operate mode)

## Goal

Rebuild the SIMS Dashboard as a widget grid with a right rail, following the
layout of a reference school-admin dashboard (KPI row, chart cards, calendar,
to-do, notice board, activity feed). Every widget can be expanded into a side
drawer that shows the detailed data behind it.

The reference contributes **layout and widget types only**. Its look (pastel
pink and navy tiles, glass frame, gradient bars, soft shadows) is not adopted.
Every pixel uses the existing SIMS tokens and the flat material in
[DESIGN.md](../../../DESIGN.md), in light and dark mode. DESIGN.md's color,
elevation and shape rules do not change.

## Decisions

| Topic | Decision |
|---|---|
| Visual fit | Layout only. Existing `--t-*` tokens, flat bordered cards, teal accent. |
| Expand behavior | Right-side drawer over the dashboard; the grid stays in place. |
| Scope | Dashboard content only. Sidebar, breadcrumb and SY chip are untouched. |
| Main-grid widgets | Weekly attendance, Learners by sex, Enrollment by grade, Attendance coverage today. |
| Rail and lower widgets | Calendar, Upcoming posts, Needs attention, Notice board, Recent activity. |
| KPI tiles | Active learners, Enrolled this SY, Sections this SY, Today's present rate, Unassigned learners, Open learner requests. |
| Filters | At most one compact filter on a card; richer filters in the drawer. |
| Calendar source | Announcements only (scheduled and published). No new events collection. |
| Old tables | "Recently enrolled sections" and "Recent enrollments" move into drawers and the activity feed. |
| Activity source | Enrollments and announcements only. No learner-request decisions, no new audit log. |
| Drawer extras | `?panel=<id>` deep link and a footer link to the owning page. No CSV export. |

## Approach

A widget registry. Each widget is one module exporting:

- `id`: the stable panel id used in `?panel=`.
- `title`.
- `visible(me)`: role gating.
- `Card`: the summary shown in the grid.
- `Detail`: the content shown in the drawer.
- `pageLink`: `{ label, page, params }` for the drawer footer.

`DashboardPage` composes the widgets. One `WidgetDrawer` renders the open
widget's `Detail`. Each widget's numbers come from pure functions in
`src/lib/dashboardStats.js`, so they can be unit-tested without React.

Two alternatives were rejected:
- **A single page file with per-widget modals.** The file grows without bound
  and the widgets can't be tested apart.
- **Embedding existing pages inside drawers.** This couples the dashboard to
  page internals and duplicates their data loading.

## Layout

Desktop, 1280px and wider: a main column (fluid) and a 320px rail, with a
24px gap.

```
┌──────────────────────────── main ─────────────────────────────┬──── rail 320px ────┐
│ Your school day, at a glance.                  [Enroll ▸]     │                    │
│ KPI  KPI  KPI                                                 │  Calendar (month)  │
│ KPI  KPI  KPI   (4 tiles for grade-scoped staff)              │                    │
│ ┌ Enrollment by grade  ⤢ ┐ ┌ Weekly attendance [Week▾] ⤢ ┐   │  Upcoming posts  ⤢ │
│ └────────────────────────┘ └─────────────────────────────┘   │                    │
│ ┌ Learners by sex ⤢┐ ┌ Coverage today ⤢┐ ┌ Needs attention ⤢┐ │  Recent activity ⤢ │
│ ┌ Notice board  [All▾]                                    ⤢ ┐ │                    │
└───────────────────────────────────────────────────────────────┴────────────────────┘
```

- The existing `.sims-heading` stays: title, date line, and "Enroll a learner"
  for admins.
- KPI strip: `grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))`.
  That gives 3 per row on a typical desktop and 2 per row below 768px.
- Row 2 has 2 columns (Enrollment by grade, Weekly attendance). Row 3 has 3
  columns (Learners by sex, Coverage today, Needs attention). Notice board is
  full width.
- Rail order: Calendar, Upcoming posts, Recent activity.
- Below 1280px the rail moves under the main column as a 2-column grid.
- Below 1100px row 2 and row 3 become one column, matching the existing
  dashboard rule.
- Below 768px everything is one column.
- The content max-width (1440px) and the 4px spacing scale stay unchanged.

## Shared components

### `WidgetCard`

This is the existing `Card`: surface fill, 1px `--t-border`, 12px radius, no
shadow, 16–20px padding.

- The header row holds:
  - the title, 16px/600;
  - an optional supporting line, 13px `--t-muted`;
  - an optional filter slot with one compact `Sel`, 32px high;
  - an expand icon button: `Btn variant="icon"`, the existing `NavIcon` expand
    glyph (add one only if none exists), `aria-label="Expand {title}"`,
    `aria-haspopup="dialog"`, and `aria-expanded` set to whether its drawer is
    open.
- The body holds the summary. On phones, an optional quiet "View details"
  button in the footer opens the same drawer.
- The card itself is not clickable, so nested buttons and filters work
  normally.
- Loading, error and empty states come from a per-widget `ResourceState`, so
  one failed feed never blanks the page. Skeletons keep the card's height to
  avoid layout shift.

### `WidgetDrawer`

- It is built on the existing `Modal` (native `<dialog>`), which provides
  Escape, focus return, backdrop dismissal and the focus trap. Put it on the
  right edge the way `EnrollPage`'s `.sims-enrollment-drawer` does, using a new
  shared `.sims-side-drawer` class.
- Do not change the enrollment drawer's CSS.
- Size:
  - 560px wide, and full height minus a 16px inset;
  - full width minus 24px below 768px.
- Header: the title plus an icon close button (`aria-label="Close {title}"`).
- Body: scrolls independently. It holds the filters row, a larger chart, then
  tables inside `.sims-table-scroll` named regions.
- Footer: a quiet link-button "Open {Page} ›" that calls `setPage` with the
  widget's `pageLink` and closes the drawer.
- Motion: 200ms fade and 24px slide from the right, removed under
  `prefers-reduced-motion`.
- Only one drawer is open at a time.

### `useDashboardPanel`

SIMS has no URL routing today. This hook is the only URL state, and it is
scoped to the dashboard.

- On mount it reads `?panel=`. If the id names a widget that is `visible(me)`,
  it opens that widget's drawer. Otherwise it removes the param.
- Opening a drawer writes `?panel=<id>` with `history.replaceState`. Closing
  removes it. Neither adds a history entry.
- Leaving the dashboard through `setPage` clears the param.

## Widgets

The ids below are the `?panel=` values.

### KPI tiles (no drawer)

Each tile shows a muted 13px label with a 16px icon, and the value in
26px/600 tabular figures. The value is ink; there is no colored number. A
tile is a button when it has a destination.

| Tile | Value | Shown to | Click |
|---|---|---|---|
| Active learners | `activeStudentCount` | all | Students, status active |
| Enrolled this school year | `enrolledCount` | all | Enrollment page |
| Sections this school year | sections in SY | all | Sections page |
| Today's present rate | from `weeklyAttendance` (today), plus a sub-line "n of m sections recorded" | all | opens the `attendance` drawer |
| Unassigned learners | `unassignedCount` | admin | Students, `gradeFilter: UNASSIGNED` (the existing route) |
| Open learner requests | `useLearnerRequestCount(canOpen(me,'learnerRequests'))` | `canOpen(me,'learnerRequests')` | Learner Requests |

On a weekend, or on a weekday with nothing recorded, the present-rate tile
shows "—" with the sub-line "No attendance recorded today".

### `attendance`: Weekly attendance

- **Card:** bars for the 5 weekdays (Mon–Fri) of the selected week. Each bar
  is the attendance rate for that day, with a value label above it and the day
  label below.
  - Bars use `--t-decor-soft`. Today's bar uses `--t-decor`, and its "Today"
    label is ink 600. The track is `--t-chart-track`.
  - Filter: This week / Last week.
- **Drawer:**
  - Filters: grade (within the user's scope) and period (week / month to
    date).
  - Charts and tables:
    - the same chart, larger;
    - a per-day table: Date, Sections recorded, Present, Late, Absent,
      Excused, Rate;
    - a per-section table for the period: Section, Days recorded, Present,
      Late, Absent, Excused, Rate.
  - Footer: Attendance summary page.
- **Data rules:**
  - Use `attendanceUnits` from `shared/sessionAttendance.js`, the same
    summarizer SF2 uses, over the scoped, enrolled roster.
  - A school day is any weekday, because there is no holiday calendar.
  - Rate = present ÷ (present + absent + excused). Here present already
    includes late. Late is shown as its own count but never added to the
    denominator twice.
  - Count a section-day only when that section has a `student_attendance` doc
    for that date. A section-day with no doc is **not recorded**: it is left
    out of the rate and counted in "Sections recorded". It is never treated as
    present.
  - Within a recorded doc, unmarked learners count as present (the
    present-by-default rule), exactly as `attendanceUnits` already does.
  - A day with no recorded sections renders as an empty bar labelled "—", not
    0%.

### `sex`: Learners by sex

- **Card:** a donut of male vs female among learners enrolled this SY in
  scope. The total is in the centre in 26px/600. Below it is a legend:
  "Male n · x%" and "Female n · y%".
  - Colors: male `--t-decor`, female `--t-decor-soft`, track
    `--t-chart-track`. Labels carry the meaning, not color alone.
  - Filter: All grades / each grade in scope.
- **Drawer:** a by-grade table and a by-section table. Columns: Male, Female,
  Not recorded, Total.
- **Data rules:** `sex === 'M'` and `sex === 'F'` match `roster.js`. Any other
  value goes in **Not recorded**. It appears in the drawer always, and in the
  card legend only when it is not zero. It is never silently dropped.

### `enrollment`: Enrollment by grade

- **Card:** the existing `GradeBarChart`, restyled to the card. No filter.
  The empty state is unchanged.
- **Drawer:**
  - grade bars;
  - a per-section table: Section, Latest enrollment, Enrolled learners. This
    replaces the old "Recently enrolled sections" table and uses
    `recentEnrolledSections`, up to 30 rows;
  - an SHS track/strand breakdown, shown only when grades 11–12 are in scope;
  - "Recent enrollments": the last 30, with Learner, Section and Enrolled.
    This replaces the old table.
- Footer: Enrollment page.

### `coverage`: Attendance coverage today

- **Card:** "n of m sections recorded", a progress bar (`--t-decor` on
  `--t-chart-track`), and the first 3 pending sections, each a link-button to
  take attendance.
- **Drawer:** the full Pending and Recorded lists from `attendanceCoverage`.
  Each pending row has "Take attendance", which calls
  `setPage('attendance', { attendanceEntry: { sectionId, date: today } })`.
- Replaces `CoveragePanel` on the page. Reuse its logic and remove the
  component only if nothing else imports it.

### `attention`: Needs attention

- **Card:** a list of queue rows. Each row has a 16px icon, a label, a count
  badge and a chevron, and the whole row is one button. Rows with a zero count
  are hidden. When all are zero, the empty state reads "All caught up" with
  the hint "Nothing is waiting on you today."

  | Row | Count | Shown to | Action |
  |---|---|---|---|
  | Learners without a section | `unassignedCount` | admin | Students, unassigned filter |
  | Sections without attendance today | `coverage.pendingSections.length` | all | opens the `coverage` drawer |
  | Learner requests waiting | `useLearnerRequestCount` | `canOpen(me,'learnerRequests')` | Learner Requests |
  | ID cards waiting to print | `id_card_batch` size | admin | ID Cards page |

- **Drawer:** each non-empty queue as a group with its top 10 items and the
  same actions.
- Replaces `AttentionPanel` on the page.
- Do not read `id_card_batch` for non-admins, because rules allow admins only.

### `notices`: Notice board

- **Card:** the 4 most recent posts. Each row shows the title (ink 500), an
  audience summary, the date (publish date, or scheduled date with a
  "Scheduled" badge), the author, and a "Pinned" badge when pinned. Badges use
  the existing `Badge` tones.
  - Filter: All / Published / Scheduled.
- **Drawer:**
  - up to 50 posts with a segmented status filter;
  - a one-line body preview;
  - the same columns as the card.
- Footer: Announcements page.
- **Data:**
  - Use the same Firestore query and visibility logic the Announcements page
    already uses. Do not widen what a role can see.
  - Only staff can list announcements (rules).
  - Unpublished and expired posts are left out of the card. In the drawer they
    appear only under an explicit filter value.

### `calendar`: Calendar, and `upcoming`: Upcoming posts

- **Calendar card:**
  - a month grid with Mon–Sun columns and prev/next month icon buttons;
  - today has a 2px `--t-primary` ring, and the selected day has the
    `--t-selected` fill;
  - weekends use `--t-muted`;
  - a 4px `--t-decor` dot sits under any day with a published or scheduled
    post (by `publishAt` in Asia/Manila);
  - clicking a day selects it and filters the Upcoming card to that day.
    Clicking it again clears the selection.
  - Arrow keys move between days, Enter selects, and Page Up / Page Down
    change the month.
- **Upcoming posts card:** the next 3 scheduled posts, or the selected day's
  posts. Each shows a date chip, title and audience. The empty state reads
  "No upcoming posts".
- **Drawer (shared; `upcoming` opens `calendar`):** a month agenda listing
  each day that has posts and its posts. Footer: Announcements page.
- No events collection is added.

### `activity`: Recent activity

- **Card:** a vertical timeline of the 6 newest items. Each has an icon in a
  neutral 28px circle (`--t-hover` fill), a sentence and a date.
  - Enrollment: "{FULL NAME} enrolled in {Grade · Section}", using
    `dateEnrolled`.
  - Post: "{Title} published by {Author}", or "…scheduled for {date}".
- **Drawer:** 50 items with a type filter (All / Enrollments / Posts).
- **Data:**
  - Build it only from the enrollments already loaded (in scope) and the
    announcements already loaded.
  - Names go through `fullName` (capitals).
  - Enrollments have a date but no time, so no time is shown for them.
  - Sort newest first. On equal dates, posts come before enrollments, then
    sort by id so the order is stable.

## Data loading and scoping

- Keep the 4 existing `useStaffCollectionResource` loads and the `scopeRoster`
  call. Every roster-derived widget uses the scoped output.
- Add an announcements load (reusing the Announcements page's data hook or
  query). For admins only, add an `id_card_batch` count.
- All dates come from the existing helpers (`useLocalToday`, `localDate` in
  `src/lib/dates.js`, the `en-PH` / Asia/Manila conventions). Do not add a new
  date formatter. If a widget needs a format that doesn't exist yet, add it
  once in `src/lib/dates.js` and test it.
- New pure functions go in `src/lib/dashboardStats.js`, each with tests in
  `dashboardStats.test.js`:
  - `weeklyAttendance`
  - `attendanceBySection`
  - `sexBreakdown`
  - `enrollmentBreakdown`
  - `upcomingPosts`
  - `postsByDay`
  - `recentActivity`
  - `attentionQueues`
- Leave the existing exports alone unless they become unused. `todayAttendance`
  must not be used for the new rate.

## Color and type rules

- Only existing tokens. Charts use `--t-decor`, `--t-decor-mid`,
  `--t-decor-soft` and `--t-chart-track`. Status meaning uses
  `--t-present` / `--t-late` / `--t-absent` / `--t-excused` only where an
  attendance status is named.
- No gradients, glass, blur, glows or colored side borders. Shadows go only on
  the drawer, as with every dialog.
- Type follows the DESIGN.md scale: card titles 16px/600, metrics 26px/600
  with tabular figures, table headers 12px/500 muted, nothing heavier than
  600.
- `shared/theme/literals.test.js` and `shared/theme/contrast.test.js` must
  pass. If a needed token truly does not exist, stop and ask rather than
  hard-coding a value.

## Accessibility

- Every chart has a text equivalent: value labels on bars, a legend with
  numbers for the donut, and a visually hidden summary sentence. The drawer
  tables are the full data.
- Expand buttons, KPI tiles and queue rows have visible focus rings and 44px
  targets on coarse pointers.
- Calendar days are buttons with full-date accessible names, such as
  "Friday, 20 November 2026, 2 posts".
- Drawer: focus moves to its heading on open and returns to the expand button
  on close.

## Documentation

Update DESIGN.md:

- Layout: replace the "Dashboard pairs…" sentence with the main + rail grid
  and its breakpoints.
- Components: add "Widget cards and drawers" (header anatomy, expand button,
  drawer size and motion, `?panel=` deep link).
- Colors, elevation and shapes are unchanged.

## Testing and verification

1. Unit tests (Vitest) for every new `dashboardStats` function. They must
   cover:
   - a section-day without a doc is not recorded;
   - unmarked learners in a recorded doc count as present;
   - a half-day absence counts as 0.5 absent and 0.5 present;
   - a weekend and a fully empty week;
   - sex values outside M/F go to Not recorded;
   - grade scoping;
   - stable sort ties in the activity feed;
   - Asia/Manila day bucketing for `publishAt` near midnight;
   - `attentionQueues` hides admin rows for non-admins.
2. `useDashboardPanel` tests for: a valid id opens, an unknown id is stripped,
   an id the user may not see is stripped, and close clears the param.
3. Run the full existing test suite. It must stay green.
4. Do a browser check against the emulator, as set up for this repo:
   - admin and grade-scoped accounts;
   - light and dark;
   - widths 1440, 1280, 1024, 768 and 375;
   - keyboard only: Tab to an expand button, Enter opens, Escape closes,
     focus returns;
   - reload with `?panel=attendance`;
   - no horizontal page scroll at any width.

## Out of scope

- The sidebar, the global header, search, a notification bell, and the
  reference's promo card.
- A school events collection, a holiday calendar, an audit/activity log, and
  CSV export.
- Deploying. SIMS deploys from its documented release tree; this work ends in
  a PR.

---

## Implementation prompt

Paste the following into a fresh Claude Code session in this repository.

```text
Implement the SIMS dashboard redesign described in
docs/superpowers/specs/2026-11-20-dashboard-expandable-widgets-design.md.
Read that spec in full first; it is the source of truth. Also read
DESIGN.md, PRODUCT.md, src/pages/DashboardPage.jsx, src/lib/dashboardStats.js,
shared/sessionAttendance.js, shared/theme/theme.css, src/components/ui.jsx,
and the enrollment drawer in src/pages/EnrollPage.jsx + src/enrollment.css.

What to build
- Rebuild the Dashboard page (and only that page) as a main column + 320px
  right rail. It has a KPI strip (6 tiles for admins, 4 for grade-scoped
  staff) and these widgets: Weekly attendance, Learners by sex, Enrollment by
  grade, Attendance coverage today, Needs attention, Notice board, Calendar,
  Upcoming posts, Recent activity.
- Every widget has an expand icon button that opens a shared right-side
  drawer (built on the existing Modal / native <dialog>) with that widget's
  detailed data, filters and a footer link to its owning page.
- The open drawer is reflected in ?panel=<id> via history.replaceState
  (useDashboardPanel). It is the app's only URL state, so keep it scoped to
  the dashboard.
- The old "Recently enrolled sections" and "Recent enrollments" tables move
  into the Enrollment drawer and the Activity feed. AttentionPanel and
  CoveragePanel are replaced by the Needs attention and Coverage widgets.

Visual rules (non-negotiable)
- The reference dashboard supplies layout and widget types only. Use the
  existing SIMS --t-* tokens and flat material in light and dark mode: no
  gradients, glass, blur, glows, pastel fills, colored side borders or
  card shadows. Charts use --t-decor / --t-decor-mid / --t-decor-soft /
  --t-chart-track. Teal marks actions, current state and data only.
- Follow DESIGN.md type, radius and spacing. Weights stay at 600 or below.
  Metrics use tabular figures.
- shared/theme/literals.test.js and contrast.test.js must pass. If a token
  you need does not exist, stop and ask me; do not hard-code a color.

Data rules (non-negotiable)
- Every roster-derived number uses scopeRoster output, so grade-scoped staff
  only see their grades.
- Attendance rates use attendanceUnits from shared/sessionAttendance.js
  (the SF2 summarizer). Rate = present ÷ (present + absent + excused). Only
  section-days that have a student_attendance doc count; a missing doc is
  "not recorded", never present. Do not use todayAttendance.
- Sex uses 'M' / 'F' as in roster.js. Anything else is shown as
  "Not recorded", never dropped.
- Announcements reuse the Announcements page's existing query and
  visibility logic. The calendar shows announcements only; do not add an
  events collection.
- id_card_batch is read only for admins. The learner-request count reuses
  useLearnerRequestCount(canOpen(me,'learnerRequests')).
- Names go through fullName. Dates use the existing helpers in
  src/lib/dates.js; add a formatter there only if needed, with a test.
- Each widget has its own ResourceState, so one failing feed doesn't blank
  the page.

Process
1. Use superpowers:writing-plans to turn the spec into a step-by-step plan,
   then implement it test-first (superpowers:test-driven-development) on a
   branch that contains this spec, kept up to date with origin/master.
2. Put pure logic in src/lib/dashboardStats.js with Vitest coverage for every
   case listed in the spec's "Testing and verification" section. Components
   go in src/components/dashboard/ (WidgetCard, WidgetDrawer, widgets/*),
   the hook in src/hooks/useDashboardPanel.js, and styles in a new
   src/dashboard.css.
3. Use /impeccable for the UI work and load its craft floor before editing
   UI. Then run /impeccable audit and /impeccable polish on the dashboard
   before finishing.
4. Verify in the browser against the local emulator: admin and grade-scoped
   accounts; light and dark; 1440 / 1280 / 1024 / 768 / 375px; keyboard-only
   drawer open, close and focus return; a reload with ?panel=attendance; no
   horizontal page scroll. Run the full test suite.
5. Update DESIGN.md (Layout + a "Widget cards and drawers" component entry;
   colors unchanged).
6. Open a PR. Do not deploy: SIMS deploys from its documented release tree.
```
