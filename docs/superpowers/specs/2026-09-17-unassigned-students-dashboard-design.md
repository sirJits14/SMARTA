# Unassigned students visibility on Dashboard

## Problem

Students with no enrollment for the current school year (no grade, no section)
can already be found on the Students page via the grade filter's "Unassigned"
option. But there's no visibility into this from the Dashboard, so staff have
to know to go look for them.

## Data model note

In this system, enrollment always ties a student to a grade *and* section
together (`enrollStudent` requires a `section`, see
[enrollments.js](../../../src/data/enrollments.js)). There is no state where a
student has a grade but no section. So "unassigned" = "no enrollment record
(status `enrolled`) for the school year" — same definition already used by
the `UNASSIGNED` filter in [StudentsPage.jsx](../../../src/pages/StudentsPage.jsx).

## Design

### 1. `unassignedCount` stat function

Add to [dashboardStats.js](../../../src/lib/dashboardStats.js):

```js
export function unassignedCount(students, enrollments, schoolYear) {
  const enrolledIds = new Set(
    enrollments
      .filter((e) => e.schoolYear === schoolYear && e.status === 'enrolled')
      .map((e) => e.studentId)
  );
  return students.filter((s) => s.status === 'active' && !enrolledIds.has(s.id)).length;
}
```

Counts active students only (matches `activeStudentCount`'s definition of
the student body being measured).

### 2. Dashboard tile

Add a 5th `StatTile` ("Unassigned") to the stats grid in
[DashboardPage.jsx](../../../src/pages/DashboardPage.jsx), after "Today's
Attendance". Grid changes from `repeat(4, 1fr)` to `repeat(5, 1fr)`. Always
rendered, no conditional styling — same visual treatment as the other tiles.

The tile is clickable and navigates to the Students page with the grade
filter pre-set to "Unassigned".

### 3. Passing the filter across pages

`App.jsx` currently tracks only `page` state, and `setPage` takes no
parameters. Add a second piece of state, `pageParams`, alongside it:

```js
const [pageParams, setPageParams] = useState(null);
const goTo = (nextPage, params = null) => { setPage(nextPage); setPageParams(params); };
```

`goTo` is passed down instead of raw `setPage` where a param needs to travel
(Dashboard). `StudentsPage` gains an `initialGradeFilter` prop:

```js
const [gradeFilter, setGradeFilter] = useState(initialGradeFilter || '');
```

Dashboard's new tile calls `goTo('students', { gradeFilter: UNASSIGNED })`.
`App.jsx` passes `initialGradeFilter={pageParams?.gradeFilter}` to
`StudentsPage` when `page === 'students'`.

This is a one-shot seed (read once on mount via `useState` initializer), not
a synced/controlled prop — matches how the rest of the app already treats
page-local filter state as ephemeral UI state, not shared/persisted state.

### Out of scope

- No change to the "no section but has grade" case — doesn't exist in this
  data model, per above.
- No change to filter behavior on the Students page itself.
- No persistence of `pageParams` across reloads.
