# Parent App School Mode Implementation Plan (Plan B of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Parent app family-first and quiet. The Family/School switch moves into Settings and appears only for approved staff. Role requests and reviews leave the app. Advisers get a fast Class tab to flag learners who entered the gate but aren't in class.

**Architecture:** The chosen mode is stored per device (`localStorage` key `bnhs-portal-mode`) and read by `App.jsx`. School mode keeps the existing URL scheme (`/school`, `/announcements?view=school`, `/settings?view=school`), so notices and deep links keep working. The Class tab lives in `parent/src/screens/school/` and is lazy-loaded with the School route, so the eager bundle shrinks: the header switch and its CSS import leave `Shell.jsx`.

**Tech Stack:** React 19, Vite 8, Vitest 4 (pure `lib/` unit tests), Firebase callables.

## Global Constraints

- Depends on Plan A (`docs/superpowers/plans/2026-10-18-school-mode-backend.md`) being merged: `getSchoolRosterFn` returns `schedule`, `getSchoolContextFn` no longer returns `requests`/`reviewRequests`, and new grants create an inbox item of `type: 'school_access'`.
- Keep the current Parent app look: teal glass, the floating bottom nav, light and dark tokens from `shared/theme/theme.css`. Only use `var(--t-*)` colors; `shared/theme/literals.test.js` blocks hard-coded colors.
- Flag reasons, verbatim: `Not in class`, `Left during class`, `Other reason…`. Restore reasons: `Was in class`, `Flagged by mistake`. Undo reason: `Undone right after flagging`.
- Wording stays neutral. A flagged session reads `Not in class`, never "Absent" or anything that implies dishonesty.
- Advisers can correct only today. Past days are view-only, with this copy: `Past days are view-only. Your coordinator corrects earlier days in SIMS.`
- Bundle budget: eager JS must stay ≤ 260 KB gzip (`npm --prefix parent run size`). It is 259.3 KB today.
- Tap targets ≥ 44px; visible focus outlines; respect `prefers-reduced-motion`.
- No deployment in this plan.

---

## File Structure

| File | Responsibility |
|---|---|
| `parent/src/lib/classSession.js` (create) | Pure Class tab logic: session choice, grouping, summary, reasons, batched calls. |
| `parent/src/lib/classSession.test.js` (create) | Unit tests. |
| `parent/src/lib/portalMode.js` (create) | Per-device mode storage and role helpers. |
| `parent/src/lib/portalMode.test.js` (create) | Unit tests. |
| `parent/src/lib/nav.js` / `nav.test.js` (modify) | School tabs: Class (advisers only), School notices, Settings. |
| `parent/src/lib/school.js` / `school.test.js` (modify) | Drop `roleRequestError`; route `school_access` inbox items to Settings. |
| `parent/src/hooks/useSchoolContext.js` (modify) | Keep showing the last context while refreshing on focus. |
| `parent/src/strings.js` (modify) | Mode and Class strings. |
| `parent/src/components/Icon.jsx` (modify) | `class` glyph. |
| `parent/src/components/Shell.jsx` (modify) | Remove the header switch; pass `hasClass` to the nav. |
| `parent/src/App.jsx` (modify) | Own the mode state; send School-mode users to their School home. |
| `parent/src/screens/Settings.jsx` (modify) | "Use the app as" row (staff only) and its page. |
| `parent/src/screens/settings/SchoolModePage.jsx` (create) | Family / School choice. |
| `parent/src/screens/School.jsx` (rewrite) | Loads school context, reconciles mode, hosts the Class tab. |
| `parent/src/screens/School.css` (modify) | Remove the switch and request/review styles. |
| `parent/src/screens/school/ClassTab.jsx` (create) | Flag list. |
| `parent/src/screens/school/FlagSheet.jsx` (create) | Reason bottom sheet. |
| `parent/src/screens/school/UndoToast.jsx` (create) | Undo toast. |
| `parent/src/screens/school/ClassTab.css` (create) | Class tab, sheet, toast styles. |
| `parent/tests/class-preview.*` (create) | Local preview harness with fake data for visual checks. |

---

### Task 1: Class session logic

**Files:**
- Create: `parent/src/lib/classSession.js`
- Test: `parent/src/lib/classSession.test.js`

**Interfaces:**
- Consumes: roster rows from `getSchoolRosterFn`: `{ studentId, displayName, revision, gate: { timeIn, timeOut, pmTimeIn, pmTimeOut }, am: { status, absent, overrideActive, reason, actorName, changedAt }, pm: {...} }`, and `schedule: { timeIn, timeOut, pmTimeIn, pmTimeOut } | null`.
- Produces: `FLAG_REASONS`, `RESTORE_REASONS`, `UNDO_REASON`, `hasTwoSessions(schedule)`, `sessionNow(schedule, hhmm) → 'am'|'pm'`, `enteredFor(row, session) → 'HH:MM'|null`, `groupRoster(rows, session) → { inSchool, flagged, noEntry }`, `rosterSummary(groups) → string`, `reasonText(reason, note) → string`, `correctionInput({ sectionId, date, session, row, absent, reason, operationId })`, `runLimited(items, limit, fn) → Promise<Array<{ ok: true, value } | { ok: false, error }>>`.

- [ ] **Step 1: Write the failing test**

Create `parent/src/lib/classSession.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { FLAG_REASONS, RESTORE_REASONS, UNDO_REASON, hasTwoSessions, sessionNow, enteredFor, groupRoster, rosterSummary, reasonText, correctionInput, runLimited } from './classSession.js';

const split = { timeIn: '07:30', timeOut: '12:00', pmTimeIn: '13:00', pmTimeOut: '16:30' };
const row = (studentId, gate = {}, am = { status: 'P' }, pm = { status: 'P' }) => ({ studentId, displayName: studentId, revision: 0, gate, am, pm });

describe('class session', () => {
  it('uses the agreed neutral reasons', () => {
    expect(FLAG_REASONS).toEqual(['Not in class', 'Left during class']);
    expect(RESTORE_REASONS).toEqual(['Was in class', 'Flagged by mistake']);
    expect(UNDO_REASON).toBe('Undone right after flagging');
  });
  it('picks AM or PM from the middle of the lunch break', () => {
    expect(hasTwoSessions(split)).toBe(true);
    expect(hasTwoSessions({ timeIn: '07:30', timeOut: '16:00' })).toBe(false);
    expect(hasTwoSessions(null)).toBe(false);
    expect(sessionNow(split, '12:29')).toBe('am');
    expect(sessionNow(split, '12:30')).toBe('pm');
    expect(sessionNow(null, '15:00')).toBe('am');
  });
  it('counts a morning arrival without a lunch tap-out as in school for PM', () => {
    expect(enteredFor(row('a', { timeIn: '07:10' }), 'pm')).toBe('07:10');
    expect(enteredFor(row('a', { timeIn: '07:10', timeOut: '12:01' }), 'pm')).toBeNull();
    expect(enteredFor(row('a', { timeIn: '07:10', timeOut: '12:01', pmTimeIn: '12:50' }), 'pm')).toBe('12:50');
    expect(enteredFor(row('a', { pmTimeIn: '12:50' }), 'am')).toBeNull();
  });
  it('groups flagged first by flag, then gate entry, then everyone else', () => {
    const rows = [
      row('in', { timeIn: '07:10' }),
      row('flag', { timeIn: '07:12' }, { status: 'A', overrideActive: true }),
      row('none'),
      row('baseAbsent', { timeIn: '07:20' }, { status: 'A' }),
    ];
    const groups = groupRoster(rows, 'am');
    expect(groups.inSchool.map(r => r.studentId)).toEqual(['in']);
    expect(groups.flagged.map(r => r.studentId)).toEqual(['flag']);
    expect(groups.noEntry.map(r => r.studentId)).toEqual(['none', 'baseAbsent']);
    expect(rosterSummary(groups)).toBe('2 entered · 1 flagged');
  });
  it('joins an optional note and keeps the reason within 500 characters', () => {
    expect(reasonText('Not in class', '')).toBe('Not in class');
    expect(reasonText(' Not in class ', ' Went to clinic ')).toBe('Not in class: Went to clinic');
    expect(reasonText('x'.repeat(600), '').length).toBe(500);
  });
  it('builds a correction from the row revision', () => {
    expect(correctionInput({ sectionId: 'S', date: '2026-10-19', session: 'pm', row: { studentId: 'a', revision: 3 }, absent: true, reason: 'Not in class', operationId: 'op' }))
      .toEqual({ sectionId: 'S', studentId: 'a', date: '2026-10-19', session: 'pm', absent: true, reason: 'Not in class', expectedRevision: 3, operationId: 'op' });
  });
  it('runs a few calls at a time and keeps each outcome', async () => {
    let active = 0; let peak = 0;
    const results = await runLimited([1, 2, 3, 4, 5], 2, async n => {
      active++; peak = Math.max(peak, active);
      await new Promise(r => setTimeout(r, 5));
      active--;
      if (n === 4) throw new Error('nope');
      return n * 10;
    });
    expect(peak).toBe(2);
    expect(results.map(r => r.ok)).toEqual([true, true, true, false, true]);
    expect(results[0].value).toBe(10);
    expect(results[3].error.message).toBe('nope');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix parent test -- src/lib/classSession.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

Create `parent/src/lib/classSession.js`:

```js
import { hasPmSession, sessionSplit } from '../../../shared/scheduleSessions.js';

// The adviser's Class tab: learners who came through the gate are the only
// ones who can be in school but not in class, so they come first.
export const FLAG_REASONS = ['Not in class', 'Left during class'];
export const RESTORE_REASONS = ['Was in class', 'Flagged by mistake'];
export const UNDO_REASON = 'Undone right after flagging';

export const hasTwoSessions = (schedule) => hasPmSession(schedule);

export function sessionNow(schedule, hhmm) {
  const split = sessionSplit(schedule);
  return split && hhmm >= split ? 'pm' : 'am';
}

// A morning arrival with no lunch tap-out is still on campus in the afternoon.
export function enteredFor(row, session) {
  const gate = row?.gate || {};
  if (session === 'am') return gate.timeIn || null;
  return gate.pmTimeIn || (gate.timeIn && !gate.timeOut ? gate.timeIn : null);
}

export function groupRoster(rows, session) {
  const groups = { inSchool: [], flagged: [], noEntry: [] };
  for (const row of rows) {
    const status = row[session] || {};
    if (status.overrideActive) groups.flagged.push(row);
    else if (enteredFor(row, session) && status.status !== 'A') groups.inSchool.push(row);
    else groups.noEntry.push(row);
  }
  return groups;
}

export const rosterSummary = (groups) => `${groups.inSchool.length + groups.flagged.length} entered · ${groups.flagged.length} flagged`;

export function reasonText(reason, note) {
  const base = String(reason || '').trim();
  const extra = String(note || '').trim();
  return (extra ? `${base}: ${extra}` : base).slice(0, 500);
}

export const correctionInput = ({ sectionId, date, session, row, absent, reason, operationId }) =>
  ({ sectionId, studentId: row.studentId, date, session, absent, reason, expectedRevision: row.revision, operationId });

// Batch flags stay gentle on the attendance document: a few writes at a time.
export async function runLimited(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      try { results[index] = { ok: true, value: await fn(items[index]) }; }
      catch (error) { results[index] = { ok: false, error }; }
    }
  }));
  return results;
}
```

- [ ] **Step 4: Run test**

Run: `npm --prefix parent test -- src/lib/classSession.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add parent/src/lib/classSession.js parent/src/lib/classSession.test.js
git commit -m "Add Class tab session logic for advisers"
```

---

### Task 2: Device mode, navigation and school helpers

**Files:**
- Create: `parent/src/lib/portalMode.js`, `parent/src/lib/portalMode.test.js`
- Modify: `parent/src/lib/nav.js`, `parent/src/lib/nav.test.js`, `parent/src/lib/school.js`, `parent/src/lib/school.test.js`

**Interfaces:**
- Produces: `readMode() → { view: 'family'|'school', hasClass: boolean }`, `writeMode(mode)`, `canUseSchool(context)`, `hasClass(context)`, `advisorySections(context)`, `schoolHome(mode) → '/school' | '/announcements?view=school'`. `navTabs(view, hasClass = true)` returns `class`/`notices`/`settings` in School mode. `activeTab('school') === 'class'`. `inboxDestination({ type: 'school_access' }) === '/settings'`.

- [ ] **Step 1: Write the failing tests**

Create `parent/src/lib/portalMode.test.js`:

```js
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readMode, writeMode, canUseSchool, hasClass, advisorySections, schoolHome } from './portalMode.js';

const store = new Map();
beforeEach(() => {
  store.clear();
  globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
});
afterEach(() => { delete globalThis.localStorage; });

const context = { sections: [{ id: 'A' }, { id: 'B' }], assignments: [{ role: 'adviser', sectionId: 'B' }, { role: 'subject_teacher', sectionId: 'A' }] };

describe('portal mode', () => {
  it('defaults to Family and remembers School per device', () => {
    expect(readMode()).toEqual({ view: 'family', hasClass: false });
    writeMode({ view: 'school', hasClass: true });
    expect(readMode()).toEqual({ view: 'school', hasClass: true });
    writeMode({ view: 'family', hasClass: true });
    expect(readMode()).toEqual({ view: 'family', hasClass: false });
  });
  it('falls back to Family when storage is unavailable or corrupt', () => {
    store.set('bnhs-portal-mode', '{bad');
    expect(readMode()).toEqual({ view: 'family', hasClass: false });
    delete globalThis.localStorage;
    expect(readMode()).toEqual({ view: 'family', hasClass: false });
    expect(() => writeMode({ view: 'school', hasClass: false })).not.toThrow();
  });
  it('offers School only to approved staff and the Class tab only to advisers', () => {
    expect(canUseSchool({ assignments: [] })).toBe(false);
    expect(canUseSchool({ isAdmin: true, assignments: [] })).toBe(false);
    expect(canUseSchool(context)).toBe(true);
    expect(hasClass(context)).toBe(true);
    expect(hasClass({ assignments: [{ role: 'subject_teacher', sectionId: 'A' }] })).toBe(false);
    expect(advisorySections(context)).toEqual([{ id: 'B' }]);
    expect(schoolHome({ view: 'school', hasClass: true })).toBe('/school');
    expect(schoolHome({ view: 'school', hasClass: false })).toBe('/announcements?view=school');
  });
});
```

In `parent/src/lib/nav.test.js`, replace the test `'uses School navigation with its own notices and no family inbox'` with:

```js
  it('uses School navigation with Class for advisers and no family inbox', () => {
    expect(navTabs('school')).toEqual([
      { key: 'class', path: '/school' },
      { key: 'notices', path: '/announcements?view=school' },
      { key: 'settings', path: '/settings?view=school' },
    ]);
    expect(navTabs('school', false)).toEqual([
      { key: 'notices', path: '/announcements?view=school' },
      { key: 'settings', path: '/settings?view=school' },
    ]);
    expect(activeTab('school')).toBe('class');
    expect(showsAppTitle('school')).toBe(false);
  });
```

In `parent/src/lib/school.test.js`: remove `roleRequestError` from the import and delete its three `expect(roleRequestError(...))` lines (and the `it` block if it becomes empty). Then add:

```js
  it('sends a school access note to Settings', () => {
    expect(inboxDestination({ type: 'school_access' })).toBe('/settings');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npm --prefix parent test -- src/lib/portalMode.test.js src/lib/nav.test.js src/lib/school.test.js`
Expected: FAIL (missing module, old tab key, `null` destination).

- [ ] **Step 3: Implement**

Create `parent/src/lib/portalMode.js`:

```js
// Family or School, chosen in Settings and remembered on this device only.
// School appears only for accounts an administrator assigned in SIMS.
const KEY = 'bnhs-portal-mode';
const FAMILY = { view: 'family', hasClass: false };

export function readMode() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    return saved?.view === 'school' ? { view: 'school', hasClass: saved.hasClass === true } : FAMILY;
  } catch { return FAMILY; }
}

export function writeMode(mode) {
  try {
    if (mode?.view === 'school') localStorage.setItem(KEY, JSON.stringify({ view: 'school', hasClass: mode.hasClass === true }));
    else localStorage.removeItem(KEY);
  } catch { /* private mode: the choice lasts for this visit */ }
}

const assignments = (context) => context?.assignments || [];
export const canUseSchool = (context) => assignments(context).length > 0;
export const hasClass = (context) => assignments(context).some((a) => a.role === 'adviser');
export const advisorySections = (context) => (context?.sections || [])
  .filter((section) => assignments(context).some((a) => a.role === 'adviser' && a.sectionId === section.id));
export const schoolHome = (mode) => (mode.hasClass ? '/school' : '/announcements?view=school');
```

In `parent/src/lib/nav.js`, replace `navTabs` and the `school:` entry of `ROUTE_TAB`:

```js
export const navTabs = (view, hasClass = true) => view === 'school' ? [
  ...(hasClass ? [{ key: 'class', path: '/school' }] : []),
  { key: 'notices', path: '/announcements?view=school' },
  { key: 'settings', path: '/settings?view=school' },
] : NAV_TABS;
```

```js
  home: 'home', school: 'class', learner: 'home', report: 'home', // a report is opened from a learner's history
```

In `parent/src/lib/school.js`: delete the `roleRequestError` function. In `inboxDestination`, add as the first line of the function body:

```js
  if (item.type === 'school_access') return '/settings';
```

- [ ] **Step 4: Run tests**

Run: `npm --prefix parent test`
Expected: PASS (all Parent unit tests).

- [ ] **Step 5: Commit**

```bash
git add parent/src/lib/portalMode.js parent/src/lib/portalMode.test.js parent/src/lib/nav.js parent/src/lib/nav.test.js parent/src/lib/school.js parent/src/lib/school.test.js
git commit -m "Remember Family or School per device and give advisers a Class tab"
```

---

### Task 3: Move the switch out of the header and into Settings

**Files:**
- Modify: `parent/src/strings.js`, `parent/src/components/Icon.jsx`, `parent/src/components/Shell.jsx`, `parent/src/App.jsx`, `parent/src/screens/Settings.jsx`, `parent/src/hooks/useSchoolContext.js`
- Create: `parent/src/screens/settings/SchoolModePage.jsx`

**Interfaces:**
- Consumes: Task 2 helpers.
- Produces: every screen receives `mode` and `setMode(mode)` props from `App.jsx`. `Shell` accepts `hasClass`. The Settings route `/settings/mode` renders `SchoolModePage`.

- [ ] **Step 1: Add strings and the icon**

In `parent/src/strings.js`, add next to `navSettings`:

```js
  navClass: 'Class',
  modeTitle: 'Use the app as',
  modeFamily: 'Family',
  modeSchool: 'School',
  modeFamilyHint: 'Your linked learners, their gate activity and notices.',
  modeSchoolHint: 'Your class and school notices.',
  modeInUse: 'In use',
  modeSavedHere: 'Saved on this device.',
```

In `parent/src/components/Icon.jsx`, change the `people` line's condition from `name === 'people'` to `(name === 'people' || name === 'class')`.

- [ ] **Step 2: Keep context visible while refreshing**

In `parent/src/hooks/useSchoolContext.js`, replace `setState({ data: null, loading: true, error: '' });` with:

```js
    setState((current) => ({ data: current.data, loading: true, error: '' }));
```

Without this, the Class tab unmounts (losing an open sheet) every time the window regains focus.

- [ ] **Step 3: Remove the header switch from Shell**

In `parent/src/components/Shell.jsx`:
1. Delete the line `import '../screens/School.css';`.
2. Change `const LABEL = ...` to `const LABEL = { home: S.navHome, class: S.navClass, notices: S.navNotices, inbox: S.navInbox, settings: S.navSettings };`.
3. Change the signature `function GlassNav({ route, navigate, unread, view })` to `function GlassNav({ route, navigate, unread, view, hasClass })`, change `navTabs(view)` to `navTabs(view, hasClass)`, and add `hasClass` to the `useLayoutEffect` dependency array (`[active, view, hasClass]`).
4. Replace the label expression `{key === 'home' && view === 'school' ? 'School' : LABEL[key]}` with `{LABEL[key]}`.
5. Change `export default function Shell({ route, navigate, profile, view = 'family', gate = false, children })` to also take `hasClass = false`, and pass it: `<GlassNav route={route} navigate={navigate} unread={unread} view={view} hasClass={hasClass} />`.
6. Delete the whole `{!gate && profile && <div className="portal-view-switch" ...>...</div>}` element.

- [ ] **Step 4: Own the mode in App**

In `parent/src/App.jsx`:
1. Add the import: `import { readMode, writeMode, schoolHome } from './lib/portalMode.js';`
2. Inside `App()`, after `const { user, profile } = useAuth();`, add:

```js
  const [mode, setModeState] = useState(readMode);
  const setMode = useCallback((next) => { writeMode(next); setModeState(next); }, []);
  // School mode opens on the teacher's School home instead of the family list.
  useEffect(() => {
    if (profile && mode.view === 'school' && route.name === 'home') navigate(schoolHome(mode), { replace: true });
  }, [profile, mode, route.name, navigate]);
```

3. Change `const props = { user, profile, route, navigate: scopedNavigate, view };` to:

```js
  const props = { user, profile, route, navigate: scopedNavigate, view, mode, setMode };
```

4. In the final `return`, add `hasClass={mode.hasClass}` to `<Shell ...>`.

- [ ] **Step 5: Add the Settings page**

Create `parent/src/screens/settings/SchoolModePage.jsx`:

```jsx
import S from '../../strings.js';
import PageHeader from '../../components/PageHeader.jsx';
import { SettingsGroup, SettingsRow } from '../../components/SettingsList.jsx';

// Family is the default; School appears in Settings only for assigned staff.
export default function SchoolModePage({ ctx, back }) {
  const { mode, chooseMode } = ctx;
  return (
    <>
      <PageHeader title={S.modeTitle} onBack={back} />
      <SettingsGroup footer={S.modeSavedHere}>
        <SettingsRow tile="green" icon="people" label={S.modeFamily} subtitle={S.modeFamilyHint}
          value={mode.view === 'family' ? S.modeInUse : undefined} chevron={false} onClick={() => chooseMode('family')} />
        <SettingsRow tile="teal" icon="class" label={S.modeSchool} subtitle={S.modeSchoolHint}
          value={mode.view === 'school' ? S.modeInUse : undefined} chevron={false} onClick={() => chooseMode('school')} />
      </SettingsGroup>
    </>
  );
}
```

`IconTile` passes `icon` to `Icon`, so `class` works after step 1.

- [ ] **Step 6: Wire it into Settings**

In `parent/src/screens/Settings.jsx`:
1. Add the imports:

```js
import { useSchoolContext } from '../hooks/useSchoolContext.js';
import { canUseSchool, hasClass, schoolHome } from '../lib/portalMode.js';
import SchoolModePage from './settings/SchoolModePage.jsx';
```

2. Add `mode: SchoolModePage,` to `PAGES`.
3. Change the component signature to `export default function Settings({ user, profile, route, navigate, mode, setMode })`. Before `const ctx = {`, add:

```js
  const school = useSchoolContext(user.uid);
  const allowed = canUseSchool(school.data);
  useEffect(() => { if (school.data && !allowed && mode.view === 'school') setMode({ view: 'family', hasClass: false }); }, [school.data, allowed, mode.view, setMode]);
  const chooseMode = (view) => {
    const next = view === 'school' ? { view: 'school', hasClass: hasClass(school.data) } : { view: 'family', hasClass: false };
    setMode(next);
    navigate(view === 'school' ? schoolHome(next) : '/');
  };
```

4. Add `mode, chooseMode, schoolAllowed: allowed,` to the `ctx` object.
5. Because `/settings/mode` must not render for families, change the line `const Page = section ? PAGES[section] : null;` to:

```js
  const Page = section && (section !== 'mode' || allowed) ? PAGES[section] : null;
```

The existing effect redirects an unknown or disallowed section to `/settings`. Wait for the context to load before that runs, so a staff member's deep link isn't bounced while loading: change that effect's condition to `if (section && !Page && !(section === 'mode' && school.loading))`.

6. In `SettingsHome`, destructure `mode` and `schoolAllowed` from `ctx`. Directly after the profile `SettingsGroup`, add:

```jsx
      {schoolAllowed && (
        <SettingsGroup>
          <SettingsRow tile="teal" icon="class" label={S.modeTitle} value={mode.view === 'school' ? S.modeSchool : S.modeFamily} onClick={() => navigate('/settings/mode')} />
        </SettingsGroup>
      )}
```

- [ ] **Step 7: Run tests and a build**

Run: `npm --prefix parent test` → PASS. The production build runs in Task 6, which links the real `parent/node_modules` first.

- [ ] **Step 8: Commit**

```bash
git add parent/src/strings.js parent/src/components/Icon.jsx parent/src/components/Shell.jsx parent/src/App.jsx parent/src/screens/Settings.jsx parent/src/screens/settings/SchoolModePage.jsx parent/src/hooks/useSchoolContext.js
git commit -m "Move the Family/School choice into Settings for assigned staff only"
```

---

### Task 4: Class tab, flag sheet and undo

**Files:**
- Rewrite: `parent/src/screens/School.jsx`
- Create: `parent/src/screens/school/ClassTab.jsx`, `parent/src/screens/school/FlagSheet.jsx`, `parent/src/screens/school/UndoToast.jsx`, `parent/src/screens/school/ClassTab.css`
- Modify: `parent/src/screens/School.css`

**Interfaces:**
- Consumes: `getSchoolRosterFn({ sectionId, date })` and `setSessionAbsenceFn(correctionInput)` → `{ data: { ok, revision, operationId } }`. Task 1 and Task 2 helpers. `mode`/`setMode` props.
- Produces: `ClassTab({ sections, ended })`, `FlagSheet({ rows, session, mode: 'flag'|'restore', busy, error, onConfirm(reason), onClose })`, `UndoToast({ message, onUndo, onDone })`.

- [ ] **Step 1: Rewrite School.jsx**

Replace the whole of `parent/src/screens/School.jsx` with:

```jsx
// School mode's Class tab. Teachers get here only after an administrator
// assigns them in SIMS and they choose School in Settings.
import { useEffect } from 'react';
import { useSchoolContext } from '../hooks/useSchoolContext.js';
import { canUseSchool, hasClass, advisorySections } from '../lib/portalMode.js';
import { sectionLabel } from '../lib/school.js';
import { Banner, Btn, Spinner } from '../components/ui.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ClassTab from './school/ClassTab.jsx';

export default function School({ user, navigate, mode, setMode }) {
  const resource = useSchoolContext(user.uid);
  const context = resource.data;
  useEffect(() => {
    if (!context) return;
    if (!canUseSchool(context)) { setMode({ view: 'family', hasClass: false }); navigate('/', { replace: true }); return; }
    const next = { view: 'school', hasClass: hasClass(context) };
    if (mode.view !== 'school' || mode.hasClass !== next.hasClass) setMode(next);
    if (!next.hasClass) navigate('/announcements?view=school', { replace: true });
  }, [context, mode, setMode, navigate]);
  const sections = advisorySections(context);
  return (
    <>
      <PageHeader title="Class" subtitle={sections.length === 1 ? sectionLabel(sections[0]) : context ? `School year ${context.schoolYear}` : undefined} />
      {resource.loading && !context && <Spinner label="Loading your class" />}
      {resource.error && <Banner tone="danger" action={<Btn variant="ghost" onClick={resource.refresh}>Try again</Btn>}>{resource.error}</Banner>}
      {context && sections.length > 0 && <ClassTab key={context.schoolYear} sections={sections} ended={context.ended} />}
    </>
  );
}
```

- [ ] **Step 2: Create the undo toast**

Create `parent/src/screens/school/UndoToast.jsx`:

```jsx
import { useEffect, useRef } from 'react';

// Ten seconds to undo a flag; plain confirmations leave sooner.
export default function UndoToast({ message, onUndo, onDone }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const id = setTimeout(() => done.current(), onUndo ? 10000 : 4000);
    return () => clearTimeout(id);
  }, [message, onUndo]);
  return (
    <div className="undo-toast" role="status" aria-live="polite">
      <span>{message}</span>
      {onUndo && <button type="button" onClick={onUndo}>Undo</button>}
    </div>
  );
}
```

- [ ] **Step 3: Create the flag sheet**

Create `parent/src/screens/school/FlagSheet.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Btn, Banner, Inp } from '../../components/ui.jsx';
import { FLAG_REASONS, RESTORE_REASONS, reasonText } from '../../lib/classSession.js';

// Two taps to flag: the learner, then a reason. Portalled to <body> so no
// glass card's backdrop-filter traps the fixed overlay (see ScanSheet).
export default function FlagSheet({ rows, session, mode, busy, error, onConfirm, onClose }) {
  const [note, setNote] = useState('');
  const [other, setOther] = useState(false);
  const [otherText, setOtherText] = useState('');
  const dialog = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    dialog.current?.querySelector('.flag-reason')?.focus();
    return () => { if (opener instanceof HTMLElement) opener.focus(); };
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const flagging = mode === 'flag';
  const who = rows.length === 1 ? rows[0].displayName : `${rows.length} learners`;
  return createPortal(
    <div className="flag-sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialog} className="flag-sheet" role="dialog" aria-modal="true" aria-labelledby="flag-sheet-title">
        <span className="flag-sheet-grip" aria-hidden="true" />
        <h2 id="flag-sheet-title">{who} · {session.toUpperCase()}</h2>
        <p className="flag-sheet-hint">{flagging
          ? 'Choose why. Families get a neutral update after two minutes unless you undo.'
          : 'Return to the gate-based attendance. Families get a neutral update.'}</p>
        {error && <Banner tone="danger">{error}</Banner>}
        <div className="flag-sheet-reasons">
          {(flagging ? FLAG_REASONS : RESTORE_REASONS).map((reason) => (
            <button key={reason} type="button" className="flag-reason" disabled={busy} onClick={() => onConfirm(reasonText(reason, note))}>{reason}</button>
          ))}
          <button type="button" className="flag-reason flag-reason--quiet" disabled={busy} aria-expanded={other} onClick={() => setOther((v) => !v)}>Other reason…</button>
        </div>
        {other && (
          <form className="flag-sheet-other" onSubmit={(e) => { e.preventDefault(); if (otherText.trim()) onConfirm(reasonText(otherText, note)); }}>
            <Inp autoFocus aria-label="Other reason" placeholder="Reason" maxLength={200} value={otherText} disabled={busy} onChange={(e) => setOtherText(e.target.value)} />
            <Btn type="submit" disabled={busy || !otherText.trim()}>{flagging ? 'Flag' : 'Restore'}</Btn>
          </form>
        )}
        <Inp aria-label="Note (optional)" placeholder="Note (optional)" maxLength={250} value={note} disabled={busy} onChange={(e) => setNote(e.target.value)} />
        <Btn variant="ghost" onClick={onClose} disabled={busy} style={{ width: '100%', marginTop: 10 }}>Cancel</Btn>
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 4: Create the Class tab**

Create `parent/src/screens/school/ClassTab.jsx`:

```jsx
// The adviser's one job in the app: spot learners who came through the gate
// but aren't in class, and flag them in two taps. Earlier days belong to
// coordinators in SIMS, so past days are view-only here.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { callable } from '../../firebase.js';
import { manilaDate, manilaTime, formatScanTime, formatDateLabel } from '../../../../shared/dates.js';
import { schoolError, sectionLabel } from '../../lib/school.js';
import { groupRoster, enteredFor, sessionNow, hasTwoSessions, rosterSummary, runLimited, correctionInput, UNDO_REASON } from '../../lib/classSession.js';
import { initials } from '../../lib/format.js';
import { Banner, Btn, Inp, Sel, Spinner, EmptyState } from '../../components/ui.jsx';
import Icon from '../../components/Icon.jsx';
import UndoToast from './UndoToast.jsx';
import './ClassTab.css';

const FlagSheet = lazy(() => import('./FlagSheet.jsx'));
const STATUS = { P: 'Present', L: 'Late', E: 'Excused', A: 'Absent' };
const DAY = 86400000;

export default function ClassTab({ sections, ended }) {
  const today = manilaDate();
  const [sectionId, setSectionId] = useState(sections[0]?.id || '');
  const [date, setDate] = useState(today);
  const [pickedSession, setPickedSession] = useState(null);
  const [roster, setRoster] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [sheet, setSheet] = useState(null); // { rows, mode: 'flag' | 'restore' }
  const [saving, setSaving] = useState(false);
  const [sheetError, setSheetError] = useState('');
  const [toast, setToast] = useState(null); // { message, undo }
  const [reload, setReload] = useState(0);
  const sequence = useRef(0);
  const validSection = sections.some((s) => s.id === sectionId) ? sectionId : sections[0]?.id || '';

  useEffect(() => {
    if (!validSection) return undefined;
    const request = ++sequence.current;
    setLoading(true); setError('');
    setRoster((current) => (current && current.date === date && current.section?.id === validSection ? current : null));
    callable('getSchoolRosterFn')({ sectionId: validSection, date }).then((result) => {
      if (request === sequence.current) { setRoster(result.data); setLoading(false); }
    }).catch((e) => { if (request === sequence.current) { setError(schoolError(e)); setLoading(false); } });
    return () => { ++sequence.current; };
  }, [validSection, date, reload]);

  const isToday = date === today;
  const schedule = roster?.schedule || null;
  const twoSessions = hasTwoSessions(schedule);
  const session = twoSessions ? (pickedSession || (isToday ? sessionNow(schedule, manilaTime()) : 'am')) : 'am';
  const groups = useMemo(() => groupRoster(roster?.rows || [], session), [roster, session]);
  const canCorrect = Boolean(roster?.canCorrect) && !ended;
  const refresh = () => setReload((n) => n + 1);

  const save = useCallback(async (rows, absent, reason) => {
    const results = await runLimited(rows, 3, (row) => callable('setSessionAbsenceFn')(
      correctionInput({ sectionId: validSection, date, session, row, absent, reason, operationId: crypto.randomUUID() }),
    ).then((result) => ({ row, revision: result.data.revision })));
    return { done: results.filter((r) => r.ok).map((r) => r.value), failures: results.filter((r) => !r.ok).map((r) => r.error) };
  }, [validSection, date, session]);

  const undo = useCallback(async (done) => {
    setToast(null);
    const { failures } = await save(done.map(({ row, revision }) => ({ ...row, revision })), false, UNDO_REASON);
    setToast({ message: failures.length ? schoolError(failures[0]) : 'Flag undone. Families were not notified.', undo: null });
    refresh();
  }, [save]);

  const confirm = async (reason) => {
    if (!sheet || saving) return;
    setSaving(true); setSheetError('');
    const absent = sheet.mode === 'flag';
    const { done, failures } = await save(sheet.rows, absent, reason);
    setSaving(false);
    // Nothing saved (often a stale revision): close, explain, and reload fresh rows.
    if (!done.length) { setSheet(null); setToast({ message: schoolError(failures[0]), undo: null }); refresh(); return; }
    setSheet(null); setSelecting(false); setSelected(new Set());
    const count = done.length === 1 ? (absent ? 'Flagged' : 'Restored') : `${done.length} ${absent ? 'flagged' : 'restored'}`;
    setToast({ message: failures.length ? `${count} · ${failures.length} not saved. Refresh and try again.` : count, undo: absent ? () => undo(done) : null });
    refresh();
  };

  const pick = (row, mode) => {
    if (selecting && mode === 'flag') {
      setSelected((current) => { const next = new Set(current); if (next.has(row.studentId)) next.delete(row.studentId); else next.add(row.studentId); return next; });
      return;
    }
    setSheetError(''); setSheet({ rows: [row], mode });
  };

  if (!validSection) return <EmptyState title="No advisory class yet" hint="An administrator assigns your class in SIMS." />;
  return (
    <div className="class-tab">
      {sections.length > 1 && (
        <Sel aria-label="Class" value={validSection} onChange={(e) => { setSectionId(e.target.value); setPickedSession(null); }} style={{ marginBottom: 12 }}>
          {sections.map((s) => <option key={s.id} value={s.id}>{sectionLabel(s)}</option>)}
        </Sel>
      )}
      <section className="class-summary glass-card" aria-labelledby="class-session">
        <div className="class-summary-top">
          <h2 id="class-session">{session.toUpperCase()} · {isToday ? 'Today' : formatDateLabel(date)}</h2>
          {twoSessions && (
            <div className="class-session-switch" role="group" aria-label="Session">
              {['am', 'pm'].map((key) => <button key={key} type="button" aria-pressed={session === key} onClick={() => setPickedSession(key)}>{key.toUpperCase()}</button>)}
            </div>
          )}
        </div>
        {roster && <p className="class-summary-line">{rosterSummary(groups)}</p>}
        <div className="class-summary-actions">
          {canCorrect && groups.inSchool.length > 0 && (
            <button type="button" className="class-link" aria-pressed={selecting} onClick={() => { setSelecting((v) => !v); setSelected(new Set()); }}>{selecting ? 'Cancel selection' : 'Select'}</button>
          )}
          <button type="button" className="class-link" onClick={() => { setDate(isToday ? manilaDate(new Date(Date.now() - DAY)) : today); setPickedSession(null); setSelecting(false); }}>
            {isToday ? 'Past days' : 'Back to today'}
          </button>
          {!isToday && <Inp type="date" aria-label="School day" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ width: 'auto', minHeight: 44 }} />}
        </div>
      </section>
      {error && <Banner tone="danger" action={<Btn variant="ghost" onClick={refresh}>Try again</Btn>}>{error}</Banner>}
      {loading && !roster && <Spinner label="Loading your class" />}
      {roster && !isToday && <p className="class-note">Past days are view-only. Your coordinator corrects earlier days in SIMS.</p>}
      {roster && ended && <p className="class-note">This school year has ended. Attendance is view-only.</p>}
      {roster && (
        <>
          <RowGroup title="In school" hint={groups.inSchool.length ? (canCorrect ? 'Tap a learner who isn’t in class.' : null) : 'No gate entries yet for this session.'}
            rows={groups.inSchool} session={session} selecting={selecting} selected={selected} onPick={canCorrect ? (row) => pick(row, 'flag') : null} />
          <RowGroup title="Flagged" rows={groups.flagged} session={session} onPick={canCorrect ? (row) => pick(row, 'restore') : null} collapsible />
          <RowGroup title="Absent or no gate entry" rows={groups.noEntry} session={session} collapsible />
        </>
      )}
      {selecting && (
        <div className="class-select-bar" role="region" aria-label="Selected learners">
          <span>{selected.size} selected</span>
          <Btn disabled={!selected.size} onClick={() => { setSheetError(''); setSheet({ rows: groups.inSchool.filter((r) => selected.has(r.studentId)), mode: 'flag' }); }}>Flag</Btn>
        </div>
      )}
      {sheet && (
        <Suspense fallback={null}>
          <FlagSheet rows={sheet.rows} session={session} mode={sheet.mode} busy={saving} error={sheetError} onConfirm={confirm} onClose={() => { if (!saving) setSheet(null); }} />
        </Suspense>
      )}
      {toast && <UndoToast message={toast.message} onUndo={toast.undo} onDone={() => setToast(null)} />}
    </div>
  );
}

function RowGroup({ title, hint, rows, session, selecting = false, selected, onPick, collapsible = false }) {
  if (collapsible && !rows.length) return null;
  const list = (
    <ul className="learner-list class-list" aria-label={title}>
      {rows.map((row) => <ClassRow key={row.studentId} row={row} session={session} selecting={selecting} checked={Boolean(selected?.has(row.studentId))} onPick={onPick ? () => onPick(row) : null} />)}
    </ul>
  );
  if (collapsible) {
    return <details className="class-group"><summary><span>{title}</span><span className="class-count">{rows.length}</span></summary>{list}</details>;
  }
  return (
    <section className="class-group" aria-label={title}>
      <h3 className="class-group-title"><span>{title}</span><span className="class-count">{rows.length}</span></h3>
      {hint && <p className="class-note">{hint}</p>}
      {rows.length > 0 && list}
    </section>
  );
}

function ClassRow({ row, session, selecting, checked, onPick }) {
  const status = row[session] || {};
  const entered = enteredFor(row, session);
  const preview = status.overrideActive
    ? ['Not in class', status.reason, status.actorName && `by ${status.actorName}`].filter(Boolean).join(' · ')
    : entered ? (STATUS[status.status] || 'Present') : (status.status && status.status !== 'P' ? STATUS[status.status] : 'No gate entry');
  const lead = selecting && onPick
    ? <span className={`class-check${checked ? ' class-check--on' : ''}`} aria-hidden="true">{checked && <Icon name="check" size={18} strokeWidth={2.6} />}</span>
    : <span className="learner-avatar" aria-hidden="true">{initials(row.displayName)}</span>;
  const body = (
    <>
      {lead}
      <span className="learner-row-body">
        <span className="learner-row-top">
          <span className="learner-row-name">{row.displayName}</span>
          {entered && !status.overrideActive && <span className="learner-row-time">{formatScanTime(entered)}</span>}
        </span>
        <span className={`learner-row-preview${status.overrideActive ? ' class-preview--flagged' : ''}`}>{preview}</span>
      </span>
    </>
  );
  if (!onPick) return <li className="learner-row">{body}</li>;
  return <li><button type="button" className="learner-row" aria-pressed={selecting ? checked : undefined} onClick={onPick}>{body}</button></li>;
}
```

- [ ] **Step 5: Create the styles**

Create `parent/src/screens/school/ClassTab.css`:

```css
/* Class tab: one glass summary, then plain Messages-style learner rows
   (shared .learner-row from glass.css), a bottom sheet and an undo toast. */
.class-tab { padding-bottom: 8px; }
.class-summary { border-radius: 20px; padding: 16px; margin: 4px 0 18px; }
.class-summary-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.class-summary h2 { margin: 0; font-size: 22px; font-weight: 750; letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }
.class-summary-line { margin: 6px 0 0; color: var(--t-muted); font-size: 15px; font-variant-numeric: tabular-nums; }
.class-summary-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 18px; margin-top: 10px; }
.class-session-switch { display: inline-flex; flex: 0 0 auto; padding: 3px; border-radius: 999px; background: var(--t-tint); }
.class-session-switch button { min-width: 52px; min-height: 38px; border: 0; border-radius: 999px; background: transparent; color: var(--t-ink); font: inherit; font-size: 14px; font-weight: 650; cursor: pointer; transition: background-color 0.15s ease-out, color 0.15s ease-out; }
.class-session-switch button[aria-pressed="true"] { background: var(--t-primary); color: var(--t-on-primary); }
.class-link { min-height: 44px; padding: 0; border: 0; background: none; color: var(--t-primary); font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; }
.class-link[aria-pressed="true"] { color: var(--t-ink); }
.class-note { margin: 0 0 12px; color: var(--t-muted); font-size: 13px; line-height: 1.5; }
.class-group { margin: 0 0 20px; }
.class-group-title, .class-group > summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 36px; margin: 0 0 4px; color: var(--t-muted); font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
.class-group > summary { min-height: 44px; cursor: pointer; list-style: none; }
.class-group > summary::-webkit-details-marker { display: none; }
.class-group > summary::after { content: ''; width: 8px; height: 8px; margin-left: 8px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(45deg) translateY(-2px); transition: transform 0.15s ease-out; }
.class-group[open] > summary::after { transform: rotate(-135deg) translateY(-2px); }
.class-group > summary > .class-count { margin-left: auto; }
.class-count { font-variant-numeric: tabular-nums; font-weight: 600; }
.class-preview--flagged { color: var(--t-warn-text); }
.class-check { display: inline-grid; flex: 0 0 auto; place-items: center; width: 40px; height: 40px; box-sizing: border-box; border: 2px solid var(--t-control-border); border-radius: 50%; color: var(--t-on-primary); }
.class-check--on { border-color: var(--t-primary); background: var(--t-primary); }
.class-select-bar, .undo-toast { position: fixed; left: 50%; bottom: calc(92px + env(safe-area-inset-bottom)); z-index: 12; display: flex; align-items: center; justify-content: space-between; gap: 12px; width: min(calc(100% - 32px), 528px); box-sizing: border-box; transform: translateX(-50%); }
.class-select-bar { padding: 8px 8px 8px 20px; border: 1px solid var(--t-glass-edge); border-radius: 999px; background: rgba(var(--t-glass-rgb), 0.94); font-weight: 650; font-variant-numeric: tabular-nums; -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); }
.undo-toast { z-index: 13; padding: 10px 10px 10px 18px; border-radius: 16px; background: var(--t-tooltip-bg); color: var(--t-tooltip-ink); font-size: 15px; animation: undo-in 0.18s ease-out; }
.undo-toast button { min-height: 44px; padding: 0 16px; border: 0; border-radius: 999px; background: transparent; color: var(--t-tooltip-ink); font: inherit; font-weight: 750; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
.flag-sheet-scrim { position: fixed; inset: 0; z-index: 50; display: grid; align-items: end; justify-items: center; background: rgba(var(--t-shadow-rgb), 0.45); }
.flag-sheet { width: min(100%, 480px); box-sizing: border-box; padding: 10px 16px calc(16px + env(safe-area-inset-bottom)); border-radius: 20px 20px 0 0; background: var(--t-dialog); color: var(--t-ink); animation: sheet-in 0.2s ease-out; }
.flag-sheet-grip { display: block; width: 36px; height: 4px; margin: 0 auto 12px; border-radius: 2px; background: var(--t-border); }
.flag-sheet h2 { margin: 0 0 4px; font-size: 18px; overflow-wrap: anywhere; }
.flag-sheet-hint { margin: 0 0 14px; color: var(--t-muted); font-size: 13px; line-height: 1.5; }
.flag-sheet-reasons { display: grid; gap: 8px; margin-bottom: 12px; }
.flag-reason { min-height: 52px; padding: 0 16px; border: 1px solid var(--t-border); border-radius: 14px; background: var(--t-surface); color: var(--t-ink); font: inherit; font-size: 16px; font-weight: 600; text-align: left; cursor: pointer; transition: background-color 0.15s ease-out; }
.flag-reason:active { background: var(--t-tint); }
@media (hover: hover) { .flag-reason:hover { background: var(--t-tint-hover); } }
.flag-reason--quiet { color: var(--t-muted); font-weight: 500; }
.flag-reason:disabled { opacity: 0.6; cursor: default; }
.flag-sheet-other { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; margin-bottom: 12px; }
.flag-reason:focus-visible, .class-link:focus-visible, .class-session-switch button:focus-visible, .undo-toast button:focus-visible, .class-group > summary:focus-visible { outline: 2px solid var(--t-focus); outline-offset: 2px; }
@keyframes undo-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
@keyframes sheet-in { from { opacity: 0.6; transform: translateY(24px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
  .undo-toast, .flag-sheet { animation: none; }
  .class-session-switch button, .flag-reason, .class-group > summary::after { transition: none; }
}
```

- [ ] **Step 6: Prune School.css**

In `parent/src/screens/School.css`, delete the rules for `.portal-view-switch` (three rules), `.school-fieldset`, `.school-filters` (including its `@media` rule), `.school-review-row`, `.school-learner`, `.school-sessions` (three rules) and `.school-correction` (two rules). Then run `grep -rn "school-" parent/src --include=*.jsx`. If no file still uses `School.css` classes, delete `School.css` and its import in `School.jsx` (the rewrite above already has no import).

- [ ] **Step 7: Guard the new stylesheet and run tests**

In `shared/theme/literals.test.js`, add the new file to the themed list:

```js
const THEMED_CSS = ['src/registrar.css', 'src/enrollment.css', 'parent/src/glass.css', 'parent/src/screens/school/ClassTab.css'];
```

Run: `npm --prefix parent test` and `npx vitest run shared/theme`
Expected: PASS. A hit in `ClassTab.css` means a literal color slipped in; replace it with a `var(--t-*)` token.

- [ ] **Step 8: Commit**

```bash
git add -A parent/src/screens shared/theme/literals.test.js
git commit -m "Give advisers a two-tap Class tab with batch flags and undo"
```

---

### Task 5: Local preview harness for visual checks

**Files:**
- Create: `parent/tests/class-preview.config.mjs`, `parent/tests/class-preview.html`, `parent/tests/class-preview.jsx`, `parent/tests/class-preview-firebase.js`

**Interfaces:**
- Consumes: `ClassTab` from Task 4. The fake `callable(name)` implements `getSchoolRosterFn` and `setSessionAbsenceFn` against in-memory data.

- [ ] **Step 1: Create the fake backend**

Create `parent/tests/class-preview-firebase.js`:

```js
// In-memory stand-in for parent/src/firebase.js in the Class tab preview.
const names = ['Abad, Lea M.', 'Bautista, Carlo R.', 'Cruz, Ana B.', 'Dela Peña, Marco S.', 'Españo, Joy T.', 'Flores, Ivan D.',
  'Garcia, Mia L.', 'Hernandez, Paolo C.', 'Ignacio, Rhea V.', 'Jimenez, Kurt A.', 'Lopez, Nina F.', 'Mendoza, Rafael G.'];
const times = ['07:02', '07:11', '07:18', '07:24', '07:29', '07:41', '07:46', '07:55', null, null, null, '07:33'];
const rows = names.map((displayName, i) => ({
  studentId: `S${i + 1}`, displayName, revision: 0,
  gate: { timeIn: times[i], timeOut: null, pmTimeIn: null, pmTimeOut: null },
  am: { status: times[i] ? (times[i] > '07:30' ? 'L' : 'P') : 'A', absent: !times[i], overrideActive: false, reason: '', actorName: '' },
  pm: { status: times[i] ? 'P' : 'A', absent: !times[i], overrideActive: false, reason: '', actorName: '' },
}));
rows[11].am = { ...rows[11].am, status: 'A', absent: true, overrideActive: true, reason: 'Not in class', actorName: 'Ms. Reyes' };
rows[11].revision = 1;
const schedule = { timeIn: '07:30', timeOut: '12:00', pmTimeIn: '13:00', pmTimeOut: '16:30' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export const db = {};
export const auth = {};
export function callable(name) {
  return async (input) => {
    await wait(250);
    if (name === 'getSchoolRosterFn') {
      return { data: { section: { id: input.sectionId }, date: input.date, rows: structuredClone(rows), canCorrect: input.date === new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }), schedule } };
    }
    if (name === 'setSessionAbsenceFn') {
      const row = rows.find((r) => r.studentId === input.studentId);
      if (row.revision !== input.expectedRevision) throw Object.assign(new Error('Attendance changed. Refresh and review before submitting again.'), { code: 'functions/aborted' });
      row.revision += 1;
      row[input.session] = { ...row[input.session], overrideActive: input.absent, absent: input.absent, status: input.absent ? 'A' : (row.gate.timeIn > '07:30' ? 'L' : 'P'), reason: input.reason, actorName: 'You' };
      return { data: { ok: true, revision: row.revision, operationId: input.operationId } };
    }
    throw new Error(`Preview has no ${name}`);
  };
}
```

- [ ] **Step 2: Create the page, entry and config**

Create `parent/tests/class-preview.html`:

```html
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Class tab preview</title></head>
  <body><div id="root"></div><script type="module" src="./class-preview.jsx"></script></body>
</html>
```

Create `parent/tests/class-preview.jsx`:

```jsx
import { createRoot } from 'react-dom/client';
import '../../shared/theme/theme.css';
import '../src/glass.css';
import ClassTab from '../src/screens/school/ClassTab.jsx';

// ?theme=dark previews Night teal; ?ended=1 previews an ended school year.
const params = new URLSearchParams(location.search);
if (params.get('theme') === 'dark') document.documentElement.dataset.theme = 'dark';
document.body.style.margin = '0';
createRoot(document.getElementById('root')).render(
  <main style={{ maxWidth: 560, margin: '0 auto', padding: '16px 16px 120px', boxSizing: 'border-box', fontFamily: 'Inter, system-ui, sans-serif', color: 'var(--t-ink)', minHeight: '100dvh' }}>
    <h1 style={{ fontSize: 28, margin: '8px 0 12px' }}>Class</h1>
    <ClassTab sections={[{ id: 'SEC1', name: 'Mabini', gradeLevel: 8, schoolYear: '2026-2027' }]} ended={params.get('ended') === '1'} />
  </main>,
);
```

Create `parent/tests/class-preview.config.mjs`:

```js
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const fake = fileURLToPath(new URL('./class-preview-firebase.js', import.meta.url));
// Swap the app's firebase.js for the in-memory fake; nothing reaches Firebase.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), { name: 'class-preview-firebase', enforce: 'pre', resolveId(source, importer) {
    return source.endsWith('/firebase.js') && importer && !importer.includes('class-preview') ? fake : null;
  } }],
  server: { port: 5188, strictPort: true, fs: { allow: [fileURLToPath(new URL('../..', import.meta.url))] } },
});
```

- [ ] **Step 3: Run the preview and check it visually**

Start it in the background: `npx vite --config parent/tests/class-preview.config.mjs`. Open `http://localhost:5188/class-preview.html` in the browser pane at mobile size (375×812), in light mode and with `?theme=dark`. Check each of these:
- The first viewport shows the session header, "In school" with gate times, and tappable rows.
- Tapping a row opens the sheet, and one reason tap flags the learner with an "Undo" toast. Undo restores them.
- Select mode → tick three → Flag → one reason flags all three.
- The Flagged and "Absent or no gate entry" groups are collapsed and expand.
- Past days shows the view-only note and no flag actions.
- Keyboard: Tab reaches every control with a visible outline; Escape closes the sheet.

Stop the server with TaskStop. If that leaves vite running, find the PID listening on 5188 (`netstat -ano | findstr :5188`) and run `taskkill /PID <pid> /T /F`. **Never** `taskkill /IM node.exe`.

- [ ] **Step 4: Run the design detector**

Run: `node C:/Users/jitsb/.claude/skills/impeccable/scripts/detect.mjs --json parent/src/screens/school parent/src/screens/settings/SchoolModePage.jsx`
Fix any finding that applies, then re-run Step 3's checks.

- [ ] **Step 5: Commit**

```bash
git add parent/tests/class-preview.config.mjs parent/tests/class-preview.html parent/tests/class-preview.jsx parent/tests/class-preview-firebase.js
git commit -m "Add a fake-data preview for the Class tab"
```

---

### Task 6: Build, bundle budget and final checks

**Files:** none new.

- [ ] **Step 1: Link the real Parent dependencies (worktree only)**

Worktrees have no `parent/node_modules`, and byte-exact builds need the main checkout's copy. In PowerShell from the worktree root:

```powershell
New-Item -ItemType Junction -Path parent\node_modules -Target "C:\Users\jitsb\OneDrive - Department of Education\Desktop\APPS\bnhs-sims\parent\node_modules"
```

- [ ] **Step 2: Build with the private env loaded for the build only, then check size**

In Bash from the worktree root:

```bash
(set -a; . "/c/Users/jitsb/OneDrive - Department of Education/Desktop/APPS/bnhs-sims/parent/.env"; set +a; npm --prefix parent run build && npm --prefix parent run size)
```

Expected: build succeeds, and the size check reports eager JS ≤ 260 KB gzip (it should drop below 259.3 KB, because the header switch and `School.css` left the eager chunk).

- [ ] **Step 3: Remove the junction**

```powershell
(Get-Item parent\node_modules).Delete()
```

Use `.Delete()`, not `Remove-Item -Recurse`, which would follow the junction into the main checkout.

- [ ] **Step 4: Full test run**

```bash
npm --prefix parent test
npx vitest run
```

Expected: all PASS.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A parent
git commit -m "Fix issues found in the School mode build checks"
```

(Skip if nothing changed.)
