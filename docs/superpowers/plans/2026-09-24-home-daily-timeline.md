# Home Daily Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The parent app's Home screen currently collapses a whole day down to just the first "in" and the most recent "out" — a student who taps in/out more than twice in a day (leaves for lunch, an early dismissal, a re-entry) has those middle taps invisible on Home. Show every scan of the day, in order, so a parent can actually follow a learner's whereabouts through the day at a glance.

**Architecture:** `learners/{id}.today` (written by `functions/src/lib/recomputeSummary.js` on every scan) gains a full chronological list of the day's events, alongside the existing `firstIn`/`lastOut`/`status` fields. The parent app's `describeToday()` renders that list instead of a hardcoded two-line "entered/left" pair, with a graceful fallback to the old two-field shape for any summary doc written before this change deploys.

**Tech Stack:** Firebase Cloud Functions v2 (Node), React 19 parent portal, Vitest (`npm --prefix functions test`, `npm --prefix parent test` — both plain unit-test suites, no emulator or component-test framework needed for this change).

## Global Constraints

- `learners/{id}.today` has exactly one writer (`functions/src/lib/recomputeSummary.js`, called from `functions/src/handlers/scanEvent.js`) and exactly one reader (`parent/src/lib/format.js`'s `describeToday()`, called from `parent/src/screens/Home.jsx`) — confirmed by a repo-wide search. No other file depends on this field's current shape.
- A `learners/{id}.today` doc written by the *old* summary shape (no `events` field) must still render sensibly — falling back to the existing `firstIn`/`lastOut` fields — until that learner's next scan refreshes it with the new shape. Do not require a backfill migration.
- `History.jsx` and the Inbox thread already show every individual scan of the day (confirmed by reading `parent/src/lib/thread.js`'s `stackDay()` and `scanEvent.js`'s inbox-item write, which uses a unique per-scan document id) — neither needs any change here.
- Keep the existing "No exit recorded yet" reassurance (`S.homeNoExit`), shown specifically when the learner's most recent event of the day is an "in" (i.e. still checked in) — not only when there has been exactly one tap.
- No Firestore rules changes: this is the same document and the same guardian read-access the app already has.

---

### Task 1: Backend — `recomputeSummary` lists every event of the day

**Files:**
- Modify: `functions/src/lib/recomputeSummary.js`
- Modify: `functions/src/lib/recomputeSummary.test.js`

**Interfaces:**
- Produces: `recomputeSummary({ events, todayDate, recentLimit }).today.events` → `Array<{ kind: 'in' | 'out', time: string /* 'HH:MM' */, eventId: string }>`, sorted chronologically ascending (earliest tap of the day first). `today.date`/`today.firstIn`/`today.lastOut`/`today.status` and the top-level `recent` array keep their exact current shape and meaning — this task only adds the new `events` field alongside them.

- [ ] **Step 1: Write the failing tests, and fix one pre-existing test that this change would otherwise break**

First, fix the existing `'no events today'` test in `functions/src/lib/recomputeSummary.test.js` — it currently does a *whole-object* `toEqual` on `r.today`, which requires an exact match. Adding the new `events` field (Step 3 below) would make this test fail even though nothing about its actual intent changed, unless its expectation is updated too:

```js
  it('no events today', () => {
    const r = recomputeSummary({ events: [ev('a', 'in', '2026-09-20', '07:00', 1)], todayDate: '2026-09-21' });
    expect(r.today).toEqual({ date: '2026-09-21', firstIn: null, lastOut: null, status: 'no_scan', events: [] });
    expect(r.recent).toHaveLength(1);
  });
```

(The other three pre-existing tests check individual fields like `r.today.firstIn`/`r.today.status`, not the whole `r.today` object, so they are unaffected and need no change.)

Then add to the end of the `describe('recomputeSummary', ...)` block (the file already defines the `ev(id, kind, date, time, ms, status = 'recorded')` helper at the top — reuse it, don't redefine it):

```js
  it('lists every event of the day in chronological order, not just first-in/last-out', () => {
    const r = recomputeSummary({ events: [
      ev('in1', 'in', '2026-09-21', '07:12', 12),
      ev('out1', 'out', '2026-09-21', '12:00', 120),
      ev('in2', 'in', '2026-09-21', '12:45', 145),
      ev('out2', 'out', '2026-09-21', '16:05', 165),
    ], todayDate: '2026-09-21' });
    expect(r.today.events).toEqual([
      { kind: 'in', time: '07:12', eventId: 'in1' },
      { kind: 'out', time: '12:00', eventId: 'out1' },
      { kind: 'in', time: '12:45', eventId: 'in2' },
      { kind: 'out', time: '16:05', eventId: 'out2' },
    ]);
    expect(r.today.firstIn).toEqual({ time: '07:12', eventId: 'in1' });
    expect(r.today.lastOut).toEqual({ time: '16:05', eventId: 'out2' });
    expect(r.today.status).toBe('out');
  });

  it('excludes voided events from the day list, same as it already does for firstIn/lastOut', () => {
    const events = [ev('in1', 'in', '2026-09-21', '07:12', 12), ev('bad', 'in', '2026-09-21', '07:30', 30, 'voided')];
    const r = recomputeSummary({ events, todayDate: '2026-09-21' });
    expect(r.today.events).toEqual([{ kind: 'in', time: '07:12', eventId: 'in1' }]);
  });

  it('returns an empty events list when there is no scan today', () => {
    const r = recomputeSummary({ events: [ev('a', 'in', '2026-09-20', '07:00', 1)], todayDate: '2026-09-21' });
    expect(r.today.events).toEqual([]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd functions && npx vitest run src/lib/recomputeSummary.test.js`
Expected: the three new tests FAIL with `undefined` where `.events` is read (the field doesn't exist yet); the four pre-existing tests still PASS.

- [ ] **Step 3: Add the `events` field**

In `functions/src/lib/recomputeSummary.js`, add one line inside the returned `today` object (everything else in the file is unchanged):

```js
// Rebuilds learners/{id}.today and .recent from the learner's recent events.
// Ordering is by effectiveAtMs (scan time, or server time for skewed
// clocks), never by arrival, so delayed and out-of-order events land right.
export function recomputeSummary({ events, todayDate, recentLimit = 10 }) {
  const live = events.filter((e) => e.status === 'recorded').sort((a, b) => b.effectiveAtMs - a.effectiveAtMs);
  const today = live.filter((e) => e.scannedDate === todayDate);
  const ins = today.filter((e) => e.kind === 'in');
  const outs = today.filter((e) => e.kind === 'out');
  const firstIn = ins.length ? ins[ins.length - 1] : null;
  const lastOut = outs.length ? outs[0] : null;
  const status = today.length === 0 ? 'no_scan' : today[0].kind === 'in' ? 'in' : 'out';
  return {
    today: {
      date: todayDate,
      firstIn: firstIn ? { time: firstIn.scannedTime, eventId: firstIn.id } : null,
      lastOut: lastOut ? { time: lastOut.scannedTime, eventId: lastOut.id } : null,
      status,
      // `today` is sorted newest-first (inherited from `live`); reverse for
      // the natural chronological reading order a parent expects -- the
      // earliest tap of the day first, most recent last.
      events: [...today].reverse().map((e) => ({ kind: e.kind, time: e.scannedTime, eventId: e.id })),
    },
    recent: live.slice(0, recentLimit).map((e) => ({ id: e.id, kind: e.kind, scannedDate: e.scannedDate, scannedTime: e.scannedTime })),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd functions && npx vitest run src/lib/recomputeSummary.test.js`
Expected: PASS, all 7 tests (4 pre-existing + 3 new).

- [ ] **Step 5: Run the full functions unit suite**

Run: `cd functions && npm test`
Expected: PASS, no regressions (this field is additive; nothing else reads `today.events` yet).

- [ ] **Step 6: Commit**

```bash
git add functions/src/lib/recomputeSummary.js functions/src/lib/recomputeSummary.test.js
git commit -m "$(cat <<'EOF'
feat(functions): list every scan of the day in the learner summary

learners/{id}.today gains an events array (chronological, voided scans
excluded) alongside the existing firstIn/lastOut/status fields, so a
day with more than one in/out pair isn't collapsed down to just the
first entry and the last exit.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Frontend — Home renders the full day, not just entered/left

**Files:**
- Modify: `parent/src/lib/format.js`
- Modify: `parent/src/lib/format.test.js`
- Modify: `parent/src/screens/Home.jsx`

**Interfaces:**
- Consumes: `learners/{id}.today.events` from Task 1 (optional — a doc written before Task 1 deployed won't have it yet; must fall back to `today.firstIn`/`today.lastOut`).
- Produces: `describeToday(today, todayDate)` → `{ lines: string[], empty: string | null }`. This **replaces** the current `{ entered, left }` return shape — `Home.jsx` (this task's second file) is the only caller and is updated in the same task, so there is no intermediate broken state within this task.

This app has no component-test framework (no `@testing-library` — confirmed by the absence of any `.test.jsx` file in `parent/src`); `Home.jsx`'s change is verified via `npm run build` plus reading the resulting JSX carefully, matching this repo's established convention. `format.js` is a plain function and gets real unit tests as usual.

- [ ] **Step 1: Write the failing tests**

Replace the existing `'describes today honestly, including a stale summary from another day'` test in `parent/src/lib/format.test.js` with these two (the old test's assertions used the return shape this task removes, so it cannot simply be extended):

```js
  it('describes today as a chronological list, including a stale summary from another day', () => {
    expect(describeToday({ date: '2026-09-21', status: 'in', events: [{ kind: 'in', time: '07:12' }] }, '2026-09-21'))
      .toEqual({ lines: ['Entered 07:12 AM', 'No exit recorded yet'], empty: null });
    expect(describeToday({ date: '2026-09-21', status: 'out', events: [{ kind: 'in', time: '07:12' }, { kind: 'out', time: '16:05' }] }, '2026-09-21'))
      .toEqual({ lines: ['Entered 07:12 AM', 'Left 04:05 PM'], empty: null });
    expect(describeToday({ date: '2026-09-21', status: 'out', events: [
      { kind: 'in', time: '07:12' }, { kind: 'out', time: '12:00' }, { kind: 'in', time: '12:45' }, { kind: 'out', time: '16:05' },
    ] }, '2026-09-21')).toEqual({ lines: ['Entered 07:12 AM', 'Left 12:00 PM', 'Entered 12:45 PM', 'Left 04:05 PM'], empty: null });
    expect(describeToday({ date: '2026-09-20', status: 'out', events: [{ kind: 'in', time: '07:12' }, { kind: 'out', time: '16:05' }] }, '2026-09-21'))
      .toEqual({ lines: [], empty: 'No entry recorded today' });
    expect(describeToday(null, '2026-09-21')).toEqual({ lines: [], empty: 'No entry recorded today' });
  });
  it('falls back to firstIn/lastOut for a summary written before per-day events were tracked', () => {
    expect(describeToday({ date: '2026-09-21', status: 'in', firstIn: { time: '07:12' }, lastOut: null }, '2026-09-21'))
      .toEqual({ lines: ['Entered 07:12 AM', 'No exit recorded yet'], empty: null });
    expect(describeToday({ date: '2026-09-21', status: 'out', firstIn: { time: '07:12' }, lastOut: { time: '16:05' } }, '2026-09-21'))
      .toEqual({ lines: ['Entered 07:12 AM', 'Left 04:05 PM'], empty: null });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd parent && npx vitest run src/lib/format.test.js`
Expected: FAIL — `describeToday` still returns `{ entered, left }`, not `{ lines, empty }`.

- [ ] **Step 3: Rewrite `describeToday`**

Replace the current `describeToday` function in `parent/src/lib/format.js`:

```js
export function describeToday(today, todayDate) {
  if (!today || today.date !== todayDate) return { lines: [], empty: S.homeTodayNone };
  const events = today.events || [
    ...(today.firstIn ? [{ kind: 'in', time: today.firstIn.time }] : []),
    ...(today.lastOut ? [{ kind: 'out', time: today.lastOut.time }] : []),
  ];
  if (!events.length) return { lines: [], empty: S.homeTodayNone };
  const lines = events.map((e) => `${e.kind === 'in' ? S.homeEntered : S.homeLeft} ${formatScanTime(e.time)}`);
  if (events[events.length - 1].kind === 'in') lines.push(S.homeNoExit);
  return { lines, empty: null };
}
```

(`formatScanTime` and `S` are already imported at the top of this file — no new imports needed.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd parent && npx vitest run src/lib/format.test.js`
Expected: PASS, all tests in the file.

- [ ] **Step 5: Update `Home.jsx`'s `LearnerCard`**

Replace the current `LearnerCard` function in `parent/src/screens/Home.jsx`:

```jsx
function LearnerCard({ link, navigate }) {
  const { data, error } = useDoc(`learners/${link.studentId}`);
  if (error === 'permission-denied') return <Card><Banner tone="warn">{S.accessEnded}</Banner></Card>;
  if (data === undefined) return <Card><Spinner label={S.loading} /></Card>;
  const today = describeToday(data?.today, localDate());
  return (
    <Card>
      <div style={{ fontWeight: 800, fontSize: 18 }}>{data?.displayName || '—'}</div>
      <div style={{ color: T.inkMuted, fontSize: 13, marginBottom: 10 }}>{data?.sectionLabel}</div>
      {today.empty
        ? <div style={{ fontSize: 16, marginBottom: 10 }}>{today.empty}</div>
        : today.lines.map((line, i) => (
            <div key={i} style={{ fontSize: 16, marginBottom: i === today.lines.length - 1 ? 10 : 4 }}>{line}</div>
          ))}
      <Btn variant="ghost" onClick={() => navigate(`/learner/${link.studentId}`)}>{S.homeViewHistory}</Btn>
    </Card>
  );
}
```

Nothing else in this file changes — `Home`'s own body, imports, and the rest of the file are unaffected.

- [ ] **Step 6: Build**

Run: `cd parent && npm run build`
Expected: succeeds with no new errors.

- [ ] **Step 7: Run the full parent unit suite**

Run: `cd parent && npm test`
Expected: PASS, all tests (the two rewritten `describeToday` tests plus everything else, unaffected).

- [ ] **Step 8: Commit**

```bash
git add parent/src/lib/format.js parent/src/lib/format.test.js parent/src/screens/Home.jsx
git commit -m "$(cat <<'EOF'
feat(parent): show every tap of the day on the Home learner card

describeToday now renders the full chronological list from
learners/{id}.today.events (falling back to firstIn/lastOut for a
summary written before that field existed), so a student who taps
in/out more than once a day is fully visible on Home instead of
being collapsed to just the first entry and the last exit.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
