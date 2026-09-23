# Inbox & History Chat-Style Stacking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the parent portal's Inbox read like a text-message thread (newest at the bottom, day dividers, consecutive messages about the same learner stacked into one bubble group) and make each History day a card whose Entered/Left scans are stacked as bubbles in time order; tapping an Inbox message opens that learner's History at the matching day card.

**Architecture:** All grouping/ordering is pure logic in a new `parent/src/lib/thread.js` (unit-tested with vitest, which only runs `src/**/*.test.js` in a node environment). A new presentational `parent/src/components/Bubble.jsx` renders one chat bubble plus a day divider; `Inbox.jsx` and `History.jsx` are rewritten to render `thread.js` output through `Bubble`. No backend, rules, or index changes — the Inbox keeps its existing query (`guardians/{uid}/inbox`, `orderBy('createdAt','desc')`, `limit(30)`), which already has the index it needs.

**Tech Stack:** React 19 (function components, inline styles), Firebase Web SDK 12 (Firestore `onSnapshot` via existing `useQuery`/`useDoc` hooks), Vite 8, Vitest 4.

## Global Constraints

- Every user-visible string lives in `parent/src/strings.js`; no empty strings; no string may contain `location`, `tracking`, or `live` (enforced by `src/lib/strings.test.js` — note this also bans words like "delivered" and "alive").
- Parent-facing scan labels stay `Entered school` / `Left school` (`S.eventIn` / `S.eventOut`, enforced by the strings test).
- Styling uses the tokens in `parent/src/styles.js` (`T.*`) with inline styles only. No new dependencies, no CSS files.
- Tap targets are at least `T.tap` (44px) tall.
- Initial-load bundle stays ≤ 260 KB gzip (`npm run size` in `parent/`). `Inbox` and `History` are already lazy-loaded in `App.jsx`; keep all new code imported only from those two screens.
- Firestore queries from the client must have `limit ≤ 50` (rules: `bounded(50)`). Guardians may only update `readAt` on inbox items (rules: `affectedOnly(['readAt'])`).
- The push deep link `/inbox?item=<inboxId>` must keep working: opening it marks that item read and, for attendance items, navigates to `/learner/<studentId>?event=<eventId>`.

## Background the engineer needs

**Inbox item shapes** (written server-side by `functions/src/handlers/scanEvent.js` and `functions/src/handlers/links.js`):

```js
// attendance item (one per gate scan per guardian)
{ type: 'attendance', studentId: 'S1', learnerName: 'Ana Cruz', kind: 'in' | 'out' | 'void',
  scannedDate: '2026-09-23', scannedTime: '07:12', eventId: 'legacy_…_in',
  createdAt: Timestamp, pushStatus: 'sent' | 'skipped_no_device' | …, readAt?: Timestamp }

// system item (access-request results, school-year notices)
{ type: 'system', title: '…', body: '…', studentId: 'S1' | null,
  createdAt: Timestamp, pushStatus: 'skipped_suppressed', readAt?: Timestamp }
```

**Learner event shape** (`learners/{studentId}/events/{eventId}`, what History lists):

```js
{ kind: 'in' | 'out', scannedDate: '2026-09-23', scannedTime: '07:12', effectiveAt: Timestamp,
  deviceLabel: 'School gate', status: 'recorded' | 'voided', voidReason?: '…',
  delayedSync: boolean, source: 'kiosk' | 'staff' | 'attendance-sync' }
```

**Existing helpers you'll reuse:**
- `shared/dates.js`: `localDate(d?)` → `'YYYY-MM-DD'` in device time; `manilaDate(d)` / `manilaTime(d)` → Manila `'YYYY-MM-DD'` / `'HH:MM'`; `formatDateLabel('2026-09-21')` → `'Mon 21 Sep'`; `formatScanTime('13:45')` → `'01:45 PM'`. Import path from `parent/src/lib/` is `'../../../shared/dates.js'`.
- `parent/src/lib/format.js`: `groupByDate(events)` → `[{ date, label, items }]`, days newest-first, items in input order; `eventTitle(e)` → `'Entered school'` / `'Left school'`.
- `parent/src/hooks/useDoc.js`: `useQuery(buildQuery, deps)` → `{ rows, error }` (`rows` is `undefined` while loading).

## Before you start

This worktree has today's production hotfixes **uncommitted** (Firestore rules, index overrides, the legacy-attendance bridge, the Inbox error state, app renames). Several files this plan touches (`parent/src/strings.js`, `parent/src/screens/Inbox.jsx`) already contain some of those edits. Commit the hotfixes on their own first, so this feature's commits contain only this feature:

```bash
git status --short
git add -A firestore.rules firestore.indexes.json functions parent src/firebase.js docs/guardian-account-guide.md
git commit -m "fix: production hotfixes from 2026-09-23 rollout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected afterwards: `git status --short` shows only `.claude/` (untracked, leave it) and this plan file.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `parent/src/lib/thread.js` | Create | Pure logic: where an inbox item sits in time, day labels, building the stacked Inbox feed, ordering a History day's scans |
| `parent/src/lib/thread.test.js` | Create | Unit tests for `thread.js` |
| `parent/src/strings.js` | Modify | Add `dayToday`, `dayYesterday`, `inboxFromSchool` |
| `parent/src/components/Bubble.jsx` | Create | Presentational chat bubble (`Bubble`) and day divider (`DayDivider`) |
| `parent/src/screens/Inbox.jsx` | Modify (rewrite render) | Chat-thread Inbox, marks items read when viewed, tap-through to History |
| `parent/src/screens/History.jsx` | Modify (rewrite render) | Day cards with stacked scan bubbles; highlight + scroll to the target day card |

---

### Task 1: Stacking logic (`thread.js`) and new strings

**Files:**
- Create: `parent/src/lib/thread.js`
- Create: `parent/src/lib/thread.test.js`
- Modify: `parent/src/strings.js` (add three keys next to `inboxNewEvent`)

**Interfaces:**
- Consumes: `formatDateLabel`, `manilaDate`, `manilaTime` from `shared/dates.js`; `S` from `strings.js`.
- Produces:
  - `itemMoment(item, now?: Date) → { date: 'YYYY-MM-DD', time: 'HH:MM' }`
  - `dayLabel(date: string, todayDate: string) → string` (`S.dayToday`, `S.dayYesterday`, or `formatDateLabel(date)`)
  - `toFeed(items, todayDate: string, now?: Date) → Array<{ date, label, runs: Array<{ key, studentId: string|null, learnerName: string|null, items: Array<item & { time: 'HH:MM' }> }> }>` — days oldest→newest; items oldest→newest; a run is consecutive items (within one day) with the same `studentId` (`null` studentId groups under key `'school'`).
  - `stackDay(events) → events[]` — a new array sorted by `scannedTime` ascending, ties broken by `effectiveAt` ascending.
  - Strings: `S.dayToday = 'Today'`, `S.dayYesterday = 'Yesterday'`, `S.inboxFromSchool = 'From the school'`.

- [ ] **Step 1: Write the failing tests**

Create `parent/src/lib/thread.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { itemMoment, dayLabel, toFeed, stackDay } from './thread.js';

const ts = (iso) => ({ toDate: () => new Date(iso), toMillis: () => Date.parse(iso) });
const att = (over) => ({ type: 'attendance', studentId: 'S1', learnerName: 'Ana Cruz', kind: 'in', scannedDate: '2026-09-23', scannedTime: '07:12', createdAt: ts('2026-09-23T07:12:30+08:00'), ...over });

describe('itemMoment', () => {
  it('uses the scan date/time for attendance items', () => {
    expect(itemMoment(att({ scannedDate: '2026-09-22', scannedTime: '16:30' }))).toEqual({ date: '2026-09-22', time: '16:30' });
  });
  it('reads system items from createdAt in Manila time', () => {
    // 17:30 UTC on the 22nd is 01:30 on the 23rd in Manila.
    expect(itemMoment({ type: 'system', createdAt: ts('2026-09-22T17:30:00Z') })).toEqual({ date: '2026-09-23', time: '01:30' });
  });
  it('treats a not-yet-resolved server timestamp as now', () => {
    expect(itemMoment({ type: 'system', createdAt: null }, new Date('2026-09-23T02:00:00Z'))).toEqual({ date: '2026-09-23', time: '10:00' });
  });
});

describe('dayLabel', () => {
  it('says Today and Yesterday, otherwise the short date', () => {
    expect(dayLabel('2026-09-23', '2026-09-23')).toBe('Today');
    expect(dayLabel('2026-09-22', '2026-09-23')).toBe('Yesterday');
    expect(dayLabel('2026-09-21', '2026-09-23')).toBe('Mon 21 Sep');
  });
  it('knows yesterday across a month boundary', () => {
    expect(dayLabel('2026-09-30', '2026-10-01')).toBe('Yesterday');
  });
});

describe('toFeed', () => {
  it('orders days and messages oldest to newest, newest last (like a text thread)', () => {
    const feed = toFeed([
      att({ id: 'c', scannedDate: '2026-09-23', scannedTime: '16:30', kind: 'out' }),
      att({ id: 'b', scannedDate: '2026-09-23', scannedTime: '07:12' }),
      att({ id: 'a', scannedDate: '2026-09-22', scannedTime: '07:05' }),
    ], '2026-09-23');
    expect(feed.map((d) => d.date)).toEqual(['2026-09-22', '2026-09-23']);
    expect(feed.map((d) => d.label)).toEqual(['Yesterday', 'Today']);
    expect(feed[1].runs[0].items.map((i) => i.id)).toEqual(['b', 'c']);
    expect(feed[1].runs[0].items.map((i) => i.time)).toEqual(['07:12', '16:30']);
  });

  it('stacks back-to-back messages about the same learner into one run', () => {
    const feed = toFeed([
      att({ id: 'a1', scannedTime: '07:10' }),
      att({ id: 'a2', scannedTime: '16:30', kind: 'out' }),
    ], '2026-09-23');
    expect(feed[0].runs).toHaveLength(1);
    expect(feed[0].runs[0]).toMatchObject({ key: 'S1', studentId: 'S1', learnerName: 'Ana Cruz' });
    expect(feed[0].runs[0].items.map((i) => i.id)).toEqual(['a1', 'a2']);
  });

  it('starts a new run when a different learner interrupts', () => {
    const feed = toFeed([
      att({ id: 'a1', scannedTime: '07:10' }),
      att({ id: 'b1', studentId: 'S2', learnerName: 'Ben Dy', scannedTime: '07:11' }),
      att({ id: 'a2', scannedTime: '07:12' }),
    ], '2026-09-23');
    expect(feed[0].runs.map((r) => r.key)).toEqual(['S1', 'S2', 'S1']);
  });

  it('puts school messages with no learner in their own run with no learner name', () => {
    const feed = toFeed([
      { id: 's1', type: 'system', title: 'New school year', body: 'Please re-link.', studentId: null, createdAt: ts('2026-09-23T08:00:00+08:00') },
    ], '2026-09-23');
    expect(feed[0].runs[0]).toMatchObject({ key: 'school', studentId: null, learnerName: null });
  });

  it('keeps a learner-scoped school message in that learner’s run and borrows the name', () => {
    const feed = toFeed([
      { id: 's1', type: 'system', title: 'Access approved', body: '…', studentId: 'S1', createdAt: ts('2026-09-23T07:00:00+08:00') },
      att({ id: 'a1', scannedTime: '07:12' }),
    ], '2026-09-23');
    expect(feed[0].runs).toHaveLength(1);
    expect(feed[0].runs[0].learnerName).toBe('Ana Cruz');
  });

  it('returns an empty feed for no items', () => {
    expect(toFeed([], '2026-09-23')).toEqual([]);
  });
});

describe('stackDay', () => {
  it('orders a day’s scans by time ascending without mutating the input', () => {
    const input = [{ id: 'out', scannedTime: '16:30' }, { id: 'in', scannedTime: '07:12' }];
    expect(stackDay(input).map((e) => e.id)).toEqual(['in', 'out']);
    expect(input.map((e) => e.id)).toEqual(['out', 'in']);
  });
  it('breaks same-minute ties by effectiveAt', () => {
    const e = (id, iso) => ({ id, scannedTime: '07:12', effectiveAt: ts(iso) });
    expect(stackDay([e('second', '2026-09-23T07:12:40+08:00'), e('first', '2026-09-23T07:12:05+08:00')]).map((x) => x.id)).toEqual(['first', 'second']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `parent/`): `npx vitest run src/lib/thread.test.js`
Expected: FAIL — `Failed to resolve import "./thread.js"`.

- [ ] **Step 3: Add the strings**

In `parent/src/strings.js`, directly after the `inboxNewEvent: 'New gate scan',` line, add:

```js
  inboxFromSchool: 'From the school',
  dayToday: 'Today',
  dayYesterday: 'Yesterday',
```

- [ ] **Step 4: Write the implementation**

Create `parent/src/lib/thread.js`:

```js
import S from '../strings.js';
import { formatDateLabel, manilaDate, manilaTime } from '../../../shared/dates.js';

// Where an inbox item sits on the timeline. Attendance items carry the
// kiosk's own scan date/time (what a parent cares about); system items only
// have the server's createdAt, read in Manila time. A server timestamp that
// hasn't resolved yet (null) counts as "now", so it lands at the bottom like
// a text that was just sent.
export function itemMoment(item, now = new Date()) {
  if (item.type === 'attendance') return { date: item.scannedDate, time: item.scannedTime };
  const d = item.createdAt?.toDate ? item.createdAt.toDate() : now;
  return { date: manilaDate(d), time: manilaTime(d) };
}

export function dayLabel(date, todayDate) {
  if (date === todayDate) return S.dayToday;
  const [y, m, d] = todayDate.split('-').map(Number);
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  if (date === yesterday) return S.dayYesterday;
  return formatDateLabel(date);
}

const createdMs = (item) => (item.createdAt?.toMillis ? item.createdAt.toMillis() : Number.MAX_SAFE_INTEGER);

// The Inbox as one text-message thread: days oldest -> newest (newest at the
// bottom), messages oldest -> newest within a day, and back-to-back messages
// about the same learner stacked into one run under a single name -- the way
// chat apps group consecutive texts from one sender.
export function toFeed(items, todayDate, now = new Date()) {
  const rows = items.map((it) => ({ it, m: itemMoment(it, now) }));
  rows.sort((a, b) => {
    const ka = `${a.m.date}T${a.m.time}`, kb = `${b.m.date}T${b.m.time}`;
    if (ka !== kb) return ka < kb ? -1 : 1;
    return createdMs(a.it) - createdMs(b.it);
  });

  const days = [];
  for (const { it, m } of rows) {
    let day = days[days.length - 1];
    if (!day || day.date !== m.date) {
      day = { date: m.date, label: dayLabel(m.date, todayDate), runs: [] };
      days.push(day);
    }
    const key = it.studentId || 'school';
    let run = day.runs[day.runs.length - 1];
    if (!run || run.key !== key) {
      run = { key, studentId: it.studentId || null, learnerName: null, items: [] };
      day.runs.push(run);
    }
    if (!run.learnerName && it.learnerName) run.learnerName = it.learnerName;
    run.items.push({ ...it, time: m.time });
  }
  return days;
}

const effectiveMs = (e) => (e.effectiveAt?.toMillis ? e.effectiveAt.toMillis() : 0);

// One History day, stacked the way it happened: Entered before Left.
export function stackDay(events) {
  return [...events].sort((a, b) => {
    if (a.scannedTime !== b.scannedTime) return a.scannedTime < b.scannedTime ? -1 : 1;
    return effectiveMs(a) - effectiveMs(b);
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `parent/`): `npx vitest run src/lib/thread.test.js`
Expected: PASS — 13 tests.

Then run the whole parent suite (the strings test checks the new keys): `npm test`
Expected: PASS — 5 test files.

- [ ] **Step 6: Commit**

```bash
git add parent/src/lib/thread.js parent/src/lib/thread.test.js parent/src/strings.js
git commit -m "feat(parent): pure stacking logic for chat-style inbox and history

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Chat-style Inbox

**Files:**
- Create: `parent/src/components/Bubble.jsx`
- Modify: `parent/src/screens/Inbox.jsx` (full rewrite shown below)

**Interfaces:**
- Consumes: `toFeed(items, todayDate)` from Task 1; `S.inboxFromSchool`; `localDate` from `shared/dates.js`; `useQuery` from `hooks/useDoc.js`.
- Produces:
  - `Bubble({ id?, title, time?, body?, meta?, first = true, last = true, unread = false, struck = false, highlight = false, onClick?, children? })` — renders a `<button>` when `onClick` is given, otherwise a `<div>`.
  - `DayDivider({ label })`.
  - Inbox navigates attendance taps to `/learner/<studentId>?event=<eventId>` (History, Task 3, reads `route.query.event`).

- [ ] **Step 1: Create the bubble component**

Create `parent/src/components/Bubble.jsx`:

```jsx
import { T } from '../styles.js';

const R = 18, TIGHT = 6;

// One text-message bubble, received-side (left-aligned). In a stacked run
// only the first bubble keeps a round top-left corner and only the last keeps
// a round bottom-left one, so back-to-back bubbles read as a single group --
// the way chat apps stack consecutive texts from one sender.
export function Bubble({ id, title, time, body, meta, first = true, last = true, unread = false, struck = false, highlight = false, onClick, children }) {
  const shell = {
    display: 'block', width: 'fit-content', maxWidth: '85%', boxSizing: 'border-box', textAlign: 'left',
    margin: `0 0 ${last ? 0 : 3}px`, padding: '9px 14px', fontFamily: T.font, color: T.ink,
    background: unread ? 'rgba(91,79,232,0.10)' : T.surface,
    border: `1px solid ${highlight ? T.primary : T.border}`,
    boxShadow: highlight ? `0 0 0 2px ${T.primary}` : 'none',
    borderRadius: `${first ? R : TIGHT}px ${R}px ${R}px ${last ? R : TIGHT}px`,
  };
  const strike = struck ? 'line-through' : 'none';
  const inner = (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontWeight: unread ? 700 : 600, fontSize: 15, textDecoration: strike }}>{title}</span>
        {time && <span style={{ fontSize: 12, color: T.inkMuted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textDecoration: strike }}>{time}</span>}
      </div>
      {body && <div style={{ fontSize: 14, marginTop: 2 }}>{body}</div>}
      {meta && <div style={{ fontSize: 12, color: T.inkMuted, marginTop: 2 }}>{meta}</div>}
      {children}
    </>
  );
  return onClick
    ? <button id={id} type="button" onClick={onClick} style={{ ...shell, minHeight: T.tap, cursor: 'pointer' }}>{inner}</button>
    : <div id={id} style={shell}>{inner}</div>;
}

export const DayDivider = ({ label }) => (
  <div role="separator" aria-label={label} style={{ textAlign: 'center', margin: '14px 0 8px' }}>
    <span style={{ fontFamily: T.font, fontSize: 12, fontWeight: 600, color: T.inkMuted, background: T.border, borderRadius: T.pill, padding: '3px 10px' }}>{label}</span>
  </div>
);
```

- [ ] **Step 2: Rewrite the Inbox screen**

Replace the entire contents of `parent/src/screens/Inbox.jsx` with:

```jsx
import { useEffect, useRef } from 'react';
import { collection, query, orderBy, limit, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';
import S from '../strings.js';
import { T } from '../styles.js';
import { Spinner, EmptyState } from '../components/ui.jsx';
import { Bubble, DayDivider } from '../components/Bubble.jsx';
import { useQuery } from '../hooks/useDoc.js';
import { toFeed } from '../lib/thread.js';
import { formatScanTime, localDate } from '../../../shared/dates.js';

const KIND = { in: S.eventIn, out: S.eventOut, void: S.eventVoided };

export default function Inbox({ user, navigate, route }) {
  const { rows, error } = useQuery(() => query(collection(db, `guardians/${user.uid}/inbox`), orderBy('createdAt', 'desc'), limit(30)), [user.uid]);
  const endRef = useRef(null);
  // Which items were unread when this visit started. Opening the thread marks
  // everything read (like opening a chat), but these keep their "new" styling
  // until the guardian leaves, so they can still see what was new.
  const unreadAtOpen = useRef(null);
  if (rows && unreadAtOpen.current === null) unreadAtOpen.current = new Set(rows.filter((r) => !r.readAt).map((r) => r.id));

  const markRead = (item) => {
    if (!item.readAt) updateDoc(doc(db, `guardians/${user.uid}/inbox/${item.id}`), { readAt: serverTimestamp() }).catch(() => {});
  };
  const open = (item) => {
    markRead(item);
    if (item.type === 'attendance') navigate(`/learner/${item.studentId}?event=${item.eventId}`);
  };

  // Push deep link: /inbox?item=<inboxId>
  useEffect(() => { const target = rows?.find((r) => r.id === route.query.item); if (target) open(target); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [rows === undefined, route.query.item]);
  // Viewing the thread reads it.
  useEffect(() => { rows?.forEach(markRead); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [rows]);
  // Land on the newest message, at the bottom, like a text thread.
  useEffect(() => { if (rows?.length) endRef.current?.scrollIntoView({ block: 'end' }); }, [rows === undefined]); // eslint-disable-line react-hooks/exhaustive-deps

  if (rows === undefined) return <Spinner label={S.loading} />;
  if (error) return <EmptyState title={S.inboxTitle} hint={S.inboxError} />;
  if (rows.length === 0) return <EmptyState title={S.inboxTitle} hint={S.inboxEmpty} />;

  return (
    <>
      <h1 style={{ fontSize: 20 }}>{S.inboxTitle}</h1>
      {toFeed(rows, localDate()).map((day) => (
        <div key={day.date}>
          <DayDivider label={day.label} />
          {day.runs.map((run, ri) => (
            <div key={`${day.date}-${ri}`} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.inkMuted, margin: '0 0 4px 12px' }}>{run.learnerName || S.inboxFromSchool}</div>
              {run.items.map((item, i) => (
                <Bubble
                  key={item.id}
                  id={`msg-${item.id}`}
                  first={i === 0}
                  last={i === run.items.length - 1}
                  unread={unreadAtOpen.current?.has(item.id)}
                  title={item.type === 'attendance' ? (KIND[item.kind] || S.inboxNewEvent) : item.title}
                  body={item.type === 'attendance' ? null : item.body}
                  time={formatScanTime(item.time)}
                  onClick={item.type === 'attendance' ? () => open(item) : undefined}
                />
              ))}
            </div>
          ))}
        </div>
      ))}
      <div ref={endRef} />
    </>
  );
}
```

- [ ] **Step 3: Tests, build, and size budget**

Run (from `parent/`):

```bash
npm test
npm run build
npm run size
```

Expected: tests PASS (5 files); build ends with `✓ built`; size prints `initial-load total: … KB gz (limit 260 KB)` with a total ≤ 260.

- [ ] **Step 4: Check it in the browser**

Run (from `parent/`): `npm run dev` and open `http://localhost:5174`. `localhost` is already in the reCAPTCHA key's domain list and Firebase Auth's authorized domains, so this runs against production data. Sign in with email as a guardian who has at least one linked learner and at least one inbox item (the test account `jitsban18@gmail.com` has two as of 2026-09-23).

Verify:
- Day dividers read "Yesterday" / "Today" / "Mon 21 Sep" style labels, oldest day at the top.
- The page opens scrolled to the bottom (newest message).
- Consecutive messages for the same learner share one name header; only the first bubble in a group has a round top-left corner and only the last a round bottom-left corner.
- Tapping an Entered/Left bubble goes to `/learner/<id>?event=<eventId>`.
- Opening `http://localhost:5174/inbox?item=<an inbox id>` still jumps to that learner's History.
- Reloading the Inbox a second time shows no unread highlighting (items were marked read on the first view).

Stop the dev server (Ctrl+C).

- [ ] **Step 5: Commit**

```bash
git add parent/src/components/Bubble.jsx parent/src/screens/Inbox.jsx
git commit -m "feat(parent): text-message style inbox with stacked runs per learner

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: History day cards with stacked scans

**Files:**
- Modify: `parent/src/screens/History.jsx` (full rewrite shown below; `EventRow` is removed — `grep -rn EventRow parent/src` confirms nothing else imports it)

**Interfaces:**
- Consumes: `stackDay(events)` and `dayLabel(date, todayDate)` from Task 1; `Bubble` from Task 2; `groupByDate`, `eventTitle` from `lib/format.js`; `route.query.event` set by the Inbox (Task 2).
- Produces: each scan's bubble has DOM id `ev-<eventId>` (the scroll target), and the day card containing `route.query.event` is outlined.

- [ ] **Step 1: Rewrite the History screen**

Replace the entire contents of `parent/src/screens/History.jsx` with:

```jsx
import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, startAfter, getDocs } from 'firebase/firestore';
import { db } from '../firebase.js';
import S from '../strings.js';
import { T } from '../styles.js';
import { Btn, Card, Banner, Spinner, EmptyState } from '../components/ui.jsx';
import { Bubble } from '../components/Bubble.jsx';
import { useDoc } from '../hooks/useDoc.js';
import { groupByDate, eventTitle } from '../lib/format.js';
import { stackDay, dayLabel } from '../lib/thread.js';
import { formatScanTime, localDate } from '../../../shared/dates.js';

const PAGE = 30;

function eventMeta(ev) {
  const voided = ev.status === 'voided';
  return `${ev.deviceLabel || ''}${ev.delayedSync ? ` · ${S.eventLate}` : ''}${ev.source === 'staff' && !voided ? ` · ${S.eventManual}` : ''}`
    + `${voided ? ` · ${S.eventVoided}${ev.voidReason ? `: ${ev.voidReason}` : ''}` : ''}`;
}

export default function History({ studentId, navigate, route }) {
  const { data: learner, error } = useDoc(`learners/${studentId}`);
  const [rows, setRows] = useState([]); const [last, setLast] = useState(null); const [more, setMore] = useState(true); const [busy, setBusy] = useState(false);

  const load = async (cursor) => {
    setBusy(true);
    const base = [collection(db, `learners/${studentId}/events`), orderBy('effectiveAt', 'desc'), limit(PAGE)];
    const q = cursor ? query(...base, startAfter(cursor)) : query(...base);
    const snap = await getDocs(q);
    setRows((r) => (cursor ? [...r, ...snap.docs.map((d) => ({ id: d.id, ...d.data() }))] : snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    setLast(snap.docs[snap.docs.length - 1] || null); setMore(snap.size === PAGE); setBusy(false);
  };
  useEffect(() => { load(null).catch(() => setMore(false)); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [studentId, learner?.updatedAt?.seconds]);
  useEffect(() => { const id = route.query.event; if (id) document.getElementById(`ev-${id}`)?.scrollIntoView({ block: 'center' }); }, [rows, route.query.event]);

  if (error === 'permission-denied') return <Banner tone="warn">{S.accessEnded}</Banner>;
  if (learner === undefined) return <Spinner label={S.loading} />;
  const today = localDate();
  return (
    <>
      <h1 style={{ fontSize: 20, margin: '4px 0 0' }}>{learner?.displayName}</h1>
      <div style={{ color: T.inkMuted, fontSize: 13, marginBottom: 12 }}>{learner?.sectionLabel} · {S.historyTitle}</div>
      {rows.length === 0 && !busy && <EmptyState title={S.historyEmpty} />}
      {groupByDate(rows).map((g) => {
        const target = g.items.some((ev) => ev.id === route.query.event);
        const stack = stackDay(g.items);
        return (
          <Card key={g.date} style={target ? { border: `1.5px solid ${T.primary}` } : undefined}>
            <div style={{ fontWeight: 700, fontSize: 13, color: T.inkMuted, marginBottom: 8 }}>{dayLabel(g.date, today)}</div>
            {stack.map((ev, i) => {
              const voided = ev.status === 'voided';
              return (
                <Bubble
                  key={ev.id}
                  id={`ev-${ev.id}`}
                  first={i === 0}
                  last={i === stack.length - 1}
                  highlight={route.query.event === ev.id}
                  struck={voided}
                  title={eventTitle(ev)}
                  time={formatScanTime(ev.scannedTime)}
                  meta={eventMeta(ev)}
                >
                  {!voided && (
                    <button type="button" onClick={() => navigate(`/report/${ev.id}?student=${studentId}`)}
                      style={{ background: 'none', border: 'none', color: T.primary, padding: '4px 0 0', minHeight: 32, fontFamily: T.font, fontSize: 13, cursor: 'pointer' }}>
                      {S.reportThis}
                    </button>
                  )}
                </Bubble>
              );
            })}
          </Card>
        );
      })}
      {more && <Btn variant="ghost" disabled={busy} onClick={() => load(last)} style={{ width: '100%' }}>{S.historyLoadMore}</Btn>}
    </>
  );
}
```

- [ ] **Step 2: Tests, build, and size budget**

Run (from `parent/`):

```bash
npm test
npm run build
npm run size
```

Expected: tests PASS (5 files); build ends with `✓ built`; size total ≤ 260 KB gz.

- [ ] **Step 3: Check it in the browser**

Run (from `parent/`): `npm run dev`, open `http://localhost:5174`, sign in as the same guardian as Task 2.

Verify:
- Home → "View history": each day is a card titled "Today" / "Yesterday" / "Mon 21 Sep", newest day first.
- Inside a card, "Entered school" sits above "Left school" (time order), stacked with only the outer corners rounded.
- Each bubble shows the device label line (e.g. "School gate") and a "Report this record" link that opens `/report/<eventId>?student=<id>`.
- Inbox → tap a bubble: History opens with that day's card outlined and the tapped scan's bubble highlighted and scrolled into view.
- A voided scan (if any exist) shows its title and time struck through and has no report link.

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add parent/src/screens/History.jsx
git commit -m "feat(parent): history day cards with stacked entered/left bubbles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Ship to production and verify on a phone

**Files:** none changed.

- [ ] **Step 1: Final full check**

Run (from `parent/`):

```bash
npm test
npm run build
npm run size
```

Expected: all PASS, size ≤ 260 KB gz.

- [ ] **Step 2: Deploy the parent site**

Run (from the repo root):

```bash
npx firebase deploy --only hosting:parent --project bnhs-sims
```

Expected: `Deploy complete!` and `Hosting URL: https://bnhs-parent.web.app`. This network sometimes drops requests with `ECONNRESET` / `Failed to make request`; if so, re-run the same command.

- [ ] **Step 3: Verify on a phone**

On a phone, open `https://bnhs-parent.web.app` and pull to reload (the site sends `Cache-Control: no-store` for `index.html`, so a reload picks up the new build). Repeat the checks from Task 2 Step 4 and Task 3 Step 3. On iPhone, also check it from the installed Home Screen app ("BukNHS SMARTA").

- [ ] **Step 4: Push the branch**

```bash
git push -u origin HEAD
```

---

## Known limits (intentional, not tasks)

- The Inbox shows the 30 most recent items (existing query). With two learners that's about a week of scans; the full record is always in History, which pages 30 at a time with "Load more".
- Opening the Inbox marks every loaded item read, which is the chat convention. The old behavior only marked an item read when tapped.
