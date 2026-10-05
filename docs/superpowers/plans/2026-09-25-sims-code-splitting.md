# SIMS Admin Code Splitting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the SIMS admin app's initial load time by splitting its single 1.9MB (545KB gzipped) JS bundle into per-page chunks, so a registrar only downloads the code for the page they're actually looking at instead of every page in the app up front.

**Architecture:** Convert the app's 10 top-level pages (`src/App.jsx`) and the Guardians screen's 8 sub-tabs (`src/pages/GuardiansPage.jsx`) from static `import` to `React.lazy()` + `Suspense`, mirroring the exact pattern already proven in this same repo's `parent/src/App.jsx`. This is the whole fix: two heavy per-page libraries (`exceljs`, used by the Students-import wizard and the SF2 export; `qrcode`, used by ID card printing and activation-slip printing) are only ever imported *by* these page/tab components, so once the pages themselves are lazy, those libraries stop being part of the initial bundle automatically — no separate extraction work needed.

**Tech Stack:** React 19, Vite 8, plain `React.lazy`/`Suspense` (no router library in this app — page selection is a hand-rolled `useState` switch in `App.jsx`).

## Global Constraints

- This app has no component-test framework (confirmed: zero `.test.jsx` files, zero `render(...)` calls anywhere in `src/`) — verify each change via `npm run build` (inspecting the actual chunk output) plus careful reading, matching this repo's established convention for JSX changes. Do not add a testing framework.
- The reference pattern to copy is `parent/src/App.jsx` — read it before starting either task: static imports only for whatever must be visible before the app can do anything else (there: `SignIn`/`Verify`; here: nothing needs to be eager except `Login`/`Shell`, both already correctly left alone), everything else `lazy(() => import(...))`, wrapped in one shared `<Suspense fallback={...}>` around the switch.
- Do not change any page's own internal code, only how `App.jsx`/`GuardiansPage.jsx` import and render it. Do not touch `exceljs`/`qrcode` usage directly — the plan's architecture note above is why that's unnecessary.
- Confirm the actual production build output contains separate chunk files per lazy-loaded page (not just that the build succeeds) — a build can succeed while still bundling everything into one file if `lazy()` is used incorrectly (e.g. re-exporting through a barrel file that itself is statically imported elsewhere).

---

### Task 1: Lazy-load the 10 top-level pages in `App.jsx`

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- No new exports or props — this task only changes *how* the existing page components are imported and rendered, not their own APIs. `AttendanceArea` (defined in this same file) keeps rendering `AttendanceTakePage`/`AttendanceSummaryPage` exactly as before; both are now module-scope `lazy()` bindings instead of static imports, which works identically from `AttendanceArea`'s point of view.

- [ ] **Step 1: Convert the static page imports to `React.lazy()`**

Replace lines 1 and 10-19 of `src/App.jsx`:

```js
import { useEffect, useState } from 'react';
```
```js
import DashboardPage from './pages/DashboardPage.jsx';
import StudentsPage from './pages/StudentsPage.jsx';
import SectionsPage from './pages/SectionsPage.jsx';
import SchedulesPage from './pages/SchedulesPage.jsx';
import EnrollPage from './pages/EnrollPage.jsx';
import AttendanceTakePage from './pages/AttendanceTakePage.jsx';
import AttendanceSummaryPage from './pages/AttendanceSummaryPage.jsx';
import IDCardsPage from './pages/IDCardsPage.jsx';
import GuardiansPage from './pages/GuardiansPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
```

with:

```js
import { useEffect, useState, lazy, Suspense } from 'react';
```
```js
// Route-split: each page (and everything only it imports, like exceljs for
// Students/Attendance-summary or qrcode for ID Cards/Guardians->Codes) loads
// only once actually navigated to, instead of all ten loading up front in
// the single initial bundle.
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const StudentsPage = lazy(() => import('./pages/StudentsPage.jsx'));
const SectionsPage = lazy(() => import('./pages/SectionsPage.jsx'));
const SchedulesPage = lazy(() => import('./pages/SchedulesPage.jsx'));
const EnrollPage = lazy(() => import('./pages/EnrollPage.jsx'));
const AttendanceTakePage = lazy(() => import('./pages/AttendanceTakePage.jsx'));
const AttendanceSummaryPage = lazy(() => import('./pages/AttendanceSummaryPage.jsx'));
const IDCardsPage = lazy(() => import('./pages/IDCardsPage.jsx'));
const GuardiansPage = lazy(() => import('./pages/GuardiansPage.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));

const PageFallback = () => <div style={{ fontFamily: T.body, color: T.inkMuted, padding: 24 }}>Loading…</div>;
```

(`T` is already imported at the top of this file from `./styles.js` — no new import needed for `PageFallback`.)

- [ ] **Step 2: Wrap the page switch in `<Suspense>`**

Replace the render block at the end of `App.jsx` (currently lines 73-88):

```jsx
  return (
    <>
      {reducedMotionGuard}
      <Shell me={me} page={page} setPage={setPage} schoolYear={schoolYear} onLogout={()=>{ signOut(auth); setMe(null); }}>
        {page==='dashboard' && <DashboardPage schoolYear={schoolYear} setPage={setPage} />}
        {page==='students' && <StudentsPage schoolYear={schoolYear} initialGradeFilter={pageParams?.gradeFilter} initialStatus={pageParams?.status} />}
        {page==='sections' && <SectionsPage schoolYear={schoolYear} />}
        {page==='schedules' && <SchedulesPage />}
        {page==='enroll' && <EnrollPage schoolYear={schoolYear} />}
        {page==='attendance' && <AttendanceArea schoolYear={schoolYear} />}
        {page==='idcards' && <IDCardsPage schoolYear={schoolYear} />}
        {page==='guardians' && <GuardiansPage schoolYear={schoolYear} me={me} />}
        {page==='settings' && <SettingsPage />}
      </Shell>
    </>
  );
```

with:

```jsx
  return (
    <>
      {reducedMotionGuard}
      <Shell me={me} page={page} setPage={setPage} schoolYear={schoolYear} onLogout={()=>{ signOut(auth); setMe(null); }}>
        <Suspense fallback={<PageFallback />}>
          {page==='dashboard' && <DashboardPage schoolYear={schoolYear} setPage={setPage} />}
          {page==='students' && <StudentsPage schoolYear={schoolYear} initialGradeFilter={pageParams?.gradeFilter} initialStatus={pageParams?.status} />}
          {page==='sections' && <SectionsPage schoolYear={schoolYear} />}
          {page==='schedules' && <SchedulesPage />}
          {page==='enroll' && <EnrollPage schoolYear={schoolYear} />}
          {page==='attendance' && <AttendanceArea schoolYear={schoolYear} />}
          {page==='idcards' && <IDCardsPage schoolYear={schoolYear} />}
          {page==='guardians' && <GuardiansPage schoolYear={schoolYear} me={me} />}
          {page==='settings' && <SettingsPage />}
        </Suspense>
      </Shell>
    </>
  );
```

Nothing else in `App.jsx` changes — `AttendanceArea`'s own definition, the `useState`/`useEffect` hooks, and the `!ready`/`!me` early returns above this block are untouched.

- [ ] **Step 3: Build and confirm real chunk-splitting**

Run: `npm run build`
Expected: succeeds. Then inspect `dist/assets/` — run `ls dist/assets/*.js` (or the platform equivalent) and confirm there are now multiple JS files, including ones whose names clearly correspond to the lazy-loaded pages (Vite names chunks after the source file by default, e.g. something like `StudentsPage-<hash>.js`, `GuardiansPage-<hash>.js`, `IDCardsPage-<hash>.js`, etc.) — not just one `index-<hash>.js`. Report the full `ls` output and the byte size of the new main `index-<hash>.js` compared to the pre-change baseline (1,896,027 bytes / ~545KB gzipped, from this session's most recent build) in your report.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, sign in as staff, and click through every one of the 9 nav destinations (Dashboard, Students, Sections, Schedules, Enroll, Attendance — both its Take and Monthly Summary sub-tabs, ID Cards, Guardians, Settings). Confirm each page still renders its normal content with no console errors, and that the brief "Loading…" fallback appears and disappears correctly on first visit to each page (open the browser's Network tab and confirm a new chunk request fires per page on first visit, and does NOT re-fire on a second visit to an already-loaded page). If you cannot complete a full authenticated click-through in your environment, say so explicitly in your report rather than claiming it — reading the diff plus the Step 3 build evidence is still a meaningful (if partial) verification, and DONE_WITH_CONCERNS is an honest status for that case.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "$(cat <<'EOF'
perf: route-split the 10 top-level SIMS pages

Converts App.jsx's static page imports to React.lazy(), matching the
pattern already used in parent/src/App.jsx. A registrar now only
downloads the page they navigate to, instead of every page (and what
each one pulls in, like exceljs and qrcode) loading in the single
initial bundle.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Lazy-load the 8 Guardians sub-tabs in `GuardiansPage.jsx`

**Files:**
- Modify: `src/pages/GuardiansPage.jsx`

**Interfaces:**
- Consumes: nothing new from Task 1. `GuardiansPage` itself is already lazy-loaded as a whole from `App.jsx` after Task 1 — this task additionally splits its 8 *internal* tabs from each other, since a registrar visiting the Guardians page to check the audit log has no reason to also download the Kiosk Devices tab's code (and vice versa).
- No prop/API changes to any of the 8 tab components themselves.

- [ ] **Step 1: Convert the static tab imports to `React.lazy()`**

Replace lines 1-10 of `src/pages/GuardiansPage.jsx`:

```js
import { useState } from 'react';
import { T, S } from '../styles.js';
import DevicesTab from './guardians/DevicesTab.jsx';
import CodesTab from './guardians/CodesTab.jsx';
import RequestsTab from './guardians/RequestsTab.jsx';
import ReportsTab from './guardians/ReportsTab.jsx';
import LinksTab from './guardians/LinksTab.jsx';
import ScanLogTab from './guardians/ScanLogTab.jsx';
import AuditTab from './guardians/AuditTab.jsx';
import PortalSettingsTab from './guardians/PortalSettingsTab.jsx';
```

with:

```js
import { useState, lazy, Suspense } from 'react';
import { T, S } from '../styles.js';

// Same reasoning as App.jsx's page split, one level down: each tab (and, for
// CodesTab, the qrcode-based activation-slip printing it pulls in) loads
// only once actually selected, not all eight up front.
const DevicesTab = lazy(() => import('./guardians/DevicesTab.jsx'));
const CodesTab = lazy(() => import('./guardians/CodesTab.jsx'));
const RequestsTab = lazy(() => import('./guardians/RequestsTab.jsx'));
const ReportsTab = lazy(() => import('./guardians/ReportsTab.jsx'));
const LinksTab = lazy(() => import('./guardians/LinksTab.jsx'));
const ScanLogTab = lazy(() => import('./guardians/ScanLogTab.jsx'));
const AuditTab = lazy(() => import('./guardians/AuditTab.jsx'));
const PortalSettingsTab = lazy(() => import('./guardians/PortalSettingsTab.jsx'));

const TabFallback = () => <div style={{ fontFamily: T.body, color: T.inkMuted, padding: 24 }}>Loading…</div>;
```

- [ ] **Step 2: Wrap the tab switch in `<Suspense>`**

Replace the render block (currently lines 28-35):

```jsx
      {tab === 'codes' && <CodesTab schoolYear={schoolYear} />}
      {tab === 'requests' && <RequestsTab schoolYear={schoolYear} />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'links' && <LinksTab schoolYear={schoolYear} />}
      {tab === 'devices' && <DevicesTab />}
      {tab === 'scanlog' && <ScanLogTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'settings' && <PortalSettingsTab me={me} />}
```

with:

```jsx
      <Suspense fallback={<TabFallback />}>
        {tab === 'codes' && <CodesTab schoolYear={schoolYear} />}
        {tab === 'requests' && <RequestsTab schoolYear={schoolYear} />}
        {tab === 'reports' && <ReportsTab />}
        {tab === 'links' && <LinksTab schoolYear={schoolYear} />}
        {tab === 'devices' && <DevicesTab />}
        {tab === 'scanlog' && <ScanLogTab />}
        {tab === 'audit' && <AuditTab />}
        {tab === 'settings' && <PortalSettingsTab me={me} />}
      </Suspense>
```

Nothing else in `GuardiansPage.jsx` changes — the `TABS` array, the tab-button row, and the `useState` hook are untouched.

- [ ] **Step 3: Build and confirm real chunk-splitting**

Run: `npm run build`
Expected: succeeds, and `dist/assets/` now additionally shows separate chunk files for each of the 8 tab components (e.g. `DevicesTab-<hash>.js`, `CodesTab-<hash>.js`, etc.), on top of the per-page chunks from Task 1. Report the `ls dist/assets/*.js` output.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, sign in as staff, navigate to Guardians, and click through all 8 tabs (Activation slips, Access requests, Reports, Learner access, Kiosk devices, Scan log, Audit log, Portal settings). Confirm each renders correctly with no console errors and the same first-visit-only chunk-loading behavior as Task 1. Same honesty rule as Task 1 Step 4: report DONE_WITH_CONCERNS with an explanation if a full authenticated click-through isn't achievable in your environment.

- [ ] **Step 5: Commit**

```bash
git add src/pages/GuardiansPage.jsx
git commit -m "$(cat <<'EOF'
perf: split the 8 Guardians sub-tabs into their own chunks

Same reasoning as the App.jsx page split, one level down inside the
already-lazy GuardiansPage: a registrar checking the audit log has no
reason to also download the Kiosk Devices tab's code, or vice versa.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
