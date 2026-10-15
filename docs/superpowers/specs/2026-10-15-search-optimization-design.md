# Faster search in SIMS and the kiosk — design

Date: 2026-10-15
Status: approved design, awaiting spec review
Scope: SIMS staff app (`bnhs-sims/src`), student kiosk (`bnhs-student-kiosk/src`). Cloud Functions and the parent app are out of scope.

## Problem

Staff report three slow spots:

1. **Opening a page** (Students, Guardians tabs, ID Cards) — the search box waits for the roster.
2. **Typing in a search box** — results lag, the page stutters.
3. **Kiosk scans** — slow to recognise a learner, especially right after boot.

What the code does today:

- Every page opens its own `onSnapshot` listeners on `students`, `enrollments`, `sections` (13 pages, 32 call sites). Navigating Students → Guardians → ID Cards re-reads thousands of documents from IndexedDB and re-syncs them with the server each time.
- Guardians tabs (Links, Reports, Requests, Scan Log) and ID Cards subscribe to **all** enrollments of every school year.
- `src/firebase.js` uses the deprecated `enableIndexedDbPersistence`, which works in one tab only; a second SIMS tab silently runs uncached.
- `matchesWords` re-normalizes every learner's name on every keystroke; `depedSort` re-sorts the full list on every keystroke.
- The Students page renders **every** matching learner as a table row (thousands of `<tr>` with Edit/Delete buttons) on every keystroke — the main cause of typing lag.
- The Students page uses a substring match; every other page uses word-start matching via `src/lib/search.js`.
- The kiosk runs `allStudents.find(s => s.lrn === lrn)` and `allEnrollments.find(...)` (every year's enrollments) on each scan, and only waits for `sections` before accepting scans — a scan right after boot can say "Unrecognized" when students simply have not loaded yet.

Cloud Functions already use direct document reads (`enrollments/{studentId}_{schoolYear}`) and a TTL cache (`functions/src/cache.js`); no change there.

## Decisions made with the user

- Approach: **load once, index once, client-side** (rejected: server-side token search — adds a network round trip per keystroke and cannot serve the offline kiosk; quick-wins only — leaves page opens slow).
- On-disk Firestore cache in SIMS is acceptable; it is **cleared on sign-out**.
- **Word-start matching everywhere**, including the Students page (it loses mid-word matches such as "ana" → "Santana").
- Students table pages with a **"Show 100 more"** button (not infinite scroll).

## Design

### 1. SIMS data layer

**1a. Multi-tab disk cache.** In `src/firebase.js` replace `getFirestore` + `enableIndexedDbPersistence` with:

```js
initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
```

Emulator wiring stays as is.

**1b. Clear on sign-out.** Add one helper (in `src/firebase.js`) `signOutAndClear(notice = '')`: store `notice` in `sessionStorage` under `sims.signOutNotice` (wrapped in try/catch) → `signOut(auth)` → `terminate(db)` → `clearIndexedDbPersistence(db)` (errors ignored) → `window.location.reload()`. On start, `App.jsx` reads and removes `sims.signOutNotice` and seeds its `notice` state with it, so forced sign-outs still explain themselves on the login screen ("Your session has ended…", "This account has no staff profile yet…"). Every SIMS sign-out path in `src/App.jsx` (manual logout, session-ended ×2, refused profile) and the failed re-sign-in in `src/components/ChangePassword.jsx` uses it. Consequence: the first page after each login downloads the roster from the server; later page opens in that session are served from memory.

Known edge: `clearIndexedDbPersistence` fails while another SIMS tab still holds the database. Logout still reloads; that cache is cleared the next time a tab signs out with no other tab open. This is accepted and stays documented here.

**1c. Shared subscription registry.** New module `src/lib/subscriptionRegistry.js`, used inside `src/hooks/useCollection.js`:

- `acquire(key, subscribe)` returns `{ current, listen(cb), release() }`. The first acquirer of a key starts the Firestore listener; later acquirers immediately receive the last published `{ data, loading, error }` and share the same listener.
- When the last consumer releases, the listener lingers **5 minutes**, then unsubscribes. A new acquirer during the linger reuses it and cancels the timer.
- Errors are published to every consumer of the key. `retry()` on any consumer drops the entry and resubscribes.
- Keys are explicit strings built by the hooks, e.g. `students|all`, `enrollments|sy=2026-2027`, `students|sy=2026-2027|grades=7,8`. `useStaffCollectionResource` builds its key from `path`, `role`, `gradeLevel`, `schoolYear`, `sectionId`, `date`; `useCollectionResource(path)` uses `path|all`.
- Public hook signatures (`useCollectionResource`, `useDocResource`, `useQueryResource`, `useStaffCollectionResource`, `useCollection`, `useDoc`, `useQueryRows`) are unchanged. `useQueryResource` and `useDocResource` gain an optional key; without a key they behave as today (unshared).
- The registry is cleared by `signOutAndClear()` (the reload does this implicitly).

**1d. Narrower enrollments for Guardians tabs and ID Cards.** `LinksTab`, `ReportsTab`, `RequestsTab`, `ScanLogTab` and `IDCardsPage` read enrollments through a shared, school-year-filtered query `where('schoolYear', '==', schoolYear)` (key `enrollments|sy=<sy>`). `currentEnrollmentByStudent(enrollments, schoolYear)` already discards other years, so results are identical. These pages keep the full `students` listener (key `students|all`) because the Links "Unassigned" filter and the Requests LRN lookup need learners with no current enrollment; the registry makes it one listener shared by all of them.

Not changed: `firestore.rules`, `src/lib/staffQueries.js` query shapes (they must mirror the read rules), Cloud Functions.

### 2. SIMS search index and typing speed

**2a. Indexed matcher in `src/lib/search.js`.**

- `buildLearnerIndex(students)` → array of `{ student, words, lrn }`, sorted in DepEd order (males then females, each by last then first name — same order as `depedSort`). `words` = normalized words of `firstName` and `lastName`; `lrn` = normalized LRN with spaces removed. Built once per data change via `useMemo`.
- `searchLearners(index, query, { includeLrn = false, accept, limit = Infinity })` normalizes the query once, walks the index in order and returns students where every query word is a prefix of some name word (any order), or — with `includeLrn` — the compact query is a prefix of the LRN. `accept(student)` is an optional extra predicate (grade, section, status). Stops when `limit` results are collected. An empty query returns every accepted learner (up to `limit`). Results are already in DepEd order; callers do not sort.
- `normalize`, `words`, `matchesWords`, `learnerMatches`, `sectionMatches` keep their current behaviour and signatures (section pickers and the Requests tab's typed-name match still use them).

**2b. Callers.** Learner search in Students, Links, Reports, Requests, Scan Log and ID Cards → Saved batch uses `buildLearnerIndex` + `searchLearners`. Students uses `includeLrn: true` (word-start, replacing its substring match). Pages whose list is not learners (Reports, Requests, Scan Log rows) build a `Set` of matching student ids from `searchLearners` and filter their rows by it, keeping each row list's existing order.

**2c. Non-blocking typing.** Search inputs keep their controlled `value`; the filtering `useMemo` reads `useDeferredValue(query)`. No fixed debounce.

**2d. Students table paging.** Show the first 100 rows; a "Show 100 more" button below the table appends 100; a line reads "Showing 100 of 2,431 learners". Changing the search or any filter resets to 100. Empty state: "No learners match “…”" when a search or filter is active; the existing "No learners yet" text otherwise.

### 3. Kiosk (`bnhs-student-kiosk`)

**3a. Map lookups.** New `src/lib/rosterIndex.js`:

- `indexStudents(students)` → `Map<trimmedLrn, student>`
- `indexEnrollments(enrollments)` → `Map<\`${studentId}_${schoolYear}\`, enrollment>`, keeping only `status === 'enrolled'`
- `indexSections(sections)` → `Map<id, section>`
- `lookupScan({ lrn, schoolYear, indexes })` → `{ student, enrollment, section }` or `{ error: 'unrecognized' | 'noEnrollment' }`

`App.jsx` builds the maps with `useMemo` when snapshots arrive, stores them in `dataRef`, and `handleScan` calls `lookupScan`. The error codes map to the existing `SCAN_ERRORS` values.

**3b. This year's enrollments only.** The enrollments listener becomes `query(collection(db, 'enrollments'), where('schoolYear', '==', schoolYear))`, where `schoolYear = settings?.currentSchoolYear || currentSchoolYear(now())`. It resubscribes when that value changes. Kiosks may already read enrollments (`firestore.rules`), and single-field equality needs no composite index. Students and sections stay unfiltered.

**3c. Ready gate.** Track a first-snapshot flag for students, enrollments and sections. Until all three are ready, a scan fails with `SCAN_ERRORS.offline` (as the sections-only gate does today), never `unrecognized`. The enrollments flag resets when the school year changes.

**3d. Cache upgrade.** Same `initializeFirestore` + `persistentLocalCache` change as SIMS (single-tab manager is enough). No clearing on sign-out — the kiosk is a dedicated device.

Not changed: `recordScan`, offline queueing, `scanEvent` ids, `SCAN_ERRORS` codes.

### 4. Testing, measurement, rollout

**Tests**

- SIMS `src/lib/search.test.js`: index order matches `depedSort`; multi-word any-order prefix match; LRN prefix with `includeLrn`; accented names; `accept` filter; `limit` stops early; empty query; existing cases stay green.
- SIMS `src/lib/subscriptionRegistry.test.js` (fake `subscribe`, fake timers): two consumers share one listener; late consumer gets current data synchronously; linger then unsubscribe; re-acquire during linger reuses; error reaches all consumers; retry resubscribes.
- Kiosk `src/lib/rosterIndex.test.js`: LRN trimmed; key format; non-enrolled ignored; `unrecognized` vs `noEnrollment`; section missing → `section: null`.
- Kiosk ready gate covered by a unit test of the gate helper.
- Full suites: SIMS `npm test` and `npm run test:rules` (rules unchanged, run as a guard); kiosk `npm test`.

**Measurement** (emulator, ~3,000 seeded learners, recorded in each PR, before and after): Students page open cold and after navigating from Dashboard; keystroke-to-results on Students and Links; kiosk boot-to-first-accepted-scan and per-scan lookup time. No timing assertions in tests.

**Rollout**

1. Kiosk: branch → PR → merge → deploy as usual (independent repo).
2. SIMS: branch → PR → merge to `master`. Merging does not reach production.
3. SIMS production: a separate step needing the user's explicit approval. Production hosting is built from the temporary-password release tree, not `master` (coordinator rollout on hold). The change is hand-ported onto that tree: `search.js`, the Students table and the Guardians/ID Cards callers port directly; the registry in `useCollection.js` is adapted to the tree's pre-coordinator hooks. Build is byte-checked against the live site per the existing release process.
