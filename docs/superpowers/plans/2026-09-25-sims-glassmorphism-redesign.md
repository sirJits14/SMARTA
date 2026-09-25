# SIMS Glassmorphism Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the registrar a readable glass interface across SIMS, with a dashboard that leads directly to unassigned learners and sections without today's attendance records.

**Architecture:** Extend the existing React shell and shared components with scoped surface styles. Keep dashboard derivation pure, expose explicit subscription states, and carry attendance shortcuts through the existing page parameters. Migrate the remaining pages in stages without changing their backend operations or printed outputs.

**Tech Stack:** React 19, Vite 8, Firebase 12, Vitest 4, plain CSS, local SVG icons; existing ExcelJS and QRCode imports remain lazy-loaded.

**Spec:** `docs/superpowers/specs/2026-09-25-sims-glassmorphism-redesign-design.md` (approved 2026-09-25). Read it before this plan.

## Global Constraints

- Scope: Registrar application in `src/`, delivered in phases.
- Retain React, Vite, Firebase, lazy page loading, and the existing page switcher.
- No router or large UI framework is needed for this redesign.
- Do not widen Guardians' bounded queries or change backend access rules.
- Keep the default Card working/opaque so Phase 1 does not silently frost every unmigrated table.
- Keep glass/backdrops out of print layouts.
- Primary actions retain solid indigo fills. Status colors retain their existing meaning and visible labels.
- Counts and prompts must not render as confirmed zero while data is loading.
- Do not reset unsaved attendance edits when unrelated live data updates arrive.
- Contrast targets: at least 4.5:1 for normal text, 3:1 for large text and essential control boundaries/focus indicators against adjacent colors.
- Expanded desktop width targets 232px; collapsed width targets 72px.
- At widths below 1024px, use the compact sidebar by default while allowing expansion. Below 768px, use a labelled menu button and an overlay navigation drawer.
- Main working text should normally be 14px; secondary labels may be 12-13px.
- Motion: short 150-200ms state transitions, no perpetual decorative motion, and instant equivalents under reduced motion. Avoid animating blur.
- Exclude `parent/`, kiosk, login redesign, dark theme, new reports/notifications, permission changes, backend migrations, and changes to official print/export layouts.
- This is a plan, not an instruction to deploy. Worktree setup happens at execution time. Preserve unrelated user files and stage explicit task paths only.

## Review Focus

1. An old listener delivers after navigation/retry: its data must not replace the active resource (Task 4 callback tests).
2. A tab sleeps across midnight: the displayed date, coverage calculation, and next shortcut must agree after visibility returns (Task 4 fake-clock test and browser check).
3. A section disappears or a snapshot arrives during editing: reject stale shortcut targets without erasing user changes (Task 5 tests and interaction scenario).
4. A keyboard user opens a dialog/drawer and resizes: focus remains usable and returns to a still-visible opener; denied local storage cannot prevent navigation (Tasks 2-3 browser cases).
5. A printed sheet is inside the redesigned shell or a section dialog: output dimensions and print-only visibility must remain correct (Tasks 7-10 print-preview cases).

## File map and dependencies

| Unit | Paths | Responsibility |
| --- | --- | --- |
| Material layer | `src/styles.js`, new `src/registrar.css`, `src/main.jsx` | Scoped screen-only tokens, layout classes, fallback and motion rules |
| Shared controls | `src/components/ui.jsx`, new `src/components/DialogFrame.jsx` | Surface variants, labels/focus, accessible overlays, mutation feedback |
| Navigation | `src/components/Shell.jsx`, new `src/components/NavIcon.jsx`, new `src/lib/navigation.js` | Nine destinations, rail preference, compact/mobile shell |
| Dashboard logic | `src/lib/dashboardStats.js`, `src/lib/dashboardStats.test.js` | Eligible sections, coverage, pending list, school-year activity |
| Resource lifecycle | `src/hooks/useCollection.js`, new `src/lib/resourceSubscription.js`, its test | Loading/error/retry with compatible legacy APIs |
| Date lifecycle | new `src/hooks/useLocalToday.js`, new `src/lib/localDayClock.js`, its test | Shared local day refreshed after sleep/midnight |
| Attendance entry | `src/App.jsx`, `src/pages/AttendanceTakePage.jsx`, new `src/lib/attendanceEntry.js`, its test | Validate initial section/date and preserve edits |
| Dashboard composition | `src/pages/DashboardPage.jsx`, new `src/components/dashboard/AttentionPanel.jsx`, new `src/components/dashboard/CoveragePanel.jsx`, `src/components/GradeBarChart.jsx` | Action hierarchy and truthful summaries |
| Page migrations | Existing page paths enumerated in Tasks 7-9 | Consistent readable workflows |
| Verification record | new `docs/superpowers/reviews/2026-09-25-sims-glassmorphism-verification.md` | Actual results and remaining limitations |

Task order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10.
Phase 1 is Tasks 1-2; Phase 2 is Tasks 3-6; Phase 3 is Tasks 7-8;
Phase 4 is Task 9; Phase 5 is Task 10. A task's numbered steps are separate
execution actions; check off only after its stated evidence is collected.

## Task 1: Scoped materials and readable shared controls

**Files:** Modify `src/styles.js`, `src/components/ui.jsx`, `src/main.jsx`;
create `src/registrar.css`; modify `DESIGN.md` during implementation.

**Interfaces:** Preserve `T`, `S`, and existing component props. Add
`Card({ surface = 'working', as = 'div', className = '', style, ...props })`
with `surface` restricted to `working | summary | navigation`. The shell
will mount `.sims-ui`; screen styles activate only inside that root.

- [ ] **1. Capture baseline:** inspect git status, run `npm test` and `npm run build`, and save desktop/dashboard and ID-card print previews before edits. Record existing failures separately; do not rewrite unrelated code to make the baseline green. Load Impeccable's craft-floor before editing UI.
- [ ] **2. Add scoped CSS:** import `./registrar.css` from `main.jsx`; retain current T/S fallback values so login and print remain unchanged. Add glass token entries rather than replacing unrelated tokens. Start with:

```css
@media screen {
  .sims-ui {
    --sims-nav: rgba(255,255,255,.78);
    --sims-summary: rgba(255,255,255,.87);
    --sims-working: rgba(255,255,255,.98);
    --sims-radius: 16px;
    --sims-glass-radius: 24px;
    --sims-field-font: 14px;
    --sims-field-radius: 12px;
    --sims-edge: rgba(255,255,255,.8);
  }
  .sims-ui .sims-surface--working { --sims-surface-fill: var(--sims-working); }
  .sims-ui .sims-surface--summary {
    --sims-surface-fill: var(--sims-summary);
    --sims-radius: var(--sims-glass-radius);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
  .sims-ui .sims-surface--navigation {
    --sims-surface-fill: var(--sims-nav);
    --sims-radius: var(--sims-glass-radius);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
  }
  .sims-ui :focus-visible { outline: 3px solid #4638C2; outline-offset: 3px; }
  .sims-ui button:disabled { cursor: not-allowed; opacity: .65; }
  .sims-ui .sims-heading, .sims-ui .sims-toolbar {
    display: flex; flex-wrap: wrap; gap: 16px; align-items: center;
  }
  .sims-ui .sims-form-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px; }
  .sims-ui .sims-table-scroll { max-width: 100%; overflow-x: auto; }
  .sims-ui .sims-surface { min-width: 0; }
}
@media screen and (max-width: 767px) {
  .sims-ui .sims-form-grid { grid-template-columns: minmax(0,1fr); }
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  @media screen { .sims-ui .sims-surface { --sims-surface-fill: #fff; } }
}
@media screen and (prefers-reduced-transparency: reduce) {
  .sims-ui .sims-surface { --sims-surface-fill: #fff; backdrop-filter: none; -webkit-backdrop-filter: none; }
}
@media screen and (prefers-reduced-motion: reduce) {
  .sims-ui *, .sims-ui *::before, .sims-ui *::after { animation: none !important; transition: none !important; }
}
```

- [ ] **3. Extend Card without leaking props:** consume `surface` and `className` before spreading DOM props; use `background: 'var(--sims-surface-fill, #fff)'` and `borderRadius: 'var(--sims-radius, 14px)'`, then spread caller `style`. Preserve `as`, button semantics, and existing padding ownership. Set light edge/shadow on glass classes; keep working borders distinguishable.

```jsx
<Tag {...props} className={`sims-surface sims-surface--${surface} ${className}`}
  style={{ background: 'var(--sims-surface-fill, #fff)', border: `1px solid ${T.border}`,
    borderRadius: 'var(--sims-radius, 14px)', boxShadow: T.cardShadow, ...style }}>
  {children}
</Tag>
```

- [ ] **4. Make controls readable:** append classes to Btn/Inp/Sel; use CSS variables with current numeric fallback values for screen-only font/radius changes. Preserve form-submit behavior and current callbacks. Add `useId` in Field and clone its single control with `id`, `aria-invalid`, and `aria-describedby` pointing to an error ID; preserve any caller-provided IDs/descriptions. Replace inline `outline: none` with a visible focus treatment. Use a 44px minimum screen hit area on primary interactive controls.
- [ ] **5. Verify and document:** run `npm run build`; inspect default working Card, explicit summary Card, disabled controls, labels and validation with keyboard. Confirm login and print baseline have no visual changes. Record implemented tokens and migration status in DESIGN.md. Stage only task files and commit `feat: add scoped registrar glass surfaces`.

## Task 2: Floating sidebar and accessible overlay foundation

**Files:** Modify `src/components/Shell.jsx`, `src/components/ui.jsx`,
`src/registrar.css`; create `src/components/NavIcon.jsx`,
`src/components/DialogFrame.jsx`, `src/lib/navigation.js`.

**Interfaces:** `NAV_ITEMS` exports `{ key, label, icon }[]` for the existing nine destinations.
`NavIcon({ name, size = 20 })` renders decorative local SVG with `aria-hidden`.
`DialogFrame({ open = true, onClose, label, labelledBy, dismissible = true, className, style, children })`
renders a native dialog and manages showModal/close, cancel, outside-click,
and opener focus restoration. `Modal` retains width/overlayClassName and adds
`title`, `labelledBy`, `dismissible` props. Keep it in the caller's DOM tree;
do not portal printed section contents out of existing print selectors.

- [ ] **1. Define navigation data:** use keys `dashboard`, `students`, `sections`, `schedules`, `enroll`, `attendance`, `idcards`, `guardians`, `settings`; copy current labels exactly. Author one coherent 24x24 outline SVG set, including menu, collapse, and sign-out icons. No external icon package.
- [ ] **2. Implement DialogFrame lifecycle:** open via a dialog ref in an effect; record `document.activeElement`, call `showModal()` only if not open, and close on cleanup. Native modal behavior supplies inert background and focus containment. Cancel must call preventDefault and invoke `onClose` only when dismissible. Outside-click closes only when coordinates lie outside the dialog bounding box. Restore focus only if the opener remains connected and visible; allow a caller fallback to the main menu button on viewport changes.

```jsx
<dialog ref={dialogRef} aria-label={labelledBy ? undefined : label}
  aria-labelledby={labelledBy} className={className} style={style}
  onCancel={(event) => { event.preventDefault(); if (dismissible) onClose(); }}>
  {children}
</dialog>
```

Map Modal to this frame with the existing `overlayClassName` retained, `maxWidth: 'calc(100vw - 32px)'`, and opaque working content. Give legacy callers a fallback label `Dialog` until their page migration supplies descriptive labels. Keep current print overlay selectors effective; inspect `src/lib/slipLayout.js` and `src/pages/idCardPrintLayout.js` before adapting wrapper markup.
- [ ] **3. Implement rail preference:** storage key `sims.sidebar.collapsed`, values `true`/`false`. Wrap reads/writes in try/catch. With no explicit stored choice, use expanded >=1024px and compact 768-1023px. Below 768px always use a menu drawer; on returning to desktop apply the stored preference. Use matchMedia listeners with cleanup; never read localStorage during module import.
- [ ] **4. Build screen-scoped shell layout:** root remains `.app-shell` and gains `.sims-ui`. Retain `.app-sidebar` and `.app-topbar` hooks for print. Move width/height/background layout out of conflicting inline styles and into screen-only rules; add static radial gradients, 24px floating gutters, 232px/72px rail, and `minmax(0,1fr)` main column. Main retains a scroll region. Add a skip link to `#sims-main` and `tabIndex={-1}` on main. Header shows current page and school year; keep one page h1 in content.

```jsx
<button aria-current={page === item.key ? 'page' : undefined}
  aria-label={collapsed ? item.label : undefined}
  onClick={() => { setPage(item.key); setDrawerOpen(false); }}>
  <NavIcon name={item.icon} />
  <span className={collapsed ? 'sims-nav-tooltip' : ''}>{item.label}</span>
</button>
```

Tooltips must display on focus as well as hover. Keep account identity accessible when compact; label sign-out. Collapse button uses `aria-expanded`; drawer opener also uses `aria-controls`. Close drawer on desktop breakpoint transition and move focus to a visible destination if its opener disappears.
- [ ] **5. Browser verification:** navigate all nine destinations at 1440, 900, and 390px; test active state, storage-denied reload, hover/focus labels, skip link, Tab/Shift+Tab inside drawer, Escape, drawer-open resizing, and focus after close. Check long account names. Inspect section-dialog print preview before accepting the overlay change. Run `npm run build`; commit explicit task files as `feat: add floating accessible registrar navigation`.

## Task 3: Correct dashboard record coverage and activity scope

**Files:** Modify `src/lib/dashboardStats.js`, `src/lib/dashboardStats.test.js`,
and the recentEnrollments call in `src/pages/DashboardPage.jsx`.

**Interfaces:** Add `attendanceCoverage({ students, sections, enrollments, attendance, schoolYear, date })`
returning `{ eligibleSections, pendingSections, recordedCount, totalSections, percent }`.
Lists contain original section objects sorted by grade then name; `percent`
is rounded integer or null for no eligible sections. Change
`recentEnrollments(enrollments, schoolYear, limit = 5)` to filter before sort/limit;
update its Dashboard call in this task to keep builds working. Leave existing
`todayAttendance` available until Task 6 removes its dashboard usage.

- [ ] **1. Write failing fixtures and assertions:** add these cases to the existing Vitest file (import attendanceCoverage). Reuse `depedSort` membership semantics: resolvable students with sex M or F, without introducing a new active-only restriction.

```js
const schoolYear = '2026-2027', date = '2026-09-25';
const students = [{ id: 's1', sex: 'M', firstName: 'Test', lastName: 'One' },
  { id: 's2', sex: 'F', firstName: 'Test', lastName: 'Two' }];
const sections = [{ id: 'a', name: 'A', gradeLevel: 7, schoolYear },
  { id: 'b', name: 'B', gradeLevel: 8, schoolYear },
  { id: 'empty', name: 'Empty', gradeLevel: 9, schoolYear }];
const enrollments = [{ studentId: 's1', sectionId: 'a', status: 'enrolled', schoolYear },
  { studentId: 's2', sectionId: 'b', status: 'enrolled', schoolYear }];
const base = { students, sections, enrollments, schoolYear, date };
it('counts distinct eligible records including saved empty marks', () => {
  const record = { sectionId: 'a', date, schoolYear, marks: {} };
  const result = attendanceCoverage({ ...base, attendance: [record, record,
    { ...record, sectionId: 'empty' }, { ...record, sectionId: 'orphan' },
    { ...record, sectionId: 'b', schoolYear: '2025-2026' }] });
  expect(result).toMatchObject({ recordedCount: 1, totalSections: 2, percent: 50 });
  expect(result.pendingSections.map(s => s.id)).toEqual(['b']);
});
it('has no completion percentage without an eligible roster', () => {
  expect(attendanceCoverage({ ...base, enrollments: [], attendance: [] }))
    .toMatchObject({ totalSections: 0, percent: null, pendingSections: [] });
});
```

Add parameterized records for previous date, missing schoolYear, unknown section,
both eligible sections, no records, and duplicate enrollments. Assert 0/50/100
only for nonzero denominator, no inflation, sorted pending sections, excluded
unresolvable learners, and current-year recent activity before limiting.
- [ ] **2. Run red:** `npm test -- src/lib/dashboardStats.test.js`; expect missing export/new-signature assertions to fail before implementation.
- [ ] **3. Implement pure derivation:** build a student ID set from `depedSort(students)`, a current-year enrolled-section set from resolvable learners, and eligible sections from current-year section documents. Deduplicate eligible IDs. Build the recorded ID set only for matching year/date and eligible IDs. Derive counts/difference and use the zero-denominator rule; never count raw attendance array length.

```js
const recorded = new Set(attendance.filter(d => d.date === date &&
  d.schoolYear === schoolYear && eligibleIds.has(d.sectionId)).map(d => d.sectionId));
const pendingSections = eligibleSections.filter(s => !recorded.has(s.id));
const totalSections = eligibleSections.length;
return { eligibleSections, pendingSections, recordedCount: recorded.size,
  totalSections, percent: totalSections ? Math.round(recorded.size / totalSections * 100) : null };
```

- [ ] **4. Run green:** rerun the targeted file and `npm run build`; review current-year call sites with `rg -n 'recentEnrollments\(' src`. Commit as `fix: derive truthful school-year dashboard coverage`.

## Task 4: Explicit resource states and a fresh dashboard date

**Files:** Modify `src/hooks/useCollection.js`; create
`src/lib/resourceSubscription.js`, `src/lib/resourceSubscription.test.js`,
`src/lib/localDayClock.js`, `src/lib/localDayClock.test.js`,
`src/hooks/useLocalToday.js`.

**Interfaces:** `startResourceSubscription(subscribe, publish, emptyValue)`
takes `subscribe(next, fail) => unsubscribe`, emits
`{ data, loading, error }`, and returns cleanup. The subscriber adapter maps
Firestore snapshots before calling next. Publish empty data on initial load
and on failure; this design does not display stale results.
`useCollectionResource(path)`, `useDocResource(path)`, and
`useQueryResource(buildQuery, deps)` return `{ data, loading, error, retry }`.
Legacy `useCollection`, `useDoc`, and `useQueryRows` remain compatible.
`startLocalDayClock({ now, schedule, cancel, onDay }) => { refresh, stop }`
uses injected Date/timeouts; `useLocalToday()` returns `YYYY-MM-DD`.

- [ ] **1. Test listener lifecycle before implementing:** use Node Vitest and callback fakes, without adding a component-test framework.

```js
it('ignores late data and errors after unsubscribe', () => {
  let next, fail; const unsubscribe = vi.fn(), publish = vi.fn();
  const stop = startResourceSubscription((n, f) => {
    next = n; fail = f; return unsubscribe;
  }, publish, []);
  expect(publish).toHaveBeenLastCalledWith({ data: [], loading: true, error: null });
  next([{ id: 'first' }]);
  expect(publish).toHaveBeenLastCalledWith({ data: [{ id: 'first' }], loading: false, error: null });
  stop(); const calls = publish.mock.calls.length;
  next([{ id: 'late' }]); fail(new Error('late failure'));
  expect(publish).toHaveBeenCalledTimes(calls);
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});
```

Also test synchronous subscribe failure, successful empty result versus loading,
failure after a successful result clearing data, and retry via a fresh
subscription after the previous cleanup. Run `npm test -- src/lib/resourceSubscription.test.js` and verify red.
- [ ] **2. Implement the lifecycle helper:** set active before subscribe, publish initial state, wrap subscribe in try/catch, and guard both callbacks by active. Return idempotent cleanup that marks inactive before unsubscribing. No Firebase imports in this module.

```js
export function startResourceSubscription(subscribe, publish, emptyValue) {
  let active = true, unsubscribe = () => {};
  const fail = error => { if (active) publish({ data: emptyValue, loading: false, error }); };
  publish({ data: emptyValue, loading: true, error: null });
  try {
    unsubscribe = subscribe(data => {
      if (active) publish({ data, loading: false, error: null });
    }, fail) || (() => {});
  } catch (error) { fail(error); }
  return () => { if (active) { active = false; unsubscribe(); } };
}
```

- [ ] **3. Integrate resource hooks:** each resource owns one listener, retry counter, and memoized retry callback. Tag stored state by path/retry generation and return a loading state immediately if the current key differs, before the effect executes. Cleanup the previous generation before retry. For document resources, null path returns `{ data: null, loading: false, error: null }` without a request. For null bounded query, return successful empty data. Keep caller-specified query dependencies and limits intact. Do not call both legacy and resource hooks for the same collection on a page.

```js
// Collection adapter inside the effect; key identifies path + retry generation.
return startResourceSubscription((next, fail) =>
  onSnapshot(collection(db, path), snapshot =>
    next(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))), fail),
  value => setState({ key, ...value }), []);
```

Leave App authentication/settings boot behavior unchanged; these APIs are
for scoped page migrations. Document resource absence is success with null,
distinct from loading and permission failure.
- [ ] **4. Test the local-day scheduler:** inject controllable now/schedule/cancel. Assert initial date, next local midnight scheduling, date refresh after a multi-day sleep, no duplicate emission for the same day, and cleanup cancellation. Run `npm test -- src/lib/localDayClock.test.js` to confirm red, then implement with existing `localDate`:

```js
it('refreshes after sleep without leaking a timer', () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date(2026, 8, 25, 23, 59, 59));
    const onDay = vi.fn();
    const clock = startLocalDayClock({ now: () => new Date(),
      schedule: (fn, delay) => setTimeout(fn, delay), cancel: clearTimeout, onDay });
    expect(onDay).toHaveBeenLastCalledWith('2026-09-25');
    vi.advanceTimersByTime(1100);
    expect(onDay).toHaveBeenLastCalledWith('2026-09-26');
    vi.setSystemTime(new Date(2026, 8, 28, 9));
    clock.refresh();
    expect(onDay).toHaveBeenLastCalledWith('2026-09-28');
    const calls = onDay.mock.calls.length;
    clock.refresh();
    expect(onDay).toHaveBeenCalledTimes(calls);
    clock.stop();
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});
```

Use this scheduling calculation inside the implementation:

```js
const current = now();
const midnight = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
const delay = Math.max(1, midnight.getTime() - current.getTime() + 50);
```

Refresh cancels the previous timer, publishes only if local day changed, and
reschedules. Stop makes future callbacks inert. The hook listens to window
focus and document visibilitychange (refresh when visible), cleans up both,
and uses the existing browser-local convention. Do not change report timezone
semantics in this redesign.
- [ ] **5. Verify:** run both new test files. In the eventual Task 6 browser view, inject delayed success/error through local development tooling and verify no false zero; switch school year/query inputs and retry to confirm stale results never flash. This integration case is completed in Task 6. Commit as `feat: expose resource status and live local date`.

## Task 5: Safe direct entry into section attendance

**Files:** Modify `src/App.jsx`, `src/pages/AttendanceTakePage.jsx`;
create `src/lib/attendanceEntry.js`, `src/lib/attendanceEntry.test.js`.

**Interfaces:** `resolveAttendanceEntry({ sectionId, date, schoolYear, sections, ready })`
returns `{ status: 'pending' | 'none' | 'valid' | 'invalid', sectionId, date, message }`.
Pending/none/invalid return empty sectionId; validate date by a numeric
YYYY-MM-DD parse and round-trip through localDate, not UTC Date parsing.
`AttendanceArea({ schoolYear, entry })` passes initial entry to
`AttendanceTakePage({ schoolYear, entry })`. Entry shape is `{ sectionId, date }`.

- [ ] **1. Add test cases:** valid section/current year/date, delayed sections returning pending, no entry returning none, removed section, wrong-year section, and impossible date returning invalid with a readable message. Include this exact invalid-date case:

```js
expect(resolveAttendanceEntry({ sectionId: 'a', date: '2026-02-30',
  schoolYear: '2026-2027', sections: [{ id: 'a', schoolYear: '2026-2027' }], ready: true }))
  .toMatchObject({ status: 'invalid', sectionId: '' });
```

Run `npm test -- src/lib/attendanceEntry.test.js` and confirm red; implement
the resolver without Firestore or React imports, then confirm green.
- [ ] **2. Pass the request through the current switcher:** preserve Students pageParams. Add a navigation sequence increment to `setPage` so repeated section shortcuts have distinct identities; use that sequence only to initialize an explicit new attendance navigation, never collection snapshots.

```jsx
{page === 'attendance' && <AttendanceArea key={navigationSequence}
  schoolYear={schoolYear} entry={pageParams?.attendanceEntry} />}
// Dashboard invocation in Task 6:
setPage('attendance', { attendanceEntry: { sectionId: section.id, date: today } });
```

AttendanceArea initially selects Take Attendance. Ordinary internal tab clicks
continue to work. Use useCollectionResource for sections so absence is not
decided before loading completes. Initialize a valid entry once; invalid entry
shows `This section is unavailable for the current school year. Choose another section.`
or `This attendance date is invalid. Choose a date.` and the regular picker.
- [ ] **3. Preserve edits:** track consumed entry in a ref; only apply it after ready and only once per navigation. Do not add sections/enrollments snapshots as dependencies to the marks-reset effect. For a selected section removed during an edit, retain the local marks, disable saving, and display an unavailable-section message; reset only when the user explicitly chooses a new valid section/date. No automatic write on navigation.
- [ ] **4. Browser scenario:** enter a section from dashboard, mark one learner, trigger an unrelated collection snapshot, and confirm the unsaved mark remains. Test wrong-year/removed entry and delayed section loading. Trigger a section removal in a synthetic environment while editing; confirm save is disabled and values remain visible. Run `npm test -- src/lib/attendanceEntry.test.js src/lib/attendance.test.js` and `npm run build`. Commit as `feat: open attendance from validated dashboard shortcuts`.

## Task 6: Compose the action-focused dashboard

**Files:** Modify `src/pages/DashboardPage.jsx`, `src/components/GradeBarChart.jsx`,
`src/registrar.css`; create `src/components/dashboard/AttentionPanel.jsx`,
`src/components/dashboard/CoveragePanel.jsx`.

**Interfaces:** `AttentionPanel({ unassigned, pendingSections, date, onUnassigned, onSection })`;
`CoveragePanel({ recordedCount, totalSections, percent })`. Children consume
derived values only. Dashboard owns resources/date and navigation. Each
component uses shared Card; AttentionPanel owns its View all dialog state.

- [ ] **1. Replace array-only dashboard subscriptions:** use one resource each for students, sections, enrollments, attendance. Use useLocalToday once. Gate the derived UI before displaying counts:

```jsx
const resources = [studentsResource, sectionsResource, enrollmentsResource, attendanceResource];
const failure = resources.find(resource => resource.error);
const loading = resources.some(resource => resource.loading);
if (failure) return <Card><p role="alert">Dashboard data could not be loaded.</p>
  <Btn onClick={() => resources.filter(r => r.error).forEach(r => r.retry())}>Try again</Btn></Card>;
if (loading) return <div role="status" aria-live="polite" className="sims-dashboard-loading">Loading dashboard…</div>;
```

Keep hook invocation order stable; derive with useMemo above returns or pure
functions below them. Use stable-size neutral placeholders, not numeral zero.
Compute coverage with Task 3 and current-year recent enrollment list.
- [ ] **2. Compose reading order:** page heading/date/action, attention panels, three support totals, chart/coverage row, recent activity. Use responsive CSS classes, not inline fixed repeat(5,1fr). Avoid redundant h1 in the Shell header. Preserve empty learners' enrollment action and meaningful no-activity text.

```css
@media screen {
  .sims-ui .sims-dashboard-pair { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 24px; }
  .sims-ui .sims-dashboard-totals { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 16px; }
}
@media screen and (max-width: 900px) {
  .sims-ui .sims-dashboard-pair, .sims-ui .sims-dashboard-totals { grid-template-columns: minmax(0,1fr); }
}
```

- [ ] **3. Wire attention:** unassigned action calls existing `setPage('students', { gradeFilter: UNASSIGNED, status: 'active' })`. Show first five pending sections; View all opens `Modal title="Sections without attendance records"` with all sorted sections. Every section button passes Task 5's entry. Use explicit action text instead of decorative arrows alone. When unassigned is zero, say `All active learners are assigned`; when no pending sections with a positive denominator, say `Every enrolled section has an attendance record today`. No eligible sections says `No enrolled sections`.
- [ ] **4. Render coverage honestly:** heading `Sections with attendance records`; count `recordedCount of totalSections`; explanation `Records may come from registrar entry or kiosk activity. This does not indicate completed review or learner presence.` Use `<progress max={totalSections} value={recordedCount}>` with an accessible label only for a positive denominator. No present-rate gauge. Pending label is neutral `No attendance record today`; on weekends use `No records for this date` and no deadline language.
- [ ] **5. Repair chart sizing as part of its visual migration:** GradeBarChart currently places percentage-height bars in auto-height columns. Give the plot a definite 160px height and bars a predictable height from values; zero is zero, not a visible nonzero bar. Keep grade labels/counts in normal flow and accessible as text. Preserve the counts API and avoid adding a chart dependency.

```jsx
const height = max > 0 ? Math.round(value / max * 160) : 0;
<div className="sims-chart-track" style={{ height: 160, display: 'flex', alignItems: 'flex-end' }}>
  <div aria-hidden="true" style={{ height, width: '100%', background: T.primary, borderRadius: '8px 8px 0 0' }} />
</div>
```

- [ ] **6. Verify phase 2:** run `npm test -- src/lib/dashboardStats.test.js src/lib/attendanceEntry.test.js src/lib/resourceSubscription.test.js src/lib/localDayClock.test.js` and `npm run build`. Browser-check zero/partial/full coverage, more than five pending sections, no learners, long section names, retry, loading, midnight visibility refresh, and both action destinations. Use labelled synthetic data only in a local development/emulator session; do not add production mock fallbacks or write test learners to the live project. Commit as `feat: build action-focused glass dashboard`.

## Task 7: Migrate learner, enrollment, and section workflows

**Files:** Modify `src/pages/StudentsPage.jsx`, `src/pages/StudentForm.jsx`,
`src/pages/ImportStudentsWizard.jsx`, `src/pages/EnrollPage.jsx`,
`src/pages/SectionsPage.jsx`, `src/pages/SectionDetailModal.jsx`,
`src/components/ui.jsx`, `src/registrar.css`.

**Interfaces:** Existing page/data APIs remain unchanged. Shared Confirm adds
optional `title` and internally manages pending/error for `onYes` promises.
Use resource APIs from Task 4 without changing collection paths.

- [ ] **1. Migrate Students list:** give filters visible labels, use `.sims-toolbar` wrapping, and retain search/grade/section/status logic exactly. Wrap the table in `.sims-table-scroll` with `role="region"`, `aria-label="Learner records"`, and `tabIndex={0}`. Keep Card working/opaque and distinguish loading, retrieval failure/retry, no learners, and no filter matches. Remove fixed minWidth declarations that overflow phones.
- [ ] **2. Migrate StudentForm and section forms:** replace fixed 2/3-column grids with `.sims-form-grid`; supply descriptive Modal title/labelledBy. Add a synchronous in-flight ref guard, saving state, and visible save error while retaining all field values. Disable dismissal while a save is pending, and reenable on failure. Keep all current validation and LRN/track/strand logic.

```js
if (inFlight.current) return;
inFlight.current = true; setSaving(true); setSaveError('');
try { await persist(); onClose(); }
catch { setSaveError('Changes could not be saved. Your entries are still here. Try again.'); }
finally { inFlight.current = false; setSaving(false); }
```

`persist` in this pattern is the existing operation at each call site, e.g.
`editing ? updateStudent(editing.id, f) : createStudent(f)` in StudentForm.
Do not introduce a new data service or swallow validation errors.
- [ ] **3. Make Confirm robust:** await its existing onYes, hold a ref lock, disable both actions/dismissal while pending, and show failure inside the dialog without closing it. The caller continues to close after success. Native window.confirm flows in Guardians are left to Task 9 review. Verify two rapid activations trigger one operation.
- [ ] **4. Migrate enrollment and import:** use a responsive two-column-to-one-column layout for enrollment; keep existing learner search and transfer/withdraw confirmation. Add pending/error feedback to the current write handlers without changing deterministic enrollment IDs. For ImportStudentsWizard retain mapping, preview, validation, batch progress, and error recovery; restyle each step with working surfaces and readable row errors. No new import behavior.
- [ ] **5. Migrate Sections and detail dialog:** keep filters and roster ordering. Make table/toolbar responsive and dialog titled; preserve SectionDetailModal's QR readiness and print controls. Do not modify IdCardsPrintable markup or print-only roster placement.
- [ ] **6. Verify:** run `npm test -- src/lib/validation.test.js src/lib/studentImport.test.js src/lib/roster.test.js src/pages/idCardPrintLayout.test.js` and `npm run build`. Browser-test duplicate LRN, SHS track/strand, long names, empty/filter-miss, failed save retaining fields, double-click prevention, import error rows, moving an enrollment, and section QR print preview. Use emulator/synthetic records for writes. Commit explicit paths as `feat: migrate learner workflows to readable glass layouts`.

## Task 8: Migrate attendance and monthly summary

**Files:** Modify `src/App.jsx` (AttendanceArea presentation),
`src/pages/AttendanceTakePage.jsx`, `src/pages/AttendanceSummaryPage.jsx`,
`src/registrar.css`.

**Interfaces:** Keep Task 5 entry behavior and existing data/save/export APIs.
Use Task 4 resource APIs for page collections and the selected attendance doc;
do not treat a pending attendance doc as loaded default-Present data.

- [ ] **1. Restyle filters and mode controls:** use readable working surfaces and wrapping fields. Mode buttons remain ordinary buttons with `aria-pressed`; preserve both lazy imports. Use screen-only row/table classes and solid sticky columns in Monthly Summary so content cannot show through.
- [ ] **2. Gate editing on data readiness:** successful missing attendance document still permits present-by-default editing. Loading or failed retrieval disables save and displays status/retry. Preserve session overrides and the existing section/date-only reset behavior. Add a catch to saveMarks; keep unsaved overrides and show `Attendance could not be saved. Your changes are still here.` On successful persistence keep the existing Saved feedback.

```jsx
<Btn disabled={saving || loading || Boolean(error) || !selectedSectionAvailable}
  onClick={doSave}>{saving ? 'Saving…' : 'Save attendance'}</Btn>
{saveError && <p role="alert">{saveError}</p>}
```

Here loading/error aggregate the exact resources needed for the selected
roster/document; selectedSectionAvailable is derived from loaded current-year
sections. Do not display old section marks under a new section while loading.
- [ ] **3. Preserve row operations:** keyboard activation cycles P/L/A/E once; no nested interactive controls in clickable rows. Keep names, LRNs, Time In/Out and status visible at 200% zoom; use a labelled horizontal scroll area where the roster cannot sensibly stack. Keep monthly summary's sticky identity columns opaque and export availability tied to successfully loaded inputs.
- [ ] **4. Verify:** run `npm test -- src/lib/attendance.test.js src/lib/dates.test.js src/lib/sf2Template.test.js src/lib/attendanceEntry.test.js` and `npm run build`. Browser-test a missing doc, empty roster, network error, save failure/retry, live snapshots during editing, keyboard cycling, month switch, export failure, and an SF2 workbook comparison. Confirm no schema, attendance-default, or report calculation changes. Commit as `feat: refresh attendance working surfaces and feedback`.

## Task 9: Migrate schedules, ID Cards, Guardians, and settings

**Files:** Modify `src/pages/SchedulesPage.jsx`, `src/pages/IDCardsPage.jsx`,
`src/pages/SettingsPage.jsx`, `src/pages/GuardiansPage.jsx`,
`src/pages/guardians/CodesTab.jsx`, `RequestsTab.jsx`, `ReportsTab.jsx`,
`LinksTab.jsx`, `DevicesTab.jsx`, `ScanLogTab.jsx`, `AuditTab.jsx`,
`PortalSettingsTab.jsx` (all eight names under `src/pages/guardians/`),
and `src/registrar.css`.

**Interfaces:** Preserve every existing API call and Firestore query builder,
including its where/orderBy/limit clauses. Use useQueryResource for explicit
bounded-query states, not useCollectionResource on log/link/request collections.
Keep lazy tabs, me prop, schoolYear prop, and existing permission affordances.

- [ ] **1. Schedules and Settings:** apply responsive working surfaces and labelled fields. Reuse the pending/error pattern from Task 7 at each existing write handler, with a ref guard and locally retained input. For Settings use useDocResource, initialize local fields once after successful loading (including a nonexistent document), and never overwrite edits on later snapshots. Show retrieval failure before allowing an uninformed overwrite.
- [ ] **2. ID Cards:** refresh on-screen section selection and action toolbar only; add resource loading/error feedback. Preserve printable components, QR generation and existing readiness conditions. Confirm print-only sheets are unaffected by class changes and print remains unavailable while necessary data/QR preparation is incomplete.
- [ ] **3. Guardians tab navigation:** preserve current labels and order. Complete the existing tab semantics with `aria-controls`, matching tabpanel IDs, roving tabIndex, and ArrowLeft/Right/Home/End keyboard selection. Render only the selected lazy tab. Wrap labels on smaller screens rather than adding page-wide horizontal scrolling.

```jsx
<button role="tab" id={`guardian-tab-${key}`} aria-selected={active}
  aria-controls={`guardian-panel-${key}`} tabIndex={active ? 0 : -1}>
  {label}
</button>
<div role="tabpanel" id={`guardian-panel-${tab}`} aria-labelledby={`guardian-tab-${tab}`}>
  {selectedTabContent}
</div>
```

`selectedTabContent` is the existing selected-tab conditional JSX, still
wrapped in Suspense; do not statically import all tabs.
- [ ] **4. Migrate each tab individually:** Codes gets a wrapping section/issue/print toolbar; Requests gets readable request rows and guarded approve/reject buttons; Reports retains existing status/action distinctions; Links gets stacked search/filter controls; Devices gets readable provisioning/actions; Scan Log and Audit get labelled bounded tables and failure/retry states; Portal Settings gets grouped labelled controls and retained unsaved edits. Replace conflicting fixed inline grid columns with `.sims-form-grid`/`.sims-toolbar`. Preserve destructive-action confirmation and backend call parameters. Show busy/error per affected row so repeat clicks cannot submit twice. Leave credential output visibility rules unchanged.
- [ ] **4a. Activation slips checkpoint:** section picker and issue/print controls wrap at 390px; successful slips retain existing QR and print data; failed issuance keeps the previous selection and displays the existing error.
- [ ] **4b. Access requests checkpoint:** approve/reject actions preserve eligibility conditions; a pending action disables repeat activation on its row; failure keeps the request visible.
- [ ] **4c. Reports checkpoint:** preserve existing resolve/correct actions and status meanings; failed actions show row-level feedback without optimistic disappearance.
- [ ] **4d. Learner access checkpoint:** filters stack cleanly and query limits remain exact; link/revoke failures preserve selected context.
- [ ] **4e. Kiosk devices checkpoint:** existing registration/revocation controls remain labelled and guarded; no new credential persistence or exposure.
- [ ] **4f. Scan log checkpoint:** long rows scroll within a labelled region; loading and query failure cannot look like an empty log.
- [ ] **4g. Audit log checkpoint:** target filter retains its bounded query and readable IDs; retry uses the same filter.
- [ ] **4h. Portal settings checkpoint:** values initialize from successful retrieval once; live snapshots cannot erase local edits; save failure retains values.
- [ ] **5. Verify each surface:** schedules create/edit failure, Settings delayed load and live snapshot while typing, QR print readiness, activation-slip print, bounded-query error versus empty result, and keyboard tab navigation across all eight panels. Run `npm test -- src/pages/idCardPrintLayout.test.js src/lib/slipLayout.test.js` and `npm run build`. Review diff for accidental query/schema changes and confirm separate lazy chunks for pages/tabs, ExcelJS, and QRCode remain. Commit explicit files as `feat: complete registrar glass interface migration`.

## Task 10: Cross-screen verification and implementation handoff

**Files:** Update `DESIGN.md`; create
`docs/superpowers/reviews/2026-09-25-sims-glassmorphism-verification.md`.
Any corrective code edits belong to their owning task files above.

**Interfaces:** Final evidence record contains environment, commands/exit
results, screenshot/print-preview paths, scenarios checked, contrast pairs,
performance observations, and unresolved limitations. Do not claim a check
was performed if authenticated or browser access was unavailable.

- [ ] **1. Run scoped regression/build checks:** `npm test`, then `npm run build`. Inspect generated chunk output, not just exit status. Backend/emulator rule suites are unnecessary if backend/rules remained untouched; if the implementation unexpectedly changes them, stop and reassess that scope before proceeding.
- [ ] **2. Execute the visual matrix:** inspect Dashboard and every registrar destination at 1440px and 1280px; inspect navigation, dashboard, longest form and widest table at 768px and 390px. Check 200% zoom, long names/counts, empty school, many sections, and retrieval failure. Store only synthetic-data screenshots in the verification evidence. Confirm every task's browser scenarios are accounted for.
- [ ] **3. Check contrast and effects:** measure text/control contrast against the lightest and darkest composited backdrop areas, inspect no-backdrop-filter and reduced-transparency fallback, reduced motion, focus visibility, labels, and keyboard dialog/tab behavior. Record actual ratios, browser and viewport. If glass fails contrast, increase surface opacity before darkening brand status colors.
- [ ] **4. Check performance and print:** scroll a long synthetic learner table and navigate lazily loaded pages under a recorded CPU-throttling profile or available office hardware. Reduce the number of blurred surfaces if frames visibly stall. Compare ID-card dimensions, section QR sheets, activation slips, and SF2 output with baseline; confirm no gradient, clipped sheet, missing QR, or dialog/backdrop leakage.
- [ ] **5. Run the required design detector once after the UI is finished:**

```powershell
node 'C:\Users\jitsb\.agents\skills\impeccable\scripts\detect.mjs' --json src/registrar.css src/styles.js src/components src/pages src/App.jsx
```

Inspect findings and fix material issues within scope; do not mechanically
rewrite legacy or printable components unrelated to this migration. Preserve
the report for the final fresh review; no repeated detector loop is required.
- [ ] **6. Document the shipped design:** update DESIGN.md with final measured tokens, three surface roles, shell widths/breakpoints, typography, status semantics, fallback/motion rules, and migrated-page coverage. Record all test/browser/print evidence and limitations in the review file. Run `git diff --check`, stage explicit final files, and commit `docs: record registrar redesign verification`.
- [ ] **7. Request a fresh final review:** follow the chosen execution workflow's review requirements and Impeccable finish review. Provide approved spec, this plan, diff, screenshots, reference image, DESIGN.md, detector output, and verification record. Resolve material findings; rerun only checks affected by corrective changes. No merge, push, or deployment is implied by finishing this plan.

## Coverage self-review

| Specification area | Owning tasks |
| --- | --- |
| Three glass materials, legibility, scoped fallback | 1, 10 |
| Nine destinations, collapse, mobile drawer and focus | 2 |
| Coverage eligibility, deduplication, null denominator, current-year activity | 3 |
| Loading/error/retry, midnight visibility refresh | 4, 6 |
| Validated section shortcut and retained attendance edits | 5, 8 |
| Attention-first dashboard, View all, truthful progress, chart | 6 |
| Students, forms, import, enrollment and sections | 7 |
| Attendance and Monthly Summary | 8 |
| Schedules, IDs, eight Guardians tabs, Settings | 9 |
| Responsive, keyboard, contrast, performance, print/export, documentation | 1-2, 7-10 |

The plan is a single frontend migration with shared interfaces; backend and
parent/kiosk subsystems remain outside it. No unresolved product choice is
delegated to an implementer. Initial numerical glass values may be tuned only
to meet the approved visual direction and measured accessibility/performance.

## Execution choice

Recommended: **Native execution** in this task. The ten tasks share CSS,
controls, and data-state interfaces, so one implementer can carry those
decisions consistently across phases. Use phase checkpoints and a fresh final
review. **Subagent-driven execution** is available for independent task
implementation/review gates, at the cost of additional context and handoffs.

Review this plan and select the execution method before implementation starts.
