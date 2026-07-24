# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The registrar staff of Bukidnon National High School (BNHS), a real Philippine
public secondary school. In v1 there is exactly one role — **registrar** —
working from an office desktop to manage learner enrollment records and take
daily class attendance. Adviser/teacher-scoped access and a student/parent
read-only view are known future audiences, deliberately deferred.

## Product Purpose

Replace paper-based enrollment and attendance record-keeping at BNHS with a
centralized system: enroll learners into sections for a school year, take
daily attendance per section, and produce official monthly attendance reports.
Success means the registrar can trust the system's numbers enough to submit
its export directly, without manual correction.

## Positioning

Unlike a generic student-information-system template, this product is built
around DepEd's actual conventions — 12-digit Learner Reference Numbers, the
official June-to-March school year, JHS (grades 7-10) vs. SHS (grades 11-12
with track + strand), the male-then-female alphabetical learner ordering used
on official forms, and an SF2-shaped monthly attendance export. A generic
competitor could not truthfully claim DepEd-form-accurate output without
rebuilding this domain logic.

## Operating Context

Registrar's office workflow: intake a new or returning learner, enroll or
re-enroll them into a section for the current school year, take attendance
per section per day, and generate a monthly report for submission. Used on
office desktops during work hours, not primarily on mobile. Backed by its own
dedicated Firebase project — intentionally separate from BNHS's existing
teacher/staff attendance system (a different app, different audience,
different data).

## Capabilities and Constraints

- Data model: `students`, `sections`, `enrollments`, `student_attendance`,
  `settings`, `users` in Firestore.
- LRN must be exactly 12 digits and unique across students.
- JHS (grades 7-10) has no track/strand; SHS (grades 11-12) requires a track
  and a strand within it.
- Attendance marks are Present / Late / Absent / Excused; **Present is the
  default** for an unmarked day — the registrar only records exceptions.
- Deterministic enrollment per student per school year (re-enrolling the same
  student in the same year moves them rather than duplicating).
- Monthly attendance/SF2 export currently uses each learner's *current*
  enrollment status — a known v1 limitation for mid-month withdrawals/
  enrollments, already documented for the user.
- No document file uploads yet (a document-submitted checklist only).
- No holiday calendar yet (a school day is any weekday).
- Single registrar role only; no per-section adviser scoping yet.

## Brand Commitments

Product name: "BNHS Learner Records" / "BNHS Student SIMS". BNHS is a real
school; no specific institutional color, logo, or typographic identity has
been confirmed as externally binding — the visual system built so far was
this project's own design choice, not a fixed brand asset, so it remains open
to reconsideration in visual-world work.

## Evidence on Hand

No real learner or attendance data exists yet — the only account is the
registrar's own test login against a fresh Firebase project. No physical or
scanned DepEd SF2 sample is on hand to visually match beyond the team's
working knowledge of the form's structure; future work must not fabricate a
specific SF2 layout claim beyond what's already implemented and tested.

## Product Principles

1. DepEd-conformant by construction — sort order, SF2 shape, and school-year
   conventions match the official form so registrar staff can trust the
   export without manual correction.
2. Registrar-desktop-first — built for focused office data entry, not a
   mobile-first or public-facing experience.
3. Present-by-default accounting — attendance defaults to Present; the
   registrar's effort goes only into recording exceptions.
4. Single source of truth per fact — one date formatter, one attendance
   summarizer, shared by every surface that reads or writes it, so the
   on-screen grid and the exported form can never silently disagree.
5. Deliberate separation from the existing BNHS teacher-attendance system —
   different Firebase project, different staff audience, not merged.

## Accessibility & Inclusion

No formal standard has been mandated, but the existing implementation already
holds a WCAG contrast floor on status colors, keyboard operability for the
core attendance interaction, and respects `prefers-reduced-motion` — future
visual work should not regress these.
