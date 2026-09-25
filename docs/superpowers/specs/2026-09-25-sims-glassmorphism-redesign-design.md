# SIMS registrar glassmorphism redesign

Date: 2026-09-25
Status: Design direction approved; written specification awaiting review.
Scope: Registrar application in `src/`, delivered in phases.

## Intent and approved direction

Help BNHS registrar staff recognize outstanding work and complete learner
record and attendance tasks quickly, within a visibly modern glass interface.
The supplied `src/assets/original-8c1501bbd52bb405defa79f967c0525f.webp`
is visual inspiration: frosted surfaces, pastel light, rounded panels, fine
highlight borders, and soft elevation. Its financial content and controls are
not product requirements.

The user approved:

- A whole-registrar-app rollout beginning with dashboard and navigation.
- Clearly visible frosted navigation and summary cards, with more opaque
  forms and tables.
- A collapsible left sidebar, styled as a floating glass panel.
- A dashboard led by unassigned learners and attendance needing attention.
- The proposed layered-glass direction and phased rollout.

Working assumptions accepted with that proposal: light theme first,
desktop-first use with usable small-screen layouts, current indigo/lavender
identity and school seal, and the separate parent portal outside this scope.

Success means the registrar can identify outstanding work at a glance and
reach the corresponding learner list or attendance section directly, without
losing readability, keyboard access, or confidence in the numbers.

## Scope boundaries

Include the shared authenticated shell, Dashboard, Students, Sections,
Schedules, Enrollment, Attendance and Monthly Summary, ID Cards, Guardians,
and Settings. Include dialogs, import-wizard presentation, filters, tables,
loading/error/empty states, and small-screen navigation within these surfaces.

Exclude the separate `parent/` app, student kiosk, login redesign, dark theme,
new notification systems, new reports, authentication/permission changes,
backend migrations, and changes to official print/export layouts. Guardians
means the existing registrar administration area, not the parent experience.
Preserve existing enrollment, attendance editing, import, QR, and export
behavior except the explicitly defined dashboard calculations and navigation.

## Approach and alternatives

Use layered glass: a visible atmospheric shell and summary layer over a
quiet, nearly opaque working layer. This gives the reference's depth while
supporting long sessions reading names, LRNs, and attendance marks.

Glass on every surface would compete with dense data and multiply blur work.
Glass accents alone would give less of the visual character requested. These
alternatives were presented; layered glass is the approved direction.

## Visual system

Preserve the school seal, Inter/system font stack, indigo interactive accent,
and existing attendance color meanings. Place a static CSS backdrop of soft
lavender, restrained blush, and pale blue lighting behind the interface.
Do not use the reference image itself as a page background.

Define shared semantic tokens and three surface variants:

| Variant | Use | Treatment |
| --- | --- | --- |
| Navigation glass | Sidebar and header | Visible translucency, backdrop blur, light edge, soft shadow |
| Summary glass | Metrics, attention panels, chart containers | Moderate frosting and clear separation from the backdrop |
| Working surface | Tables, form controls, dialog content | Nearly opaque light fill, readable dividers, minimal or no blur |

Initial implementation targets, adjustable after visual verification:
navigation fill 72-82% white with 16-20px blur; summary fill 82-90% with
10-14px blur; working fill 96-100% with no blur. These are starting values,
not evidence of contrast compliance. Verify composited colors against the
actual background. Define an opaque fallback for unsupported backdrop blur
and a reduced-transparency treatment where the browser exposes that setting.

Use 20-24px radii on major glass panels, 12-16px on working containers,
10-12px on fields, and pills for compact badges and selected navigation.
Use a consistent 4px spacing scale, 20-24px desktop gutters, and 16px compact
gutters. Main working text should normally be 14px; secondary labels may be
12-13px. Keep tabular figures for LRNs, dates, counts, and percentages.

Primary actions retain solid indigo fills. Status colors retain their existing
meaning and visible labels. Avoid low-contrast gray text, ornamental gauges
without a meaningful denominator, animated background blobs, or glow on every
control. Bound blur to major surfaces; do not blur each row or nested card.

## Shell and navigation

Keep all nine destinations and their labels. Use a floating sidebar with
icon-and-label items and an unmistakable active state. Expanded desktop width
targets 232px; collapsed width targets 72px. Persist the user's desktop
preference locally, with a safe default if storage is unavailable.

Collapsed items retain accessible names and labels available on both hover
and keyboard focus. The collapse control exposes its state. Keep account
identity and sign-out accessible in either state. Include a skip-to-content
link and a visible keyboard focus indicator.

The header carries the current page title and school year. Dashboard date
context uses the existing school-local date convention and refreshes across
midnight and when the app regains visibility. Reuse that same date for queries,
labels, and attendance shortcuts.

At widths below 1024px, use the compact sidebar by default while allowing
expansion. Below 768px, use a labelled menu button and an overlay navigation
drawer; close on navigation or Escape, contain keyboard focus while open,
and restore focus to the opener. Do not keep a desktop rail squeezing forms.
Only data tables may scroll horizontally within their own labelled region.

## Dashboard hierarchy and interactions

Reading order:

1. Dashboard heading, school-year/date context, and Enroll a learner action.
2. Needs attention: unassigned learners and sections without attendance
   records for today, each with a clear next action.
3. Supporting totals: active learners, enrolled this school year, and sections.
4. Enrollment by grade alongside attendance record coverage.
5. Recent enrollments with section and enrollment date.

On wide screens, the attention area and supporting visualization panels use
balanced columns. On small screens, stack in the same reading order. Avoid
forcing five equal-width statistic tiles into a narrow viewport.

Unassigned learners opens Students with the existing active/unassigned filter.
Attendance attention shows up to five sections, ordered by grade and name,
and a View all action when more remain. View all opens a labelled dashboard
dialog containing the complete pending-section list. Each section action opens
Attendance with its section and today's date preselected. No attendance is
saved merely by opening the destination.

Extend the existing page-parameter mechanism to carry attendance section/date
context. Select the Take Attendance tab for that action. Validate the section
against the current school year; a removed or unavailable section produces
a clear message and the normal section picker instead of a broken screen.
Do not reset unsaved attendance edits when unrelated live data updates arrive.

## Truthful dashboard data

Reuse existing unassigned semantics: active students without an enrollment
whose status is enrolled in the current school year. Keep existing active
student and enrollment totals; avoid silently changing domain definitions.

Attendance record coverage is defined as:

- Denominator: current-school-year sections with at least one resolvable
  learner enrolled in that section for that year, following the attendance
  roster's ordering and membership semantics.
- Numerator: distinct eligible section IDs with a persisted attendance
  document matching both today's date and current school year.
- Pending list: eligible sections absent from the numerator.
- No eligible sections: show No enrolled sections, not 0% or 100% completion.
- A saved empty marks map is a valid record: attendance defaults to Present.
- Old-year, wrong-date, missing-section, and duplicate records do not inflate
  the numerator. Empty sections do not generate attendance prompts.

Label this Sections with attendance records, with explanatory text that records
can come from registrar entry or kiosk activity. It does not certify review,
submission, or individual learner presence. Pending means no record yet, not
absence, lateness, or an overdue obligation. No holiday calendar is available;
on weekends retain date context and use neutral No records wording instead of
suggesting a deadline.

Replace the current document-count calculation for dashboard coverage.
The current present-rate calculation considers only explicit marks, even
though missing marks default to Present. Do not retain that misleading rate
in a redesigned tile: this dashboard shows record coverage instead. Preserve
the actual attendance screen and report tally rules.

Recent enrollments must be filtered to the current school year before sorting
and limiting, so the surrounding school-year context remains truthful.
Counts and prompts must not render as confirmed zero while data is loading.

## Components and data boundaries

Retain React, Vite, Firebase, lazy page loading, and the existing page switcher.
No router or large UI framework is needed for this redesign.

- `src/styles.js`: shared semantic color, radius, spacing, and surface tokens;
  preserve compatible exports for pages migrating in later phases.
- A registrar-scoped CSS layer: responsive shell, surface classes, focus,
  motion preferences, blur fallbacks, and print isolation. Avoid global rules
  that unintentionally restyle printed artifacts.
- `src/components/ui.jsx`: explicit surface variants and consistent buttons,
  fields, dialogs, and feedback states. Keep the default Card working/opaque
  so Phase 1 does not silently frost every unmigrated table.
- `src/components/Shell.jsx`: floating navigation, header, and responsive
  collapse/drawer behavior. Use a small shared set of local SVG icons.
- `src/pages/DashboardPage.jsx`: compose attention, metrics, coverage, chart,
  and recent activity from pure derived data.
- `src/lib/dashboardStats.js`: pure, independently tested coverage/pending
  derivation and school-year-scoped recent enrollment selection.
- `src/App.jsx` and `src/pages/AttendanceTakePage.jsx`: attendance entry
  parameters and validated initial section/date without disrupting edits.
- `src/hooks/useCollection.js`: add a status-aware subscription API for the
  dashboard while keeping the existing array-returning API compatible.

The status-aware API exposes data, loading, and error, handles subscription
cleanup, resets state when its path changes, and supports retry. Derive
dashboard results only when their required collections have loaded. Reuse
existing subscriptions; avoid adding one listener per section.
Do not widen Guardians' bounded queries or change backend access rules.

## States, accessibility, and performance

- Loading: stable-size placeholders with meaningful accessible status.
- Error: an explicit retrieval error and retry action; never a reassuring
  zero or All caught up state. Stale data, if retained, is labelled stale.
- Empty: distinguish no learners, no enrolled sections, no recent activity,
  and no pending work. Provide relevant actions where available.
- Forms: visible labels, retained values on failure, adjacent validation,
  explicit saving feedback, and protection against duplicate submissions.
- Dialogs: labelled titles, focus containment/restoration, Escape dismissal
  when safe, and sufficient opacity for uninterrupted reading.
- Long content: support long learner names, section/strand labels, large
  counts, and 200% zoom without concealing primary actions.
- Contrast targets: at least 4.5:1 for normal text, 3:1 for large text and
  essential control boundaries/focus indicators against adjacent colors.
- Motion: short 150-200ms state transitions, no perpetual decorative motion,
  and instant equivalents under reduced motion. Avoid animating blur.
- Performance: static gradients, bounded blur areas, no layered row blur,
  preserved code splitting, and no new heavyweight chart dependency.

## Rollout and verification gates

| Phase | Work | Gate before moving on |
| --- | --- | --- |
| 1 | Tokens, surface variants, static backdrop, floating responsive shell | All destinations usable; opaque legacy pages remain readable; keyboard and drawer checks pass |
| 2 | Action-focused dashboard, truthful coverage, attendance shortcuts | Derived-data edge cases and navigation verified; loading/errors cannot look like zero work |
| 3 | Students, Enrollment/import, Sections, Attendance/Monthly Summary | Data entry and attendance edits remain correct; SF2 and export regression checks pass |
| 4 | Schedules, ID Cards, Guardians, Settings | Existing actions remain accessible; bounded queries, permissions, print layouts preserved |
| 5 | Cross-screen visual/accessibility/performance review | Desktop and small-screen acceptance checks complete; design documentation matches shipped UI |

Keep each phase independently reviewable. Update DESIGN.md to describe the
approved tokens and actual migrated surfaces during implementation, with
final measured values after visual verification. Do not replace live design
documentation merely by writing this proposal.

Targeted automated verification during implementation:

- Coverage with no eligible sections, partial coverage, all records present,
  saved empty marks, duplicate input, orphan records, wrong dates/years, and
  sections without learners; numerator cannot exceed denominator.
- Current-year recent enrollments, unassigned learner semantics, and safe
  attendance entry parameters.
- Existing attendance, enrollment/import, SF2, and ID-card layout tests.
- Production build after each meaningful implementation phase.

Browser verification uses representative synthetic data: empty school, normal
records, many sections, long names, and retrieval failures. Check 1440px and
1280px desktop views, a 768px tablet view, a 390px phone view, keyboard-only
navigation, 200% zoom, reduced motion, and opaque fallbacks. Inspect glass over
the lightest and darkest areas of the actual backdrop. Check scrolling with a
realistic long table on available office hardware or CPU throttling, record
the environment, and reduce blur if navigation or scrolling becomes uneven.

Inspect ID cards, activation slips, and official-report outputs after style
changes. Keep glass/backdrops out of print layouts. No claim of performance
or accessibility compliance is made until these checks are performed.

## Review and next artifact

This document specifies the approved product/design direction; it is not an
implementation task list or authorization to deploy. After written-spec
review, use the writing-plans workflow to create a separate executable plan
with exact file changes, test commands, and phased checkpoints. Implementation
execution is selected after that plan is available for review.
