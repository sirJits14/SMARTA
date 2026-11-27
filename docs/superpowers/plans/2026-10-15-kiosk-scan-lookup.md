# Kiosk Scan Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each kiosk scan a direct lookup, load only the current school year's enrollments, never say "Unrecognized" while the roster is still loading, and start scanning from the on-disk cache after a reboot.

**Architecture:** A pure `src/lib/rosterIndex.js` turns the student, enrollment and section snapshots into `Map`s once per snapshot and answers each scan with three `Map.get` calls. `App.jsx` builds the maps with `useMemo`, narrows the enrollments listener to the current school year, and gates scans on every list having loaded.

**Tech Stack:** React, Firebase JS SDK 12 (Firestore), Vite, Vitest (node environment).

**Repo:** `C:\Users\jitsb\OneDrive - Department of Education\Desktop\APPS\bnhs-student-kiosk` (GitHub `sirJits14/bnhs-student-kiosk`). This plan is stored in the `bnhs-sims` repo next to its spec: `docs/superpowers/specs/2026-10-15-search-optimization-design.md` §3.

## Global Constraints

- Do not change `recordScan`, offline queueing, `scanEventId`, or the `SCAN_ERRORS` codes (`unrecognized`, `noEnrollment`, `offline`).
- Enrollment key format: `` `${studentId}_${schoolYear}` `` (same as Cloud Functions' `enrollments/{studentId}_{schoolYear}`); only `status === 'enrolled'` entries are indexed.
- School year: `settings?.currentSchoolYear || currentSchoolYear(<date>)` (existing rule).
- No cache clearing on sign-out: the kiosk is a dedicated device.
- Never kill `node` processes by name; stop only servers you started, by their own task/PID.

## Precondition (stop and ask if not met)

The kiosk `master` checkout had uncommitted in-progress work on 2026-10-15 (`src/App.jsx`, `src/data/attendance.js`, `src/lib/scanOutcome.js`, new `src/lib/hardwareScanner.js`, `CODEX_HANDOFF.md`). This plan's `App.jsx` edits are written against that working copy (it already imports `hardwareScanner`).

- [ ] Run `git -C "<kiosk repo>" status --short`. If that work is still uncommitted, **stop and ask the user** whether it should be committed first. Do not stash, commit or discard it yourself.
- [ ] Once `master` is clean (or the user decides), create a worktree/branch `claude/kiosk-scan-lookup` from `master`.

## File map

| File | Change | Responsibility |
|---|---|---|
| `src/lib/rosterIndex.js` | create | pure maps, scan lookup, ready gate |
| `src/lib/rosterIndex.test.js` | create | tests |
| `src/App.jsx` | modify | build maps, filtered enrollments listener, ready gate |
| `src/firebase.js` | modify | `persistentLocalCache` |

---

### Task 1: Roster index

**Files:**
- Create: `src/lib/rosterIndex.js`
- Test: `src/lib/rosterIndex.test.js`

**Interfaces:**
- Produces:
  - `indexStudents(students) => Map<string, student>` (key: trimmed LRN; first student wins, like `Array.find`)
  - `indexEnrollments(enrollments) => Map<string, enrollment>` (key `${studentId}_${schoolYear}`; enrolled only; first wins)
  - `indexSections(sections) => Map<string, section>`
  - `lookupScan({ lrn, schoolYear, studentByLrn, enrollmentByKey, sectionById }) => { student, enrollment, section } | { error: 'unrecognized' | 'noEnrollment' }` (`section` is `null` when missing)
  - `rosterReady({ studentsReady, sectionsReady, settingsReady, enrollmentsYear, schoolYear }) => boolean`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/rosterIndex.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { indexEnrollments, indexSections, indexStudents, lookupScan, rosterReady } from './rosterIndex.js';

const ana = { id: 'ana', lrn: '100000000001', firstName: 'Ana', lastName: 'Santos' };
const ben = { id: 'ben', lrn: ' 100000000002 ', firstName: 'Ben', lastName: 'Cruz' };
const sec = { id: 'sec7', name: 'Rizal', gradeLevel: 7 };
const indexes = () => ({
  studentByLrn: indexStudents([ana, ben, { id: 'dup', lrn: '100000000001' }, { id: 'nolrn' }]),
  enrollmentByKey: indexEnrollments([
    { id: 'ana_2025-2026', studentId: 'ana', schoolYear: '2025-2026', status: 'enrolled', sectionId: 'old' },
    { id: 'ana_2026-2027', studentId: 'ana', schoolYear: '2026-2027', status: 'enrolled', sectionId: 'sec7' },
    { id: 'ben_2026-2027', studentId: 'ben', schoolYear: '2026-2027', status: 'transferred', sectionId: 'sec7' },
  ]),
  sectionById: indexSections([sec]),
});

describe('roster index', () => {
  it('finds a learner by trimmed LRN, first match wins', () => {
    const { studentByLrn } = indexes();
    expect(studentByLrn.get('100000000001')).toBe(ana);
    expect(studentByLrn.get('100000000002')).toBe(ben);
    expect(studentByLrn.size).toBe(2);
  });

  it('keys enrollments by student and school year, enrolled only', () => {
    const { enrollmentByKey } = indexes();
    expect(enrollmentByKey.get('ana_2026-2027').sectionId).toBe('sec7');
    expect(enrollmentByKey.has('ben_2026-2027')).toBe(false);
  });
});

describe('lookupScan', () => {
  it('returns the learner, this year’s enrollment and section', () => {
    const found = lookupScan({ lrn: ' 100000000001\n', schoolYear: '2026-2027', ...indexes() });
    expect(found).toEqual({ student: ana, enrollment: expect.objectContaining({ sectionId: 'sec7' }), section: sec });
  });

  it('reports an unknown LRN as unrecognized', () => {
    expect(lookupScan({ lrn: '999', schoolYear: '2026-2027', ...indexes() })).toEqual({ error: 'unrecognized' });
  });

  it('reports a learner without an enrolled record this year as noEnrollment', () => {
    expect(lookupScan({ lrn: '100000000002', schoolYear: '2026-2027', ...indexes() })).toEqual({ error: 'noEnrollment' });
    expect(lookupScan({ lrn: '100000000001', schoolYear: '2027-2028', ...indexes() })).toEqual({ error: 'noEnrollment' });
  });

  it('returns a null section when the section is missing', () => {
    expect(lookupScan({ lrn: '100000000001', schoolYear: '2025-2026', ...indexes() }).section).toBeNull();
  });
});

describe('rosterReady', () => {
  const all = { studentsReady: true, sectionsReady: true, settingsReady: true, enrollmentsYear: '2026-2027', schoolYear: '2026-2027' };
  it('is ready only when every list has loaded for this school year', () => {
    expect(rosterReady(all)).toBe(true);
    expect(rosterReady({ ...all, studentsReady: false })).toBe(false);
    expect(rosterReady({ ...all, sectionsReady: false })).toBe(false);
    expect(rosterReady({ ...all, settingsReady: false })).toBe(false);
    expect(rosterReady({ ...all, enrollmentsYear: null })).toBe(false);
    expect(rosterReady({ ...all, enrollmentsYear: '2025-2026' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/rosterIndex.test.js`
Expected: FAIL — cannot resolve `./rosterIndex.js`.

- [ ] **Step 3: Implement**

Create `src/lib/rosterIndex.js`:

```js
// Built once per snapshot so a scan is three direct lookups instead of a
// pass over every learner and every year's enrollments. First match wins,
// as Array.find did before.
export function indexStudents(students) {
  const byLrn = new Map();
  for (const student of students) {
    const lrn = String(student.lrn ?? '').trim();
    if (lrn && !byLrn.has(lrn)) byLrn.set(lrn, student);
  }
  return byLrn;
}

// Same id shape the functions use: enrollments/{studentId}_{schoolYear}.
export function indexEnrollments(enrollments) {
  const byKey = new Map();
  for (const enrollment of enrollments) {
    if (enrollment.status !== 'enrolled') continue;
    const key = `${enrollment.studentId}_${enrollment.schoolYear}`;
    if (!byKey.has(key)) byKey.set(key, enrollment);
  }
  return byKey;
}

export function indexSections(sections) {
  return new Map(sections.map((section) => [section.id, section]));
}

export function lookupScan({ lrn, schoolYear, studentByLrn, enrollmentByKey, sectionById }) {
  const student = studentByLrn.get(String(lrn).trim());
  if (!student) return { error: 'unrecognized' };
  const enrollment = enrollmentByKey.get(`${student.id}_${schoolYear}`);
  if (!enrollment) return { error: 'noEnrollment' };
  return { student, enrollment, section: sectionById.get(enrollment.sectionId) || null };
}

// A scan before every list has loaded must not be judged "unrecognized".
export function rosterReady({ studentsReady, sectionsReady, settingsReady, enrollmentsYear, schoolYear }) {
  return Boolean(studentsReady && sectionsReady && settingsReady && enrollmentsYear === schoolYear);
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/lib/rosterIndex.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/rosterIndex.js src/lib/rosterIndex.test.js
git commit -m "Add roster maps for direct scan lookups"
```

---

### Task 2: Wire the kiosk to the index

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: everything Task 1 produces; `currentSchoolYear(date)` from `src/lib/dates.js`; `now()` from `src/lib/clock.js`; `SCAN_ERRORS` from `src/lib/scanErrors.js`.

- [ ] **Step 1: Imports**

- `import { useCallback, useEffect, useRef, useState } from 'react';` → add `useMemo`.
- `import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';` → add `query, where`.
- Add: `import { indexEnrollments, indexSections, indexStudents, lookupScan, rosterReady } from './lib/rosterIndex.js';`

- [ ] **Step 2: Ready flags and maps**

Below `const [sectionsReady, setSectionsReady] = useState(false);` add:

```js
  // Every list must have loaded before a scan is judged (see rosterReady).
  const [studentsReady, setStudentsReady] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [enrollmentsYear, setEnrollmentsYear] = useState(null);
```

Below `const authReady = Boolean(device);` add:

```js
  const schoolYear = settings?.currentSchoolYear || currentSchoolYear(now());
  const studentByLrn = useMemo(() => indexStudents(students), [students]);
  const enrollmentByKey = useMemo(() => indexEnrollments(enrollments), [enrollments]);
  const sectionById = useMemo(() => indexSections(sections), [sections]);
```

Replace the `dataRef` declaration and its effect with:

```js
  const dataRef = useRef(null);
  dataRef.current = {
    studentByLrn, enrollmentByKey, sectionById, settings, mode, deviceId: device?.id,
    studentsReady, sectionsReady, settingsReady, enrollmentsYear,
  };
```

- [ ] **Step 3: Listeners**

Students listener body becomes:

```js
    return onSnapshot(collection(db, 'students'), (s) => {
      setStudents(s.docs.map((d) => ({ id: d.id, ...d.data() })));
      setStudentsReady(true);
    });
```

Enrollments listener becomes (note the new dependency):

```js
  useEffect(() => {
    if (!authReady) return;
    // Only this school year: past years' enrollments never reach the kiosk.
    return onSnapshot(query(collection(db, 'enrollments'), where('schoolYear', '==', schoolYear)), (s) => {
      setEnrollments(s.docs.map((d) => ({ id: d.id, ...d.data() })));
      setEnrollmentsYear(schoolYear);
    });
  }, [authReady, schoolYear]);
```

Settings listener body becomes:

```js
    return onSnapshot(doc(db, 'settings', 'app'), (s) => {
      setSettings(s.exists() ? s.data() : null);
      setSettingsReady(true);
    });
```

- [ ] **Step 4: Scan lookup**

In `handleScan`, replace everything from the `const { students: allStudents, … } = dataRef.current;` destructuring through `const section = allSections.find(...) || null;` with:

```js
    const current = dataRef.current;
    const currentMode = current.mode;
    const schoolYear = current.settings?.currentSchoolYear || currentSchoolYear(scannedAt);
    if (!rosterReady({ ...current, schoolYear })) { fail(SCAN_ERRORS.offline); return; }

    const found = lookupScan({ lrn, schoolYear, ...current });
    if (found.error) { fail(SCAN_ERRORS[found.error]); return; }
    const { student, enrollment, section } = found;
```

Leave the rest of `handleScan` unchanged (it already uses `student`, `enrollment`, `section`, `schoolYear`, `currentMode`, `dataRef.current.deviceId`).

- [ ] **Step 5: Check nothing still scans the lists**

Run: `git grep -n "allStudents\|allEnrollments\|allSections\|sReady" -- src`
Expected: no output.

- [ ] **Step 6: Tests and build**

Run: `npm test` → PASS.
Run: `npx vite build --outDir "$TMPDIR/kiosk-build-check"` (Bash; add dummy `VITE_FIREBASE_*` env vars inline if the config demands them) → builds.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx
git commit -m "Kiosk: direct scan lookups, current-year enrollments, full ready gate"
```

---

### Task 3: Persistent cache

**Files:**
- Modify: `src/firebase.js`

- [ ] **Step 1: Switch the cache API**

- Change the firestore import to: `import { initializeFirestore, persistentLocalCache, persistentSingleTabManager, connectFirestoreEmulator } from 'firebase/firestore';`
- Replace `export const db = getFirestore(app);` with:

```js
// Scans can start from the on-disk roster after a reboot while the server catches up.
export const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }) });
```

- Delete `enableIndexedDbPersistence(db).catch(() => {});`

- [ ] **Step 2: Check**

Run: `git grep -n "enableIndexedDbPersistence\|getFirestore" -- src` → no output.
Run: `npm test` → PASS. Build as in Task 2 → builds.

- [ ] **Step 3: Commit**

```bash
git add src/firebase.js
git commit -m "Kiosk: use the persistent local cache API"
```

---

### Task 4: Measure, verify, PR

- [ ] **Step 1: Lookup micro-measure** — scratch `bench-kiosk.mjs` in the session scratchpad:

```js
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const { indexStudents, indexEnrollments, indexSections, lookupScan } = await import(pathToFileURL(join(process.argv[2], 'src/lib/rosterIndex.js')));
const students = Array.from({ length: 3000 }, (_, i) => ({ id: `s${i}`, lrn: String(100000000000 + i) }));
const enrollments = ['2024-2025', '2025-2026', '2026-2027'].flatMap((sy) => students.map((s) => ({ studentId: s.id, schoolYear: sy, status: 'enrolled', sectionId: 'x' })));
const sections = [{ id: 'x' }];
const lrns = students.map((s) => s.lrn);
const time = (label, fn, runs = 2000) => { const t = performance.now(); for (let i = 0; i < runs; i++) fn(lrns[(i * 7919) % lrns.length]); console.log(label, (((performance.now() - t) / runs) * 1000).toFixed(1), 'µs/scan'); };
time('old find', (lrn) => { const st = students.find((s) => s.lrn === lrn); enrollments.find((e) => e.studentId === st.id && e.schoolYear === '2026-2027' && e.status === 'enrolled'); });
const idx = { studentByLrn: indexStudents(students), enrollmentByKey: indexEnrollments(enrollments), sectionById: indexSections(sections) };
time('new maps', (lrn) => lookupScan({ lrn, schoolYear: '2026-2027', ...idx }));
```

Run: `node "<scratchpad>/bench-kiosk.mjs" "<kiosk worktree>"` and record the numbers for the PR.

- [ ] **Step 2: Manual check (emulator or staging, never production data)** — boot the kiosk, scan immediately while loading: expect the existing "Can't reach the server" card, never "not recognized"; after load, a known LRN shows the learner card; an LRN with no enrollment this year shows the no-enrollment card. Reload the page offline-from-server (emulator stopped after first load): cached roster still recognizes learners.
- [ ] **Step 3:** `npm test` → PASS. Push branch, open a PR to `master` with the numbers.
- [ ] **Step 4:** Deploy (`npm run deploy`) **only after the user approves** in this session.
