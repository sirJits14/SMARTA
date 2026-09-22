# Parent / Guardian Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the parent/guardian portal described in
[docs/superpowers/specs/2026-09-21-parent-guardian-portal-design.md](../specs/2026-09-21-parent-guardian-portal-design.md):
a trusted, append-only kiosk scan log projected by Cloud Functions into
parent-safe per-learner documents, activation-slip guardian linking, FCM push
with an authoritative in-app inbox, least-privilege rules, and a staged
rollout.

**Architecture:** The kiosk gets a per-device Firebase account and writes an
immutable `scan_events` document alongside its existing attendance merge.
A Firestore-triggered Cloud Function is the only writer of parent-facing data
(`learners/*`, `guardians/*/inbox/*`) and sends a fixed, content-free push.
A separate Vite app in `parent/` (second Hosting site, same project) renders
only link-gated documents; all guardian *actions* are callables.

**Tech Stack:** React 19, Vite 8, Vitest 4, Firebase JS SDK 12 (web apps),
`firebase-functions` v6 (2nd gen, Node 20, ESM), `firebase-admin` v13,
`@firebase/rules-unit-testing` v4, Firebase Emulator Suite, reCAPTCHA v3
App Check, FCM Web Push (VAPID).

## Global Constraints

- Firebase project `bnhs-sims` on **Blaze**; Functions region
  **`asia-southeast1`**; `minInstances: 0`; reCAPTCHA **v3** (never
  Enterprise); no Identity Platform upgrade; no phone auth.
- Rules: no rule may accept `request.auth != null` alone. Identities are
  `isStaff()`, `isKiosk()`, `isGuardian()` exactly as in spec §8.
- Every parent list query must carry `limit ≤ 50`; rules enforce this.
- Push body is exactly
  `"BNHS recorded a new attendance event. Tap to view securely."` with title
  `"BNHS Learner Records"`; payload never contains learner name, time, or
  kind.
- Parent-app strings live only in `parent/src/strings.js`; none may contain
  "location", "tracking", or "live". Gate label text is "gate scan", never
  "attendance".
- Parent app **initial-load** bundle (the entry chunk(s) `index.html` eagerly
  loads, not the sum of every lazily-`import()`ed route chunk) ≤ **260 KB
  gzipped** (CI-enforced; revised up from an initial 200 KB estimate once
  Task 16 measured the real cost of React 19 + Firestore-with-persistence +
  Auth + App Check + Functions — see that task's report). Layout works at
  320 px.
- `parent/` and `functions/` import nothing from `src/`. Shared pure helpers
  live in `shared/`.
- Retention windows, rate limits, and thresholds are the spec's numbers:
  activate 5/h, report 5/day, access requests 3 open, issue codes 20/day;
  codes expire 90 days, `maxRedemptions: 2`; devices pruned at 60 days
  stale / 7 days disabled; push TTL 14400 s; suppression 10 min; delayed
  sync > 2 h; clock skew > 5 min future or > 24 h past.
- Commit messages end with
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Kiosk changes are made in the sibling repository
  `C:\Users\jitsb\OneDrive - Department of Education\Desktop\APPS\bnhs-student-kiosk`
  (Phase 1, Task 4 only). Everything else is in this repository.
- Nothing in this plan deploys to production. Deployment is a manual,
  staged activity described in Phase 6 with explicit gates.

---

## File structure

**New in `bnhs-sims`:**

```
shared/
  dates.js                      pure date/time helpers shared by parent + functions
  dates.test.js
functions/
  package.json                  ESM, Node 20
  index.js                      wires handlers to firebase-functions v2 exports
  src/admin.js                  admin SDK singletons (db, messaging, auth)
  src/log.js                    structured log helper
  src/cache.js                  30-second in-instance cache
  src/callable.js               shared callable guards (App Check, guardian, staff, rate limit)
  src/lib/classifyEvent.js      delayedSync / clockSkew
  src/lib/recomputeSummary.js   learners/{id}.today + recent
  src/lib/shouldPush.js         push gates
  src/lib/pushPayload.js        fixed FCM payload
  src/lib/activationCode.js     code alphabet, normalize, hash
  src/lib/rateLimit.js          window math
  src/lib/validators.js         input validators
  src/lib/retention.js          retention cut-off dates
  src/handlers/scanEvent.js     onScanEventCreated logic
  src/handlers/push.js          sendToGuardian
  src/handlers/codes.js         issueActivationCodes, revokeCode, activateCode
  src/handlers/links.js         requestAccess, resolveAccessRequest, revokeLink
  src/handlers/reports.js       submitReport, resolveReport, correctEvent, addManualEvent
  src/handlers/kiosks.js        registerKiosk, deactivateKiosk
  src/handlers/account.js       deleteGuardianAccount
  src/handlers/scheduled.js     expireLinks, pruneDevices(+expireInbox), reconcileEvents
  src/handlers/settingsAudit.js onParentPortalSettingsChanged
  src/lib/*.test.js             unit tests (no emulator)
  test/emulator/*.test.js       emulator-backed handler tests
  test/emulator/helpers.js
tests/rules/
  helpers.js                    rules test environment + identities
  existing.test.js              students/enrollments/…/student_attendance/kiosks
  scanEvents.test.js
  parent.test.js                learners/guardians/inbox/devices/links/requests/reports/audit
vitest.rules.config.js
firestore.indexes.json
parent/
  package.json, vite.config.js, index.html, .env.example
  public/manifest.webmanifest
  public/firebase-messaging-sw.js
  public/icons/icon-192.png, icon-512.png
  src/main.jsx, App.jsx, firebase.js, strings.js, styles.js
  src/lib/router.js (+test), format.js (+test), notificationState.js (+test), strings.test.js
  src/lib/notifications.js      token registration
  src/hooks/useAuth.js, useDoc.js, useLinks.js
  src/components/Shell.jsx, ui.jsx
  src/screens/SignIn.jsx, Verify.jsx, Consent.jsx, Activate.jsx, Home.jsx,
              History.jsx, Inbox.jsx, Report.jsx, RequestAccess.jsx, Settings.jsx
src/pages/GuardiansPage.jsx     SIMS Guardians area (tabs)
src/pages/guardians/DevicesTab.jsx, CodesTab.jsx, RequestsTab.jsx, ReportsTab.jsx,
                    LinksTab.jsx, ScanLogTab.jsx, AuditTab.jsx, PortalSettingsTab.jsx
src/components/ActivationSlipsPrintable.jsx
src/data/guardians.js           callable wrappers + parent_portal settings write
.github/workflows/ci.yml
docs/parent-portal-runbook.md
docs/parent-portal-privacy-notice.md
docs/parent-portal-adviser-guide.md
docs/parent-portal-rollout-checklist.md
```

**Modified in `bnhs-sims`:** `firebase.json`, `.firebaserc`, `firestore.rules`,
`package.json`, `vite.config.js`, `.gitignore`, `.env.example`,
`src/firebase.js`, `src/App.jsx`, `src/components/Shell.jsx`, `README.md`.

**Modified in `bnhs-student-kiosk`:** `src/firebase.js`,
`src/data/attendance.js`, `src/App.jsx`, `src/components/ConfirmScreen.jsx`,
`.env.example`, `README.md`; new `src/lib/scanEvent.js` (+test),
`src/components/SetupScreen.jsx`, `src/components/NotAuthorizedScreen.jsx`.

**Phases** (each phase leaves working, testable software):

| Phase | Tasks | Outcome |
|---|---|---|
| 0 Foundation | 1–2 | `shared/`, emulator config, scaffolds build |
| 1 Kiosk identity + raw log | 3–4 | New rules pass tests; kiosk writes `scan_events` under a device account |
| 2 Event pipeline | 5–7 | Function projects events, fans out inbox, sends (stubbed) push; parent-side rules tested |
| 3 Guardian actions | 8–12 | All callables and scheduled jobs |
| 4 Parent portal | 13–16 | Installable PWA on the emulator |
| 5 SIMS Guardians area | 17–19 | Registrar can run the programme |
| 6 Ops and rollout | 20–21 | CI, docs, monitoring, staged rollout with gates |

---

## Phase 0 — Foundation

### Task 1: `shared/` date helpers

**Files:**
- Create: `shared/dates.js`
- Create: `shared/dates.test.js`
- Modify: `vite.config.js` (root Vitest include/exclude)

**Interfaces:**
- Produces: `pad2(n)`, `localDate(d)`, `localTime(d)`, `currentSchoolYear(date)`,
  `previousSchoolYear(sy)`, `schoolYearStartDate(sy)` → `'YYYY-06-01'`,
  `manilaDate(date)` → `'YYYY-MM-DD'`, `manilaTime(date)` → `'HH:MM'`,
  `formatScanTime(hhmm)` → `'07:12 AM'`, `formatDateLabel(yyyymmdd)` → `'Mon 21 Sep'`,
  `compactStamp(date)` → `'YYYYMMDDHHMM'` (local clock).

- [ ] **Step 1: Write the failing tests**

```js
// shared/dates.test.js
import { describe, it, expect } from 'vitest';
import {
  pad2, localDate, localTime, currentSchoolYear, previousSchoolYear,
  schoolYearStartDate, manilaDate, manilaTime, formatScanTime, formatDateLabel, compactStamp,
} from './dates.js';

describe('shared/dates', () => {
  it('pads', () => { expect(pad2(7)).toBe('07'); expect(pad2(12)).toBe('12'); });

  it('localDate / localTime use the local clock', () => {
    const d = new Date(2026, 8, 21, 7, 5);
    expect(localDate(d)).toBe('2026-09-21');
    expect(localTime(d)).toBe('07:05');
    expect(compactStamp(d)).toBe('202609210705');
  });

  it('school year runs June to March', () => {
    expect(currentSchoolYear(new Date(2026, 5, 1))).toBe('2026-2027');
    expect(currentSchoolYear(new Date(2027, 2, 31))).toBe('2026-2027');
    expect(previousSchoolYear('2026-2027')).toBe('2025-2026');
    expect(schoolYearStartDate('2026-2027')).toBe('2026-06-01');
  });

  it('manila helpers ignore the process timezone', () => {
    const utc = new Date(Date.UTC(2026, 8, 20, 23, 12)); // 07:12 Manila next day
    expect(manilaDate(utc)).toBe('2026-09-21');
    expect(manilaTime(utc)).toBe('07:12');
  });

  it('formats times and dates for parents', () => {
    expect(formatScanTime('07:12')).toBe('07:12 AM');
    expect(formatScanTime('16:05')).toBe('04:05 PM');
    expect(formatScanTime('')).toBe('—');
    expect(formatDateLabel('2026-09-21')).toBe('Mon 21 Sep');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run shared/dates.test.js`
Expected: FAIL — `Failed to resolve import "./dates.js"`.

- [ ] **Step 3: Implement**

```js
// shared/dates.js
// Pure date helpers shared by parent/ and functions/. The SIMS keeps its own
// src/lib/dates.js and the kiosk keeps its own copy; nothing here imports
// from either app.
export const pad2 = (n) => String(n).padStart(2, '0');

export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const localTime = (d = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

export const compactStamp = (d = new Date()) =>
  `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}${pad2(d.getHours())}${pad2(d.getMinutes())}`;

// DepEd school year runs June→March. June or later ⇒ current year starts the SY.
export function currentSchoolYear(date = new Date()) {
  const y = date.getFullYear();
  const start = date.getMonth() >= 5 ? y : y - 1;
  return `${start}-${start + 1}`;
}

export function previousSchoolYear(sy) {
  const [start] = sy.split('-').map(Number);
  return `${start - 1}-${start}`;
}

export function schoolYearStartDate(sy) {
  const [start] = sy.split('-').map(Number);
  return `${start}-06-01`;
}

const manilaParts = (date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') === '24' ? '00' : get('hour'), min: get('minute') };
};

export const manilaDate = (date = new Date()) => { const p = manilaParts(date); return `${p.y}-${p.m}-${p.d}`; };
export const manilaTime = (date = new Date()) => { const p = manilaParts(date); return `${p.h}:${p.min}`; };

export function formatScanTime(hhmm) {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 || 12;
  return `${pad2(h12)}:${pad2(m)} ${h >= 12 ? 'PM' : 'AM'}`;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatDateLabel(yyyymmdd) {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${DOW[date.getDay()]} ${d} ${MON[m - 1]}`;
}
```

- [ ] **Step 4: Scope the root Vitest run**

Replace `vite.config.js`:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'shared/**/*.test.js'],
    exclude: ['node_modules/**', 'parent/**', 'functions/**', 'tests/**', '.claude/**', 'dist/**'],
  },
});
```

- [ ] **Step 5: Run all root tests**

Run: `npm test`
Expected: PASS, including the 5 new `shared/dates` tests and all existing tests.

- [ ] **Step 6: Commit**

```bash
git add shared/ vite.config.js
git commit -m "feat: add shared date helpers for parent portal and functions

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Project scaffolds, emulator config, hosting targets

**Files:**
- Modify: `firebase.json`, `.firebaserc`, `package.json`, `.gitignore`, `.env.example`
- Create: `firestore.indexes.json`
- Create: `functions/package.json`, `functions/index.js`, `functions/src/admin.js`, `functions/src/log.js`, `functions/src/cache.js`, `functions/.gitignore`
- Create: `parent/package.json`, `parent/vite.config.js`, `parent/index.html`, `parent/src/main.jsx`, `parent/.env.example`

**Interfaces:**
- Produces: `functions/src/admin.js` exports `db`, `messaging`, `auth`, `FieldValue`, `Timestamp`;
  `functions/src/log.js` exports `logEvent(name, fields)`;
  `functions/src/cache.js` exports `cached(key, ttlMs, loader)`.

- [ ] **Step 1: Hosting targets, emulators, functions, indexes**

Replace `firebase.json`:

```json
{
  "hosting": [
    {
      "target": "sims",
      "public": "dist",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [{ "source": "**", "destination": "/index.html" }]
    },
    {
      "target": "parent",
      "public": "parent/dist",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [{ "source": "**", "destination": "/index.html" }],
      "headers": [
        { "source": "/index.html", "headers": [
          { "key": "Cache-Control", "value": "no-store" },
          { "key": "X-Frame-Options", "value": "DENY" },
          { "key": "Referrer-Policy", "value": "no-referrer" },
          { "key": "Permissions-Policy", "value": "geolocation=(), camera=(), microphone=()" }
        ] },
        { "source": "/firebase-messaging-sw.js", "headers": [
          { "key": "Cache-Control", "value": "no-store" },
          { "key": "Service-Worker-Allowed", "value": "/" }
        ] },
        { "source": "/assets/**", "headers": [
          { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
        ] }
      ]
    }
  ],
  "firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
  "functions": [{ "source": "functions", "codebase": "default", "runtime": "nodejs20", "predeploy": ["node scripts/syncShared.mjs"] }],
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "functions": { "port": 5001 },
    "hosting": { "port": 5000 },
    "pubsub": { "port": 8085 },
    "ui": { "enabled": true, "port": 4000 },
    "singleProjectMode": false
  }
}
```

Replace `.firebaserc`:

```json
{
  "projects": { "default": "bnhs-sims" },
  "targets": {
    "bnhs-sims": {
      "hosting": {
        "sims": ["bnhs-sims"],
        "parent": ["bnhs-parent"]
      }
    }
  }
}
```

Create `firestore.indexes.json`:

```json
{
  "indexes": [
    { "collectionGroup": "guardian_links", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "studentId", "order": "ASCENDING" }, { "fieldPath": "status", "order": "ASCENDING" } ] },
    { "collectionGroup": "guardian_links", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "guardianUid", "order": "ASCENDING" }, { "fieldPath": "status", "order": "ASCENDING" } ] },
    { "collectionGroup": "scan_events", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "scannedDate", "order": "ASCENDING" }, { "fieldPath": "deviceId", "order": "ASCENDING" } ] },
    { "collectionGroup": "reports", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "status", "order": "ASCENDING" }, { "fieldPath": "createdAt", "order": "DESCENDING" } ] },
    { "collectionGroup": "reports", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "guardianUid", "order": "ASCENDING" }, { "fieldPath": "createdAt", "order": "DESCENDING" } ] },
    { "collectionGroup": "access_requests", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "status", "order": "ASCENDING" }, { "fieldPath": "createdAt", "order": "DESCENDING" } ] },
    { "collectionGroup": "access_requests", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "guardianUid", "order": "ASCENDING" }, { "fieldPath": "status", "order": "ASCENDING" } ] },
    { "collectionGroup": "activation_codes", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "studentId", "order": "ASCENDING" }, { "fieldPath": "schoolYear", "order": "ASCENDING" } ] },
    { "collectionGroup": "guardian_links", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "status", "order": "ASCENDING" }, { "fieldPath": "revokedAt", "order": "ASCENDING" } ] },
    { "collectionGroup": "guardian_links", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "status", "order": "ASCENDING" }, { "fieldPath": "expiredAt", "order": "ASCENDING" } ] },
    { "collectionGroup": "reports", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "status", "order": "ASCENDING" }, { "fieldPath": "resolvedAt", "order": "ASCENDING" } ] },
    { "collectionGroup": "access_requests", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "status", "order": "ASCENDING" }, { "fieldPath": "resolvedAt", "order": "ASCENDING" } ] },
    { "collectionGroup": "enrollments", "queryScope": "COLLECTION", "fields": [
      { "fieldPath": "sectionId", "order": "ASCENDING" }, { "fieldPath": "schoolYear", "order": "ASCENDING" }, { "fieldPath": "status", "order": "ASCENDING" } ] }
  ],
  "fieldOverrides": [
    { "collectionGroup": "devices", "fieldPath": "refreshedAt", "indexes": [
      { "order": "ASCENDING", "queryScope": "COLLECTION_GROUP" } ] },
    { "collectionGroup": "devices", "fieldPath": "disabledAt", "indexes": [
      { "order": "ASCENDING", "queryScope": "COLLECTION_GROUP" } ] },
    { "collectionGroup": "inbox", "fieldPath": "createdAt", "indexes": [
      { "order": "ASCENDING", "queryScope": "COLLECTION_GROUP" } ] },
    { "collectionGroup": "events", "fieldPath": "scannedDate", "indexes": [
      { "order": "ASCENDING", "queryScope": "COLLECTION_GROUP" } ] }
  ]
}
```

- [ ] **Step 2: Root package scripts and dev dependencies**

Edit `package.json` `scripts` and `devDependencies`:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "test:rules": "firebase emulators:exec --only firestore \"vitest run -c vitest.rules.config.js\"",
  "test:functions": "firebase emulators:exec --only firestore,auth \"npm --prefix functions run test:emulator\"",
  "test:all": "npm test && npm --prefix functions test && npm --prefix parent test && npm run test:rules && npm run test:functions",
  "emulators": "firebase emulators:start --import=./.emulator-data --export-on-exit",
  "deploy": "npm run build && firebase deploy --only hosting:sims"
},
"devDependencies": {
  "@firebase/rules-unit-testing": "^5.0.2",
  "@vitejs/plugin-react": "^6.0.1",
  "firebase-tools": "^14.0.0",
  "vite": "^8.0.12",
  "vitest": "^4.1.10"
}
```

Append to `.gitignore`:

```
.emulator-data/
firebase-debug.log
firestore-debug.log
ui-debug.log
pubsub-debug.log
functions/node_modules
parent/node_modules
parent/dist
parent/.env
parent/.env.local
```

Append to `.env.example`:

```
VITE_RECAPTCHA_SITE_KEY=
VITE_APPCHECK_DEBUG_TOKEN=
VITE_USE_EMULATORS=
```

- [ ] **Step 3: Functions scaffold**

`functions/package.json`:

```json
{
  "name": "bnhs-sims-functions",
  "private": true,
  "type": "module",
  "main": "index.js",
  "engines": { "node": "20" },
  "scripts": {
    "pretest": "node ../scripts/syncShared.mjs",
    "test": "vitest run src",
    "pretest:emulator": "node ../scripts/syncShared.mjs",
    "test:emulator": "vitest run test/emulator --no-file-parallelism",
    "serve": "node ../scripts/syncShared.mjs && firebase emulators:start --only functions,firestore,auth,pubsub"
  },
  "dependencies": {
    "firebase-admin": "^13.0.0",
    "firebase-functions": "^6.0.0"
  },
  "devDependencies": {
    "vitest": "^4.1.10"
  }
}
```

`functions/.gitignore`:

```
node_modules
*.log
shared/
```

`scripts/syncShared.mjs` (repo root; `firebase deploy` uploads only
`functions/`, so the shared helpers are copied in before tests and deploys
rather than imported across the boundary):

```js
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'functions', 'shared');
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(join(root, 'shared'), dest, { recursive: true, filter: (p) => !p.endsWith('.test.js') });
console.log('synced shared/ → functions/shared/');
```

Functions code imports these as `../../shared/dates.js` (from
`functions/src/handlers/*` or `functions/src/lib/*`). The parent app imports
`../../../shared/dates.js` directly; Vite bundles it, so no copy is needed
there.

`functions/src/admin.js`:

```js
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) initializeApp();

export const db = getFirestore();
export const messaging = getMessaging();
export const auth = getAuth();
export { FieldValue, Timestamp };
```

`functions/src/log.js`:

```js
import { logger } from 'firebase-functions';

// One structured line per outcome. Logs-based metrics (Phase 6) filter on
// jsonPayload.event, so the name is the contract — keep names stable.
export function logEvent(event, fields = {}) {
  logger.info(event, { event, ...fields });
}
export function logWarn(event, fields = {}) {
  logger.warn(event, { event, ...fields });
}
```

`functions/src/cache.js`:

```js
// Per-instance memoization with a TTL. Saves a Firestore read of hot
// documents (settings/parent_portal, kiosks/{id}) on every event during the
// 7 a.m. surge. Instances are recycled, so staleness is bounded by ttlMs.
const store = new Map();

export async function cached(key, ttlMs, loader, nowMs = Date.now()) {
  const hit = store.get(key);
  if (hit && nowMs - hit.at < ttlMs) return hit.value;
  const value = await loader();
  store.set(key, { at: nowMs, value });
  return value;
}

export function clearCache() { store.clear(); }
```

`functions/index.js` (filled in later tasks; must load now):

```js
// Function exports are added per task. Keeping this file free of logic
// makes cold starts cheap and lets handlers be tested without the
// firebase-functions runtime.
export {};
```

- [ ] **Step 4: Parent app scaffold**

`parent/package.json`:

```json
{
  "name": "bnhs-parent",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "size": "node scripts/checkSize.mjs"
  },
  "dependencies": {
    "firebase": "^12.14.0",
    "react": "^19.2.6",
    "react-dom": "^19.2.6"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^6.0.1",
    "vite": "^8.0.12",
    "vitest": "^4.1.10"
  }
}
```

`parent/vite.config.js`:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  build: { target: 'es2020', sourcemap: false },
  test: { environment: 'node', include: ['src/**/*.test.js'] },
});
```

`parent/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#5B4FE8" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/icons/icon-192.png" />
    <title>BNHS Learner Records</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

`parent/src/main.jsx` (placeholder App replaced in Task 13):

```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
createRoot(document.getElementById('root')).render(<StrictMode><p>BNHS Learner Records</p></StrictMode>);
```

`parent/.env.example`:

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_VAPID_KEY=
VITE_RECAPTCHA_SITE_KEY=
VITE_APPCHECK_DEBUG_TOKEN=
VITE_USE_EMULATORS=
VITE_FUNCTIONS_REGION=asia-southeast1
```

- [ ] **Step 5: Install and verify everything boots**

Run:
```bash
npm install && npm --prefix functions install && npm --prefix parent install
npm run build && npm --prefix parent run build
npx firebase emulators:exec --only firestore,auth,functions "echo emulators-ok"
```
Expected: both builds succeed; the last command prints `emulators-ok` and
exits 0 (Functions emulator loads `functions/index.js` with zero functions).

- [ ] **Step 6: Commit**

```bash
git add firebase.json .firebaserc firestore.indexes.json package.json package-lock.json .gitignore .env.example scripts/ functions/ parent/
git commit -m "chore: scaffold functions, parent app, emulators, hosting targets, indexes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Phase 1 — Kiosk identity and the raw scan log

### Task 3: Firestore rules v2 with kiosk/staff rules tests

**Files:**
- Modify: `firestore.rules` (full replacement)
- Create: `vitest.rules.config.js`, `tests/rules/helpers.js`, `tests/rules/existing.test.js`, `tests/rules/scanEvents.test.js`

**Interfaces:**
- Produces: the complete rules policy from spec §8 (parent-side rules are tested in Task 7);
  `tests/rules/helpers.js` exports `setup()`, `seed(env, fn)`, identities `STAFF`, `KIOSK`, `KIOSK_INACTIVE`, `GUARDIAN_A`, `GUARDIAN_B`, `GUARDIAN_UNVERIFIED`, `ANON`, and `ok`/`denied` assertion helpers.

**Note on deployment:** this task only makes the rules pass tests. The rules
are deployed in Phase 6 after kiosks have device accounts (spec §12).

- [ ] **Step 1: Rules test config and helpers**

`vitest.rules.config.js`:

```js
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'node', include: ['tests/rules/**/*.test.js'], fileParallelism: false, testTimeout: 20000 },
});
```

`tests/rules/helpers.js`:

```js
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';

const password = { sign_in_provider: 'password' };
export const STAFF = { uid: 'staff1', token: { email: 'registrar@bnhs.edu', email_verified: true, firebase: password } };
export const KIOSK = { uid: 'kiosk1', token: { email: 'kiosk-gate1@bnhs.edu', email_verified: true, firebase: password } };
export const KIOSK_INACTIVE = { uid: 'kiosk9', token: { email: 'kiosk-old@bnhs.edu', email_verified: true, firebase: password } };
export const GUARDIAN_A = { uid: 'gA', token: { email: 'a@gmail.com', email_verified: true, firebase: { sign_in_provider: 'google.com' } } };
export const GUARDIAN_B = { uid: 'gB', token: { email: 'b@gmail.com', email_verified: true, firebase: password } };
export const GUARDIAN_UNVERIFIED = { uid: 'gU', token: { email: 'u@gmail.com', email_verified: false, firebase: password } };
export const ANON = { uid: 'anon1', token: { firebase: { sign_in_provider: 'anonymous' } } };

export async function setup() {
  const env = await initializeTestEnvironment({
    projectId: 'bnhs-sims-rules-test',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
  await env.clearFirestore();
  return env;
}

export const seed = (env, fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
export const as = (env, who) => env.authenticatedContext(who.uid, who.token).firestore();
export const anon = (env) => env.unauthenticatedContext().firestore();
export const ok = assertSucceeds;
export const denied = assertFails;

// Baseline documents every rules test can rely on.
export async function seedBaseline(env) {
  await seed(env, async (db) => {
    await db.doc('users/registrar@bnhs.edu').set({ name: 'Registrar', role: 'registrar' });
    await db.doc('kiosks/kiosk1').set({ label: 'Main Gate', active: true });
    await db.doc('kiosks/kiosk9').set({ label: 'Old Gate', active: false });
    await db.doc('settings/app').set({ currentSchoolYear: '2026-2027' });
    await db.doc('settings/parent_portal').set({ notificationsPaused: false, consentVersion: 1 });
    await db.doc('students/S1').set({ lrn: '100000000001', firstName: 'Ana', lastName: 'Cruz' });
    await db.doc('students/S2').set({ lrn: '100000000002', firstName: 'Ben', lastName: 'Dy' });
    await db.doc('sections/SEC1').set({ name: 'Rizal', gradeLevel: 7, schoolYear: '2026-2027' });
    await db.doc('enrollments/S1_2026-2027').set({ studentId: 'S1', sectionId: 'SEC1', schoolYear: '2026-2027', status: 'enrolled' });
    await db.doc('guardian_links/gA_S1').set({ guardianUid: 'gA', studentId: 'S1', status: 'active', schoolYear: '2026-2027' });
    await db.doc('guardian_links/gB_S1').set({ guardianUid: 'gB', studentId: 'S1', status: 'revoked', schoolYear: '2026-2027' });
    await db.doc('learners/S1').set({ displayName: 'Ana Cruz', sectionLabel: 'Grade 7 – Rizal', today: { date: '2026-09-21', status: 'no_scan' }, recent: [] });
    await db.doc('learners/S2').set({ displayName: 'Ben Dy', sectionLabel: 'Grade 7 – Rizal', today: { date: '2026-09-21', status: 'no_scan' }, recent: [] });
    await db.doc('learners/S1/events/e1').set({ kind: 'in', scannedDate: '2026-09-21', scannedTime: '07:12', status: 'recorded', effectiveAt: new Date() });
    await db.doc('guardians/gA').set({ email: 'a@gmail.com', notificationsEnabled: true, consentVersion: 1 });
    await db.doc('guardians/gA/inbox/e1').set({ type: 'attendance', createdAt: new Date(), pushStatus: 'sent' });
    await db.doc('guardians/gB').set({ email: 'b@gmail.com', notificationsEnabled: true, consentVersion: 1 });
  });
}
```

- [ ] **Step 2: Write the failing tests for existing collections and kiosks**

`tests/rules/existing.test.js`:

```js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { setup, seedBaseline, as, anon, ok, denied, STAFF, KIOSK, KIOSK_INACTIVE, GUARDIAN_A, ANON } from './helpers.js';

let env;
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedBaseline(env); });

describe('roster collections', () => {
  for (const col of ['students', 'enrollments', 'sections']) {
    it(`${col}: staff and active kiosk read; anonymous, guardian, inactive kiosk denied`, async () => {
      await ok(as(env, STAFF).collection(col).get());
      await ok(as(env, KIOSK).collection(col).get());
      await denied(as(env, ANON).collection(col).get());
      await denied(anon(env).collection(col).get());
      await denied(as(env, GUARDIAN_A).collection(col).get());
      await denied(as(env, KIOSK_INACTIVE).collection(col).get());
    });
  }
  it('only staff write students', async () => {
    await ok(as(env, STAFF).doc('students/S3').set({ lrn: '100000000003' }));
    await denied(as(env, KIOSK).doc('students/S3').set({ lrn: '100000000003' }));
  });
});

describe('settings', () => {
  it('settings/app readable by staff and kiosk only', async () => {
    await ok(as(env, KIOSK).doc('settings/app').get());
    await denied(as(env, GUARDIAN_A).doc('settings/app').get());
  });
  it('settings/parent_portal readable by any non-anonymous user, writable by staff', async () => {
    await ok(as(env, GUARDIAN_A).doc('settings/parent_portal').get());
    await ok(as(env, KIOSK).doc('settings/parent_portal').get());
    await denied(as(env, ANON).doc('settings/parent_portal').get());
    await ok(as(env, STAFF).doc('settings/parent_portal').set({ notificationsPaused: true, pauseNote: 'drill' }, { merge: true }));
    await denied(as(env, GUARDIAN_A).doc('settings/parent_portal').set({ notificationsPaused: true }, { merge: true }));
  });
});

describe('student_attendance', () => {
  const ref = (db) => db.doc('student_attendance/SEC1_2026-09-21');
  it('kiosk merge with allowed keys succeeds', async () => {
    await ok(ref(as(env, KIOSK)).set({ sectionId: 'SEC1', date: '2026-09-21', schoolYear: '2026-2027', marks: { S1: 'P' }, timeIn: { S1: '07:12' }, rosterInitialized: true, updatedAt: '2026-09-21' }, { merge: true }));
  });
  it('kiosk cannot add unexpected keys; anonymous cannot write; guardian cannot read', async () => {
    await denied(ref(as(env, KIOSK)).set({ sectionId: 'SEC1', date: '2026-09-21', schoolYear: '2026-2027', note: 'x' }, { merge: true }));
    await denied(ref(as(env, ANON)).set({ marks: { S1: 'P' } }, { merge: true }));
    await denied(ref(as(env, GUARDIAN_A)).get());
  });
});

describe('kiosks', () => {
  it('kiosk reads its own doc and may only bump lastSeenAt', async () => {
    await ok(as(env, KIOSK).doc('kiosks/kiosk1').get());
    await ok(as(env, KIOSK).doc('kiosks/kiosk1').update({ lastSeenAt: new Date() }));
    await denied(as(env, KIOSK).doc('kiosks/kiosk1').update({ active: true, lastSeenAt: new Date() }));
    await denied(as(env, KIOSK).doc('kiosks/kiosk9').get());
  });
  it('nobody creates kiosk docs from a client, staff can read all', async () => {
    await denied(as(env, STAFF).doc('kiosks/new').set({ label: 'x', active: true }));
    await ok(as(env, STAFF).collection('kiosks').get());
  });
});

describe('users', () => {
  it('unchanged: staff read, nobody writes', async () => {
    await ok(as(env, STAFF).doc('users/registrar@bnhs.edu').get());
    await denied(as(env, STAFF).doc('users/x@bnhs.edu').set({ role: 'registrar' }));
    await denied(as(env, KIOSK).doc('users/registrar@bnhs.edu').get());
  });
});
```

`tests/rules/scanEvents.test.js`:

```js
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import { setup, seedBaseline, as, ok, denied, STAFF, KIOSK, KIOSK_INACTIVE, GUARDIAN_A, seed } from './helpers.js';

// rules-unit-testing hands out compat Firestore instances, so the server
// timestamp sentinel must come from the compat namespace too.
const serverTimestamp = () => firebase.firestore.FieldValue.serverTimestamp();

let env;
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedBaseline(env); });

const valid = (over = {}) => ({
  studentId: 'S1', sectionId: 'SEC1', schoolYear: '2026-2027', kind: 'in', deviceId: 'kiosk1',
  scannedAt: new Date(), scannedDate: '2026-09-21', scannedTime: '07:12', receivedAt: serverTimestamp(), source: 'kiosk', ...over,
});
const ID = 'kiosk1_S1_202609210712';

describe('scan_events', () => {
  it('active kiosk creates a well-formed event', async () => {
    await ok(as(env, KIOSK).doc(`scan_events/${ID}`).set(valid()));
  });
  it('rejects bad shape, wrong device, non-server receivedAt, wrong id prefix, bad kind', async () => {
    const db = as(env, KIOSK);
    await denied(db.doc(`scan_events/${ID}`).set(valid({ extra: 1 })));
    await denied(db.doc(`scan_events/${ID}`).set(valid({ deviceId: 'kiosk2' })));
    await denied(db.doc(`scan_events/${ID}`).set(valid({ receivedAt: new Date() })));
    await denied(db.doc(`scan_events/kiosk2_S1_202609210712`).set(valid()));
    await denied(db.doc(`scan_events/${ID}`).set(valid({ kind: 'void' })));
    await denied(db.doc(`scan_events/${ID}`).set(valid({ source: 'staff' })));
  });
  it('inactive kiosk, staff, guardian cannot create', async () => {
    await denied(as(env, KIOSK_INACTIVE).doc('scan_events/kiosk9_S1_202609210712').set(valid({ deviceId: 'kiosk9' })));
    await denied(as(env, STAFF).doc('scan_events/staff1_S1_202609210712').set(valid({ deviceId: 'staff1' })));
    await denied(as(env, GUARDIAN_A).doc('scan_events/gA_S1_202609210712').set(valid({ deviceId: 'gA' })));
  });
  it('is immutable for everyone, readable by staff only', async () => {
    await seed(env, (db) => db.doc(`scan_events/${ID}`).set(valid({ receivedAt: new Date() })));
    await denied(as(env, KIOSK).doc(`scan_events/${ID}`).update({ kind: 'out' }));
    await denied(as(env, STAFF).doc(`scan_events/${ID}`).update({ kind: 'out' }));
    await denied(as(env, STAFF).doc(`scan_events/${ID}`).delete());
    await ok(as(env, STAFF).doc(`scan_events/${ID}`).get());
    await denied(as(env, KIOSK).doc(`scan_events/${ID}`).get());
    await denied(as(env, GUARDIAN_A).doc(`scan_events/${ID}`).get());
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npm run test:rules`
Expected: FAIL — the current rules allow anonymous roster reads and kiosk doc
creation; `scan_events` writes are denied by the default-deny (so some
"denied" assertions pass, but the `ok` ones fail).

- [ ] **Step 4: Replace `firestore.rules`**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ---------- identities (spec §8) ----------
    function signedIn() { return request.auth != null; }
    function notAnonymous() {
      return signedIn() && request.auth.token.firebase.sign_in_provider != 'anonymous';
    }
    // Staff = has a users/{email} profile. Provisioned by hand; never client-written.
    function isStaff() {
      return signedIn() && request.auth.token.email != null
        && exists(/databases/$(database)/documents/users/$(request.auth.token.email.lower()));
    }
    // Kiosk = a per-device account allow-listed (and active) in kiosks/{uid}.
    function kioskDoc() { return get(/databases/$(database)/documents/kiosks/$(request.auth.uid)); }
    function isKiosk() {
      return signedIn() && exists(/databases/$(database)/documents/kiosks/$(request.auth.uid))
        && kioskDoc().data.active == true;
    }
    // Guardian = a real (non-anonymous) account with a verified email.
    function isGuardian() { return notAnonymous() && request.auth.token.email_verified == true; }
    function own(uid) { return signedIn() && request.auth.uid == uid; }
    function hasLink(studentId) {
      return isGuardian()
        && get(/databases/$(database)/documents/guardian_links/$(request.auth.uid + '_' + studentId)).data.status == 'active';
    }
    function bounded(n) { return request.query.limit <= n; }
    function affectedOnly(keys) {
      return request.resource.data.diff(resource.data).affectedKeys().hasOnly(keys);
    }

    // ---------- roster (staff + kiosk only; the anonymous public is gone) ----------
    match /students/{id}    { allow read: if isStaff() || isKiosk(); allow write: if isStaff(); }
    match /enrollments/{id} { allow read: if isStaff() || isKiosk(); allow write: if isStaff(); }
    match /sections/{id}    { allow read: if isStaff() || isKiosk(); allow write: if isStaff(); }
    match /schedules/{id}   { allow read: if isStaff() || isKiosk(); allow write: if isStaff(); }
    match /settings/app     { allow read: if isStaff() || isKiosk(); allow write: if isStaff(); }
    match /settings/parent_portal { allow read: if notAnonymous(); allow write: if isStaff(); }
    match /users/{id}       { allow read: if isStaff(); allow write: if false; }

    // Confirmed attendance. Staff edit freely; the kiosk merges only its known fields.
    match /student_attendance/{id} {
      allow read: if isStaff() || isKiosk();
      allow write: if isStaff()
        || (isKiosk() && request.resource.data.keys().hasOnly(
             ['sectionId', 'date', 'schoolYear', 'marks', 'timeIn', 'timeOut', 'rosterInitialized', 'updatedAt']));
    }

    // ---------- kiosks ----------
    match /kiosks/{uid} {
      allow read: if isStaff() || (own(uid) && resource.data.active == true);
      allow create, delete: if false;                       // registerKiosk / deactivateKiosk callables
      allow update: if own(uid) && affectedOnly(['lastSeenAt']);
    }

    // ---------- raw scan log (append-only) ----------
    match /scan_events/{id} {
      allow read: if isStaff();
      allow create: if isKiosk()
        && id.split('_')[0] == request.auth.uid
        && request.resource.data.keys().hasOnly(['studentId', 'sectionId', 'schoolYear', 'kind', 'deviceId',
             'scannedAt', 'scannedDate', 'scannedTime', 'receivedAt', 'source'])
        && request.resource.data.keys().hasAll(['studentId', 'sectionId', 'schoolYear', 'kind', 'deviceId',
             'scannedAt', 'scannedDate', 'scannedTime', 'receivedAt', 'source'])
        && request.resource.data.deviceId == request.auth.uid
        && request.resource.data.source == 'kiosk'
        && request.resource.data.kind in ['in', 'out']
        && request.resource.data.studentId is string
        && request.resource.data.sectionId is string
        && request.resource.data.schoolYear is string
        && request.resource.data.scannedAt is timestamp
        && request.resource.data.scannedDate is string
        && request.resource.data.scannedTime is string
        && request.resource.data.receivedAt == request.time;
      allow update, delete: if false;
    }

    // ---------- parent-facing projections (Functions write; guardians read via link) ----------
    match /learners/{studentId} {
      allow get: if hasLink(studentId) || isStaff();
      allow list: if isStaff();
      allow write: if false;
      match /events/{eventId} {
        allow get: if hasLink(studentId) || isStaff();
        allow list: if (hasLink(studentId) && bounded(50)) || isStaff();
        allow write: if false;
      }
    }

    // ---------- guardians ----------
    match /guardians/{uid} {
      allow read: if own(uid) || isStaff();
      allow create, delete: if false;
      allow update: if own(uid) && affectedOnly(['notificationsEnabled', 'displayName', 'lastOpenedAt']);

      match /devices/{tokenHash} {
        allow read: if own(uid);
        allow create, update: if own(uid)
          && request.resource.data.keys().hasOnly(['token', 'platform', 'createdAt', 'refreshedAt', 'enabled', 'failureCount'])
          && request.resource.data.token is string && request.resource.data.token.size() < 4096
          && request.resource.data.enabled is bool;
        allow delete: if own(uid);
      }
      match /inbox/{id} {
        allow get: if own(uid);
        allow list: if own(uid) && bounded(50);
        allow update: if own(uid) && affectedOnly(['readAt']);
        allow create, delete: if false;
      }
    }

    match /guardian_links/{id} {
      allow get: if isStaff() || (isGuardian() && resource.data.guardianUid == request.auth.uid);
      allow list: if isStaff() || (isGuardian() && resource.data.guardianUid == request.auth.uid && bounded(50));
      allow write: if false;
    }

    // ---------- staff-only records written by Functions ----------
    match /activation_codes/{id} { allow read: if isStaff(); allow write: if false; }
    match /audit_log/{id}        { allow read: if isStaff(); allow write: if false; }
    match /rate_limits/{id}      { allow read, write: if false; }

    match /access_requests/{id} {
      allow get: if isStaff() || (isGuardian() && resource.data.guardianUid == request.auth.uid);
      allow list: if isStaff() || (isGuardian() && resource.data.guardianUid == request.auth.uid && bounded(50));
      allow write: if false;                                // requestAccess / resolveAccessRequest callables
    }
    match /reports/{id} {
      allow get: if isStaff() || (isGuardian() && resource.data.guardianUid == request.auth.uid);
      allow list: if isStaff() || (isGuardian() && resource.data.guardianUid == request.auth.uid && bounded(50));
      allow write: if false;                                // submitReport / resolveReport callables
    }
  }
}
```

- [ ] **Step 5: Run the rules tests**

Run: `npm run test:rules`
Expected: PASS for `existing.test.js` and `scanEvents.test.js`.

- [ ] **Step 6: Commit**

```bash
git add firestore.rules vitest.rules.config.js tests/rules/
git commit -m "feat(rules): kiosk identity, append-only scan_events, parent-facing least-privilege policy

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Kiosk — device login, App Check, atomic scan batch (in `bnhs-student-kiosk`)

**Repository:** `C:\Users\jitsb\OneDrive - Department of Education\Desktop\APPS\bnhs-student-kiosk`
(work on a branch `claude/kiosk-device-identity`).

**Files:**
- Create: `src/lib/scanEvent.js`, `src/lib/scanEvent.test.js`, `src/components/SetupScreen.jsx`, `src/components/NotAuthorizedScreen.jsx`
- Modify: `src/firebase.js`, `src/data/attendance.js`, `src/App.jsx`, `src/components/ConfirmScreen.jsx`, `.env.example`, `README.md`

**Interfaces:**
- Produces: `scanEventId({deviceId, studentId, scannedAt})` → `"{deviceId}_{studentId}_{YYYYMMDDHHMM}"`;
  `buildScanEvent({deviceId, studentId, sectionId, schoolYear, kind, scannedAt, receivedAt})` → the exact document shape the rules accept;
  `recordScan(...)` now takes `deviceId` and returns `{ kind, mark, scanTime, sync: 'saved' | 'queued' }`.

- [ ] **Step 1: Write the failing tests**

`src/lib/scanEvent.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { scanEventId, buildScanEvent, SCAN_EVENT_KEYS } from './scanEvent.js';

describe('scanEventId', () => {
  it('is deterministic to the minute', () => {
    const a = scanEventId({ deviceId: 'k1', studentId: 'S1', scannedAt: new Date(2026, 8, 21, 7, 12, 5) });
    const b = scanEventId({ deviceId: 'k1', studentId: 'S1', scannedAt: new Date(2026, 8, 21, 7, 12, 59) });
    expect(a).toBe('k1_S1_202609210712');
    expect(b).toBe(a);
  });
  it('differs across minutes, devices and learners', () => {
    const base = { deviceId: 'k1', studentId: 'S1', scannedAt: new Date(2026, 8, 21, 7, 12) };
    expect(scanEventId({ ...base, scannedAt: new Date(2026, 8, 21, 7, 13) })).not.toBe(scanEventId(base));
    expect(scanEventId({ ...base, deviceId: 'k2' })).not.toBe(scanEventId(base));
    expect(scanEventId({ ...base, studentId: 'S2' })).not.toBe(scanEventId(base));
  });
});

describe('buildScanEvent', () => {
  it('produces exactly the keys the rules accept', () => {
    const ev = buildScanEvent({ deviceId: 'k1', studentId: 'S1', sectionId: 'SEC1', schoolYear: '2026-2027', kind: 'in',
      scannedAt: new Date(2026, 8, 21, 7, 12), receivedAt: 'SERVER' });
    expect(Object.keys(ev).sort()).toEqual([...SCAN_EVENT_KEYS].sort());
    expect(ev).toMatchObject({ studentId: 'S1', sectionId: 'SEC1', schoolYear: '2026-2027', kind: 'in', deviceId: 'k1',
      scannedDate: '2026-09-21', scannedTime: '07:12', receivedAt: 'SERVER', source: 'kiosk' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/scanEvent.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/scanEvent.js`**

```js
import { localDate, localTime, pad2 } from './dates.js';

export const SCAN_EVENT_KEYS = ['studentId', 'sectionId', 'schoolYear', 'kind', 'deviceId',
  'scannedAt', 'scannedDate', 'scannedTime', 'receivedAt', 'source'];

// Minute-granular, device-scoped ID. A retried or double scan inside the
// same minute maps to the same document, which the rules make create-only —
// so duplicates can never become two events (spec §5 "Duplicate scan").
export function scanEventId({ deviceId, studentId, scannedAt }) {
  const d = scannedAt;
  const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}${pad2(d.getHours())}${pad2(d.getMinutes())}`;
  return `${deviceId}_${studentId}_${stamp}`;
}

// Exactly the field set firestore.rules accepts for scan_events — no more, no
// less. `scannedAt` is passed through as given (a Date here; the data layer
// converts it to a Firestore Timestamp), `receivedAt` must be the server
// timestamp sentinel so rules can check receivedAt == request.time.
export function buildScanEvent({ deviceId, studentId, sectionId, schoolYear, kind, scannedAt, receivedAt }) {
  return {
    studentId, sectionId, schoolYear, kind, deviceId,
    scannedAt, scannedDate: localDate(scannedAt), scannedTime: localTime(scannedAt),
    receivedAt, source: 'kiosk',
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run`
Expected: PASS (new tests plus existing kiosk tests).

- [ ] **Step 5: Replace anonymous sign-in with App Check + persisted device session**

Replace `src/firebase.js`:

```js
import { initializeApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

// App Check must be initialized before any Firestore call. In local dev the
// debug token (registered in the console) stands in for reCAPTCHA.
if (import.meta.env.VITE_APPCHECK_DEBUG_TOKEN) self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
if (import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
  initializeAppCheck(app, { provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
}

export const db = getFirestore(app);
export const auth = getAuth(app);

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}

enableIndexedDbPersistence(db).catch(() => {});

// No signInAnonymously any more. The device is signed in once by staff at
// /setup with its own kiosk-<gate>@ account (spec §3, §5); Firebase Auth's
// default local persistence keeps that session across reloads.
```

Append to `.env.example`:

```
VITE_RECAPTCHA_SITE_KEY=
VITE_APPCHECK_DEBUG_TOKEN=
VITE_USE_EMULATORS=
```

- [ ] **Step 6: Atomic batch in `src/data/attendance.js`**

Replace the file:

```js
import { doc, getDoc, getDocFromCache, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase.js';
import { localDate, localTime } from '../lib/dates.js';
import { needsInitialization, initialMarksForRoster } from '../lib/attendanceRoster.js';
import { scanWrite } from '../lib/scanClassifier.js';
import { scanEventId, buildScanEvent } from '../lib/scanEvent.js';

export const attendanceId = (sectionId, date) => `${sectionId}_${date}`;

// Same-device, same-minute duplicate guard. The scan_events ID is minute-
// granular and create-only, so a second scan of the same learner+kind within
// a minute would fail the whole batch (and with it the attendance merge).
// Remember what this device already wrote and skip the event in that case;
// the attendance merge still happens exactly as before.
const recentEventIds = new Map();

const QUEUE_TIMEOUT_MS = 3000;
const delay = (ms, value) => new Promise((r) => setTimeout(() => r(value), ms));

async function readAttendance(ref) {
  try { return await getDoc(ref); }
  catch { try { return await getDocFromCache(ref); } catch { return null; } }
}

// Records one scan per the kiosk's Entrance/Exit mode (see scanWrite). Writes
// the student_attendance merge AND an immutable scan_events document in one
// atomic batch, so the confirmed record and the raw log can never diverge.
// Returns sync: 'saved' when the server acknowledged, 'queued' when the
// batch is sitting in the offline queue (Firestore flushes it on reconnect
// with the same scannedAt and a server-assigned receivedAt).
export async function recordScan({ deviceId, studentId, sectionId, date, schoolYear, rosterStudentIds, scheduleTimeIn, mode, now = new Date() }) {
  const ref = doc(db, 'student_attendance', attendanceId(sectionId, date));
  const snap = await readAttendance(ref);
  const existingData = snap?.exists() ? snap.data() : null;

  const attendance = { updatedAt: localDate(now) };
  if (needsInitialization(existingData)) {
    Object.assign(attendance, {
      sectionId, date, schoolYear,
      marks: initialMarksForRoster(rosterStudentIds, existingData?.marks || {}),
      rosterInitialized: true,
    });
  }

  const scanTime = localTime(now);
  const result = scanWrite({
    mode,
    existingTimeIn: existingData?.timeIn?.[studentId],
    existingMark: existingData?.marks?.[studentId],
    scanTime,
    scheduleTimeIn,
  });

  if (result.field === 'timeIn') {
    attendance.timeIn = { [studentId]: scanTime };
    if (result.marksChanged) attendance.marks = { ...(attendance.marks || {}), [studentId]: result.mark };
  } else {
    attendance.timeOut = { [studentId]: scanTime };
  }

  const kind = result.field === 'timeIn' ? 'in' : 'out';
  const batch = writeBatch(db);
  batch.set(ref, attendance, { merge: true });

  const eventId = scanEventId({ deviceId, studentId, scannedAt: now });
  const dedupeKey = `${studentId}_${kind}`;
  const isRepeat = recentEventIds.get(dedupeKey) === eventId;
  if (!isRepeat) {
    batch.set(doc(db, 'scan_events', eventId), buildScanEvent({
      deviceId, studentId, sectionId, schoolYear, kind,
      scannedAt: Timestamp.fromDate(now), receivedAt: serverTimestamp(),
    }));
    recentEventIds.set(dedupeKey, eventId);
  }

  const commit = batch.commit();
  commit.catch(() => { if (!isRepeat) recentEventIds.delete(dedupeKey); });
  const sync = await Promise.race([commit.then(() => 'saved'), delay(QUEUE_TIMEOUT_MS, 'queued')]);
  if (sync === 'saved') { /* acknowledged */ }

  return { kind: result.field === 'timeIn' ? 'timeIn' : 'timeOut', mark: result.mark, scanTime, sync };
}
```

Note: `commit` rejecting after the 3-second race (for example a rules denial
once the device is deactivated) is surfaced by the `kiosks/{uid}` listener in
`App.jsx` (Step 8), which replaces the scan UI; this function itself does not
throw for a queued write.

- [ ] **Step 7: Setup and not-authorized screens**

`src/components/SetupScreen.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import { T } from '../styles.js';

// Staff-only device setup, reached by typing /setup in the address bar. Not
// linked from any kiosk screen. Signs the device in with its kiosk-<gate>@
// account; Firebase persists the session so the scan screen works after
// reload without ever showing this again.
export default function SetupScreen() {
  const [user, setUser] = useState(null);
  const [device, setDevice] = useState(undefined); // undefined = loading, null = no kiosks doc
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => {
    if (!user) { setDevice(undefined); return; }
    return onSnapshot(doc(db, 'kiosks', user.uid), (s) => setDevice(s.exists() ? s.data() : null), () => setDevice(null));
  }, [user]);

  const signIn = async () => {
    setBusy(true); setErr('');
    try { await signInWithEmailAndPassword(auth, email.trim(), pw); setPw(''); }
    catch { setErr('Email and password did not match.'); }
    setBusy(false);
  };

  const field = { fontFamily: T.body, fontSize: 16, padding: '12px 14px', borderRadius: 10, border: '1.5px solid #ccc', width: '100%', boxSizing: 'border-box', marginBottom: 12 };
  const btn = { fontFamily: T.body, fontSize: 16, fontWeight: 700, padding: '12px 20px', borderRadius: 999, border: 'none', cursor: 'pointer', background: T.gold, color: '#1E1B33' };

  return (
    <main style={{ minHeight: '100dvh', background: T.bg, color: T.white, fontFamily: T.body, display: 'grid', placeItems: 'center', padding: 24 }}>
      <section style={{ width: 360, maxWidth: '100%', background: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 24 }}>
        <h1 style={{ fontFamily: T.display, fontSize: 22, margin: '0 0 4px' }}>Kiosk device setup</h1>
        <p style={{ fontSize: 13, opacity: 0.8, marginTop: 0 }}>For registrar use only.</p>
        {user ? (
          <>
            <p style={{ fontSize: 14 }}>Signed in as <strong>{user.email}</strong></p>
            <p style={{ fontSize: 14 }}>Device: {device === undefined ? 'checking…' : device === null ? 'NOT REGISTERED — register this account in SIMS → Guardians → Devices' : `${device.label} (${device.active ? 'active' : 'deactivated'})`}</p>
            <button style={btn} onClick={() => signOut(auth)}>Sign this device out</button>
            <p style={{ fontSize: 13, opacity: 0.8 }}><a href="/" style={{ color: T.gold }}>Back to the scan screen</a></p>
          </>
        ) : (
          <>
            {err && <p role="alert" style={{ color: '#FCA5A5', fontSize: 13 }}>{err}</p>}
            <label style={{ fontSize: 13 }}>Device email
              <input style={field} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label style={{ fontSize: 13 }}>Password
              <input style={field} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && signIn()} />
            </label>
            <button style={{ ...btn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={signIn}>{busy ? 'Signing in…' : 'Sign in this device'}</button>
          </>
        )}
      </section>
    </main>
  );
}
```

`src/components/NotAuthorizedScreen.jsx`:

```jsx
import { T } from '../styles.js';
import KioskHeader from './KioskHeader.jsx';
import KioskFooter from './KioskFooter.jsx';

export default function NotAuthorizedScreen({ reason, mode, onModeChange }) {
  return (
    <div style={{ minHeight: '100dvh', background: T.bg, display: 'flex', flexDirection: 'column', fontFamily: T.body }}>
      <KioskHeader mode={mode} onModeChange={onModeChange} />
      <div role="alert" style={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 32, color: T.white }}>
        <div>
          <div style={{ fontFamily: T.display, fontWeight: 800, fontSize: 'clamp(22px, 5vw, 34px)' }}>Device not authorized</div>
          <div style={{ fontSize: 'clamp(14px, 3vw, 18px)', opacity: 0.85, marginTop: 8 }}>{reason} — please see the registrar.</div>
        </div>
      </div>
      <KioskFooter />
    </div>
  );
}
```

- [ ] **Step 8: Wire auth gating and the device ID into `src/App.jsx`**

Apply these edits to `src/App.jsx`:

1. Imports — add:
```js
import { serverTimestamp, setDoc } from 'firebase/firestore';
import SetupScreen from './components/SetupScreen.jsx';
import NotAuthorizedScreen from './components/NotAuthorizedScreen.jsx';
```
(extend the existing `firebase/firestore` import line rather than duplicating it).

2. Replace the `authReady` block:
```js
  // Route: /setup is the staff-only device login (never linked from the UI).
  const isSetupRoute = typeof window !== 'undefined' && window.location.pathname === '/setup';

  // The device must be signed in with its own kiosk account (no anonymous
  // sessions any more) AND allow-listed as active in kiosks/{uid}. Rules
  // enforce both; this gating just keeps the UI honest and stops listeners
  // from attaching before they'd be denied.
  const [user, setUser] = useState(undefined);        // undefined = auth not resolved yet
  const [device, setDevice] = useState(undefined);    // undefined = unknown, null = missing/inactive
  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u && !u.isAnonymous ? u : null)), []);
  useEffect(() => {
    if (!user) { setDevice(user === null ? null : undefined); return; }
    return onSnapshot(doc(db, 'kiosks', user.uid),
      (s) => setDevice(s.exists() && s.data().active ? { id: user.uid, ...s.data() } : null),
      () => setDevice(null));
  }, [user]);
  useEffect(() => {
    if (!device) return;
    setDoc(doc(db, 'kiosks', device.id), { lastSeenAt: serverTimestamp() }, { merge: true }).catch(() => {});
  }, [device?.id]);
  const authReady = Boolean(device);
```

3. In `handleScan`, pass the device ID and use the sync flag:
```js
      result = await recordScan({
        deviceId: dataRef.current.deviceId,
        studentId: student.id,
        sectionId: enrollment.sectionId,
        date: localDate(),
        schoolYear,
        rosterStudentIds,
        scheduleTimeIn: schedule?.timeIn,
        mode: currentMode,
      });
```
and add `deviceId: device?.id` to the `dataRef.current` object (both the
initial `useRef` value and the effect that refreshes it, with `device` in
that effect's dependency list). In `setSuccess({...})` add `sync: result.sync`.

4. Rendering — before the existing `if (success)` line:
```js
  if (isSetupRoute) return <SetupScreen />;
  if (user === undefined || (user && device === undefined)) return null;
  if (!user) return <NotAuthorizedScreen reason="This device is not signed in" mode={mode} onModeChange={setMode} />;
  if (!device) return <NotAuthorizedScreen reason="This device has been deactivated or is not registered" mode={mode} onModeChange={setMode} />;
```
and pass `sync={success.sync}` to `<ConfirmScreen …>`.

- [ ] **Step 9: Show the queued state in `ConfirmScreen.jsx`**

Add a `sync` prop and, directly under the time/date block, render:

```jsx
        {sync === 'queued' && (
          <div className="confirm-text" style={{ fontFamily: T.body, fontSize: 'clamp(12px, 2.5vw, 14px)', color: T.white, opacity: 0.8 }}>
            Saved on this device · will sync when the connection returns
          </div>
        )}
```

- [ ] **Step 10: Manual verification on the emulator**

1. In this repo (`bnhs-sims`): `npm run emulators`.
2. In the Emulator UI (http://localhost:4000) → Authentication, add user
   `kiosk-gate1@bnhs.local` / any password; copy its UID. In Firestore add
   `kiosks/<uid>` = `{ label: "Main Gate", active: true }`, plus one
   student/section/enrollment and `settings/app`.
3. In the kiosk repo: `.env` with `VITE_USE_EMULATORS=true` and the same
   project ID; `npm run dev`; open `http://localhost:5173/setup`, sign in.
4. Open `/`, scan (type the LRN + Enter). Expected: Confirm screen; Firestore
   shows `student_attendance/...` merged and `scan_events/<uid>_<sid>_<stamp>`
   with `receivedAt` set by the server.
5. Scan again within the same minute: Confirm screen again, no second
   `scan_events` doc, no error.
6. Set `kiosks/<uid>.active = false`: the kiosk switches to
   "Device not authorized" within seconds.
7. DevTools → Network → Offline; scan: Confirm shows "will sync"; go online:
   the event appears with the original `scannedTime`.

- [ ] **Step 11: README and commit**

Update the kiosk `README.md` Setup section: replace the Anonymous-auth bullet
with "Create one Firebase Auth email/password user per device
(`kiosk-<gate>@…`), register it in SIMS → Guardians → Devices, then open
`/setup` on the device and sign in once." Add the `.env` keys from Step 5.

```bash
git add src/lib/scanEvent.js src/lib/scanEvent.test.js src/components/SetupScreen.jsx src/components/NotAuthorizedScreen.jsx src/firebase.js src/data/attendance.js src/App.jsx src/components/ConfirmScreen.jsx .env.example README.md
git commit -m "feat: per-device kiosk identity, App Check, atomic scan_events batch with offline queue state

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Phase 2 — Event pipeline

### Task 5: Pure event logic (`functions/src/lib`)

**Files:**
- Create: `functions/src/lib/classifyEvent.js` (+`.test.js`), `recomputeSummary.js` (+`.test.js`), `shouldPush.js` (+`.test.js`), `pushPayload.js` (+`.test.js`)

**Interfaces:**
- Produces:
  - `classifyEvent({scannedAtMs, receivedAtMs})` → `{delayedSync, clockSkew, effectiveAtMs}`
  - `recomputeSummary({events, todayDate, recentLimit=10})` where each event is
    `{id, kind, scannedDate, scannedTime, effectiveAtMs, status}` → `{today, recent}`
  - `shouldPush({paused, delayedSync, clockSkew, lastPush, kind, nowMs})` → `{send, status?}`
  - `guardianPushGate({notificationsEnabled, tokenCount})` → `null | 'skipped_disabled' | 'skipped_no_device'`
  - `PUSH_TITLE`, `PUSH_BODY`, `pushPayload({tokens, inboxId, studentId, portalUrl})`

- [ ] **Step 1: Write the failing tests**

`functions/src/lib/classifyEvent.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { classifyEvent } from './classifyEvent.js';
const H = 3600_000, M = 60_000;
describe('classifyEvent', () => {
  it('normal: received shortly after scan', () => {
    expect(classifyEvent({ scannedAtMs: 0, receivedAtMs: 2 * M })).toEqual({ delayedSync: false, clockSkew: false, effectiveAtMs: 0 });
  });
  it('delayed: received more than 2h after scan', () => {
    expect(classifyEvent({ scannedAtMs: 0, receivedAtMs: 2 * H + 1 })).toMatchObject({ delayedSync: true, clockSkew: false, effectiveAtMs: 0 });
    expect(classifyEvent({ scannedAtMs: 0, receivedAtMs: 2 * H })).toMatchObject({ delayedSync: false });
  });
  it('skew: scanned in the future (>5 min) or more than 24h in the past; positioned by receivedAt', () => {
    expect(classifyEvent({ scannedAtMs: 6 * M, receivedAtMs: 0 })).toEqual({ delayedSync: false, clockSkew: true, effectiveAtMs: 0 });
    expect(classifyEvent({ scannedAtMs: 0, receivedAtMs: 25 * H })).toEqual({ delayedSync: false, clockSkew: true, effectiveAtMs: 25 * H });
    expect(classifyEvent({ scannedAtMs: 4 * M, receivedAtMs: 0 })).toMatchObject({ clockSkew: false });
  });
});
```

`functions/src/lib/recomputeSummary.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { recomputeSummary } from './recomputeSummary.js';
const ev = (id, kind, date, time, ms, status = 'recorded') => ({ id, kind, scannedDate: date, scannedTime: time, effectiveAtMs: ms, status });

describe('recomputeSummary', () => {
  it('no events today', () => {
    const r = recomputeSummary({ events: [ev('a', 'in', '2026-09-20', '07:00', 1)], todayDate: '2026-09-21' });
    expect(r.today).toEqual({ date: '2026-09-21', firstIn: null, lastOut: null, status: 'no_scan' });
    expect(r.recent).toHaveLength(1);
  });
  it('first in and last out win; status follows the latest event', () => {
    const r = recomputeSummary({ events: [
      ev('in2', 'in', '2026-09-21', '07:30', 30), ev('in1', 'in', '2026-09-21', '07:12', 12),
      ev('out1', 'out', '2026-09-21', '12:00', 120), ev('out2', 'out', '2026-09-21', '16:05', 165),
    ], todayDate: '2026-09-21' });
    expect(r.today.firstIn).toEqual({ time: '07:12', eventId: 'in1' });
    expect(r.today.lastOut).toEqual({ time: '16:05', eventId: 'out2' });
    expect(r.today.status).toBe('out');
  });
  it('ignores voided events and caps recent at the limit, newest first', () => {
    const events = Array.from({ length: 15 }, (_, i) => ev(`e${i}`, 'in', '2026-09-21', '07:00', i));
    events[14].status = 'voided';
    const r = recomputeSummary({ events, todayDate: '2026-09-21', recentLimit: 10 });
    expect(r.recent.map((e) => e.id)[0]).toBe('e13');
    expect(r.recent).toHaveLength(10);
    expect(r.today.status).toBe('in');
  });
  it('out-of-order arrival does not matter: ordering is by effectiveAtMs', () => {
    const r = recomputeSummary({ events: [ev('late', 'in', '2026-09-21', '07:05', 5), ev('first', 'out', '2026-09-21', '16:00', 160)], todayDate: '2026-09-21' });
    expect(r.today.firstIn.eventId).toBe('late');
    expect(r.today.status).toBe('out');
  });
});
```

`functions/src/lib/shouldPush.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { shouldPush, guardianPushGate } from './shouldPush.js';
const M = 60_000;
describe('shouldPush', () => {
  const base = { paused: false, delayedSync: false, clockSkew: false, lastPush: null, kind: 'in', nowMs: 100 * M };
  it('sends by default', () => expect(shouldPush(base)).toEqual({ send: true }));
  it('paused wins', () => expect(shouldPush({ ...base, paused: true, delayedSync: true })).toEqual({ send: false, status: 'skipped_paused' }));
  it('delayed or skewed are suppressed', () => {
    expect(shouldPush({ ...base, delayedSync: true })).toEqual({ send: false, status: 'skipped_suppressed' });
    expect(shouldPush({ ...base, clockSkew: true })).toEqual({ send: false, status: 'skipped_suppressed' });
  });
  it('same-kind push within 10 minutes is suppressed; other kind or older is not', () => {
    expect(shouldPush({ ...base, lastPush: { kind: 'in', atMs: 95 * M } })).toEqual({ send: false, status: 'skipped_suppressed' });
    expect(shouldPush({ ...base, lastPush: { kind: 'out', atMs: 95 * M } })).toEqual({ send: true });
    expect(shouldPush({ ...base, lastPush: { kind: 'in', atMs: 89 * M } })).toEqual({ send: true });
  });
});
describe('guardianPushGate', () => {
  it('gates on account toggle then device count', () => {
    expect(guardianPushGate({ notificationsEnabled: false, tokenCount: 2 })).toBe('skipped_disabled');
    expect(guardianPushGate({ notificationsEnabled: true, tokenCount: 0 })).toBe('skipped_no_device');
    expect(guardianPushGate({ notificationsEnabled: true, tokenCount: 1 })).toBeNull();
  });
});
```

`functions/src/lib/pushPayload.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { pushPayload, PUSH_TITLE, PUSH_BODY } from './pushPayload.js';
describe('pushPayload', () => {
  const p = pushPayload({ tokens: ['t1', 't2'], inboxId: 'k1_S1_202609210712', studentId: 'S1', portalUrl: 'https://bnhs-parent.web.app' });
  it('uses the fixed, content-free sentence', () => {
    expect(PUSH_BODY).toBe('BNHS recorded a new attendance event. Tap to view securely.');
    expect(p.notification).toEqual({ title: PUSH_TITLE, body: PUSH_BODY });
    expect(p.webpush.notification.tag).toBe('k1_S1_202609210712');
    expect(p.webpush.headers).toEqual({ TTL: '14400', Urgency: 'high' });
    expect(p.webpush.fcmOptions.link).toBe('https://bnhs-parent.web.app/inbox?item=k1_S1_202609210712');
  });
  it('never leaks learner details', () => {
    const json = JSON.stringify(p);
    for (const forbidden of ['Ana', 'Cruz', '07:12', 'Entered', 'Left', 'scannedTime', 'displayName']) expect(json).not.toContain(forbidden);
    expect(Object.keys(p.data).sort()).toEqual(['inboxId', 'studentId']);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm --prefix functions test`
Expected: FAIL — four modules not found.

- [ ] **Step 3: Implement**

`functions/src/lib/classifyEvent.js`:

```js
export const DELAYED_MS = 2 * 60 * 60 * 1000;
export const SKEW_FUTURE_MS = 5 * 60 * 1000;
export const SKEW_PAST_MS = 24 * 60 * 60 * 1000;

// Spec §5 step 3. A skewed device clock positions the event by server time
// instead; a delayed (offline-synced) event keeps its scan time but is not
// pushed (nobody wants a 9 p.m. push about a 7 a.m. entry).
export function classifyEvent({ scannedAtMs, receivedAtMs }) {
  const lag = receivedAtMs - scannedAtMs;
  const clockSkew = lag < -SKEW_FUTURE_MS || lag > SKEW_PAST_MS;
  const delayedSync = !clockSkew && lag > DELAYED_MS;
  return { delayedSync, clockSkew, effectiveAtMs: clockSkew ? receivedAtMs : scannedAtMs };
}
```

`functions/src/lib/recomputeSummary.js`:

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
    },
    recent: live.slice(0, recentLimit).map((e) => ({ id: e.id, kind: e.kind, scannedDate: e.scannedDate, scannedTime: e.scannedTime })),
  };
}
```

`functions/src/lib/shouldPush.js`:

```js
export const SUPPRESS_MS = 10 * 60 * 1000;

// Event-level gates (spec §6). Returns the inbox pushStatus to record when
// not sending.
export function shouldPush({ paused, delayedSync, clockSkew, lastPush, kind, nowMs }) {
  if (paused) return { send: false, status: 'skipped_paused' };
  if (delayedSync || clockSkew) return { send: false, status: 'skipped_suppressed' };
  if (lastPush && lastPush.kind === kind && nowMs - lastPush.atMs < SUPPRESS_MS) return { send: false, status: 'skipped_suppressed' };
  return { send: true };
}

// Guardian-level gates.
export function guardianPushGate({ notificationsEnabled, tokenCount }) {
  if (!notificationsEnabled) return 'skipped_disabled';
  if (tokenCount === 0) return 'skipped_no_device';
  return null;
}
```

`functions/src/lib/pushPayload.js`:

```js
export const PUSH_TITLE = 'BNHS Learner Records';
export const PUSH_BODY = 'BNHS recorded a new attendance event. Tap to view securely.';

// The one and only push shape. Nothing about the learner, time, or kind is
// in it — the guardian sees details only inside the authenticated portal.
export function pushPayload({ tokens, inboxId, studentId, portalUrl }) {
  return {
    tokens,
    notification: { title: PUSH_TITLE, body: PUSH_BODY },
    data: { inboxId, studentId },
    webpush: {
      headers: { TTL: '14400', Urgency: 'high' },
      notification: { title: PUSH_TITLE, body: PUSH_BODY, tag: inboxId, icon: '/icons/icon-192.png' },
      fcmOptions: { link: `${portalUrl}/inbox?item=${inboxId}` },
    },
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm --prefix functions test`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add functions/src/lib
git commit -m "feat(functions): pure event classification, summary, push gating and payload

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `onScanEventCreated` handler, push sender, emulator tests

**Files:**
- Create: `functions/src/handlers/push.js`, `functions/src/handlers/scanEvent.js`, `functions/test/emulator/helpers.js`, `functions/test/emulator/scanEvent.test.js`
- Modify: `functions/index.js`

**Interfaces:**
- Consumes: Task 5 libs; `cached`, `logEvent`, `logWarn`.
- Produces:
  - `sendToGuardian(deps, {guardianUid, inboxId, studentId})` → `{status: 'sent'|'failed'|'skipped_no_device', pruned}` where `deps = {db, messaging, portalUrl}`
  - `handleScanEvent(deps, {eventId, data, suppressPush=false})` → `{outcome}` where
    `deps = {db, messaging, portalUrl, now: () => Date}`
  - `functions/index.js` exports `onScanEventCreated`.

- [ ] **Step 1: Emulator test helpers**

`functions/test/emulator/helpers.js`:

```js
import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// Requires FIRESTORE_EMULATOR_HOST (set by `firebase emulators:exec`).
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run via: npm run test:functions (emulator required)');
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'bnhs-sims-fn-test';

export function app() {
  return getApps()[0] || initializeApp({ projectId: process.env.GCLOUD_PROJECT });
}
export const db = () => getFirestore(app());

export async function clearAll() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  await fetch(`http://${host}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
}

// A messaging stub that records what would have been sent and lets tests
// script per-token failures. This is the "fake notifications" stage.
export function fakeMessaging(script = {}) {
  const sent = [];
  return {
    sent,
    async sendEachForMulticast(msg) {
      sent.push(msg);
      const responses = msg.tokens.map((t) => script[t]
        ? { success: false, error: { code: script[t] } }
        : { success: true, messageId: `m-${t}` });
      return { successCount: responses.filter((r) => r.success).length, failureCount: responses.filter((r) => !r.success).length, responses };
    },
  };
}

export const ts = (isoOrMs) => Timestamp.fromMillis(typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs));

export async function seedSchool(d = db()) {
  const b = d.batch();
  b.set(d.doc('settings/app'), { currentSchoolYear: '2026-2027' });
  b.set(d.doc('settings/parent_portal'), { notificationsPaused: false, consentVersion: 1 });
  b.set(d.doc('kiosks/k1'), { label: 'Main Gate', active: true });
  b.set(d.doc('kiosks/k9'), { label: 'Old Gate', active: false });
  b.set(d.doc('students/S1'), { lrn: '100000000001', firstName: 'Ana', lastName: 'Cruz', middleName: 'B' });
  b.set(d.doc('students/S2'), { lrn: '100000000002', firstName: 'Ben', lastName: 'Dy' });
  b.set(d.doc('sections/SEC1'), { name: 'Rizal', gradeLevel: 7, schoolYear: '2026-2027' });
  b.set(d.doc('enrollments/S1_2026-2027'), { studentId: 'S1', sectionId: 'SEC1', schoolYear: '2026-2027', status: 'enrolled' });
  b.set(d.doc('guardian_links/gA_S1'), { guardianUid: 'gA', studentId: 'S1', status: 'active', schoolYear: '2026-2027', relationship: 'Mother' });
  b.set(d.doc('guardian_links/gB_S1'), { guardianUid: 'gB', studentId: 'S1', status: 'active', schoolYear: '2026-2027', relationship: 'Father' });
  b.set(d.doc('guardian_links/gC_S1'), { guardianUid: 'gC', studentId: 'S1', status: 'revoked', schoolYear: '2026-2027' });
  b.set(d.doc('guardians/gA'), { email: 'a@x', notificationsEnabled: true });
  b.set(d.doc('guardians/gA/devices/tA1'), { token: 'tokA1', enabled: true, failureCount: 0, refreshedAt: ts(Date.now()) });
  b.set(d.doc('guardians/gA/devices/tA2'), { token: 'tokA2', enabled: true, failureCount: 0, refreshedAt: ts(Date.now()) });
  b.set(d.doc('guardians/gB'), { email: 'b@x', notificationsEnabled: false });
  b.set(d.doc('guardians/gB/devices/tB1'), { token: 'tokB1', enabled: true, failureCount: 0, refreshedAt: ts(Date.now()) });
  await b.commit();
}

export const scanDoc = (over = {}) => ({
  studentId: 'S1', sectionId: 'SEC1', schoolYear: '2026-2027', kind: 'in', deviceId: 'k1',
  scannedAt: ts('2026-09-21T07:12:00+08:00'), scannedDate: '2026-09-21', scannedTime: '07:12',
  receivedAt: ts('2026-09-21T07:12:20+08:00'), source: 'kiosk', ...over,
});
```

- [ ] **Step 2: Write the failing emulator tests**

`functions/test/emulator/scanEvent.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearAll, seedSchool, fakeMessaging, scanDoc, ts } from './helpers.js';
import { handleScanEvent } from '../../src/handlers/scanEvent.js';
import { clearCache } from '../../src/cache.js';

const NOW = () => new Date('2026-09-21T07:12:30+08:00');
const deps = (messaging = fakeMessaging()) => ({ db: db(), messaging, portalUrl: 'https://p.test', now: NOW });
const run = async (d, eventId, data, extra = {}) => {
  await db().doc(`scan_events/${eventId}`).set(data);
  return handleScanEvent(d, { eventId, data, ...extra });
};

beforeEach(async () => { await clearAll(); clearCache(); await seedSchool(); });

describe('handleScanEvent', () => {
  it('projects the event, updates the summary, fans out inbox items, pushes to enabled devices only', async () => {
    const m = fakeMessaging();
    const r = await run(deps(m), 'k1_S1_202609210712', scanDoc());
    expect(r.outcome).toBe('processed');

    const ev = (await db().doc('learners/S1/events/k1_S1_202609210712').get()).data();
    expect(ev).toMatchObject({ kind: 'in', scannedDate: '2026-09-21', scannedTime: '07:12', deviceLabel: 'Main Gate', status: 'recorded', delayedSync: false, clockSkew: false, source: 'kiosk' });

    const learner = (await db().doc('learners/S1').get()).data();
    expect(learner.displayName).toBe('Ana Cruz');
    expect(learner.sectionLabel).toBe('Grade 7 – Rizal');
    expect(learner.today).toMatchObject({ date: '2026-09-21', status: 'in', firstIn: { time: '07:12', eventId: 'k1_S1_202609210712' } });
    expect(learner.lastPush.kind).toBe('in');

    const inboxA = (await db().doc('guardians/gA/inbox/k1_S1_202609210712').get()).data();
    expect(inboxA).toMatchObject({ type: 'attendance', studentId: 'S1', learnerName: 'Ana Cruz', kind: 'in', scannedTime: '07:12', pushStatus: 'sent' });
    const inboxB = (await db().doc('guardians/gB/inbox/k1_S1_202609210712').get()).data();
    expect(inboxB.pushStatus).toBe('skipped_disabled');
    expect((await db().doc('guardians/gC/inbox/k1_S1_202609210712').get()).exists).toBe(false);

    expect(m.sent).toHaveLength(1);
    expect(m.sent[0].tokens.sort()).toEqual(['tokA1', 'tokA2']);
    expect(m.sent[0].notification.body).toBe('BNHS recorded a new attendance event. Tap to view securely.');
  });

  it('is idempotent: re-running the same event sends nothing new', async () => {
    const m = fakeMessaging();
    await run(deps(m), 'k1_S1_202609210712', scanDoc());
    const r = await run(deps(m), 'k1_S1_202609210712', scanDoc());
    expect(r.outcome).toBe('processed');
    expect(m.sent).toHaveLength(1);
    expect((await db().collection('learners/S1/events').get()).size).toBe(1);
  });

  it('suppresses a same-kind push within 10 minutes but still records and inboxes', async () => {
    const m = fakeMessaging();
    await run(deps(m), 'k1_S1_202609210712', scanDoc());
    await run(deps(m), 'k1_S1_202609210715', scanDoc({ scannedAt: ts('2026-09-21T07:15:00+08:00'), scannedTime: '07:15', receivedAt: ts('2026-09-21T07:15:10+08:00') }));
    expect(m.sent).toHaveLength(1);
    expect((await db().doc('guardians/gA/inbox/k1_S1_202609210715').get()).data().pushStatus).toBe('skipped_suppressed');
    expect((await db().doc('learners/S1').get()).data().today.firstIn.time).toBe('07:12');
  });

  it('delayed sync: recorded with flag, no push', async () => {
    const m = fakeMessaging();
    await run(deps(m), 'k1_S1_202609210712', scanDoc({ receivedAt: ts('2026-09-21T10:00:00+08:00') }));
    expect(m.sent).toHaveLength(0);
    expect((await db().doc('learners/S1/events/k1_S1_202609210712').get()).data().delayedSync).toBe(true);
  });

  it('paused school-wide: inbox item skipped_paused, no push', async () => {
    await db().doc('settings/parent_portal').set({ notificationsPaused: true }, { merge: true });
    const m = fakeMessaging();
    await run(deps(m), 'k1_S1_202609210712', scanDoc());
    expect(m.sent).toHaveLength(0);
    expect((await db().doc('guardians/gA/inbox/k1_S1_202609210712').get()).data().pushStatus).toBe('skipped_paused');
  });

  it('rejects inactive device and unenrolled learner without projecting', async () => {
    expect((await run(deps(), 'k9_S1_202609210712', scanDoc({ deviceId: 'k9' }))).outcome).toBe('rejected:device');
    expect((await run(deps(), 'k1_S2_202609210712', scanDoc({ studentId: 'S2' }))).outcome).toBe('rejected:enrollment');
    expect((await db().collection('learners').get()).size).toBe(0);
  });

  it('dead token is deleted; other failures count up and disable at 5', async () => {
    await db().doc('guardians/gA/devices/tA2').set({ failureCount: 4 }, { merge: true });
    const m = fakeMessaging({ tokA1: 'messaging/registration-token-not-registered', tokA2: 'messaging/internal-error' });
    await run(deps(m), 'k1_S1_202609210712', scanDoc());
    expect((await db().doc('guardians/gA/devices/tA1').get()).exists).toBe(false);
    expect((await db().doc('guardians/gA/devices/tA2').get()).data()).toMatchObject({ failureCount: 5, enabled: false });
    expect((await db().doc('guardians/gA/inbox/k1_S1_202609210712').get()).data().pushStatus).toBe('failed');
  });

  it('staff void marks the original voided and notifies', async () => {
    const m = fakeMessaging();
    await run(deps(m), 'k1_S1_202609210712', scanDoc());
    await run(deps(m), 'staff_S1_202609210900_void', {
      studentId: 'S1', sectionId: 'SEC1', schoolYear: '2026-2027', kind: 'void', voidsEventId: 'k1_S1_202609210712',
      note: 'Borrowed ID', createdBy: 'registrar@bnhs.edu', deviceId: 'staff', scannedAt: ts('2026-09-21T09:00:00+08:00'),
      scannedDate: '2026-09-21', scannedTime: '09:00', receivedAt: ts('2026-09-21T09:00:01+08:00'), source: 'staff',
    });
    const ev = (await db().doc('learners/S1/events/k1_S1_202609210712').get()).data();
    expect(ev).toMatchObject({ status: 'voided', voidReason: 'Borrowed ID' });
    expect((await db().doc('learners/S1').get()).data().today.status).toBe('no_scan');
    const inbox = (await db().doc('guardians/gA/inbox/staff_S1_202609210900_void').get()).data();
    expect(inbox).toMatchObject({ kind: 'void', eventId: 'k1_S1_202609210712' });
    expect(m.sent).toHaveLength(2);
  });

  it('suppressPush (reconcile) records without sending', async () => {
    const m = fakeMessaging();
    await run(deps(m), 'k1_S1_202609210712', scanDoc(), { suppressPush: true });
    expect(m.sent).toHaveLength(0);
    expect((await db().doc('guardians/gA/inbox/k1_S1_202609210712').get()).data().pushStatus).toBe('skipped_suppressed');
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npm run test:functions`
Expected: FAIL — `handlers/scanEvent.js` not found.

- [ ] **Step 4: Implement `functions/src/handlers/push.js`**

```js
import { pushPayload } from '../lib/pushPayload.js';
import { Timestamp } from 'firebase-admin/firestore';

const DEAD = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-argument']);
export const MAX_FAILURES = 5;

// Sends the fixed push to every enabled device of one guardian and applies
// FCM's per-token verdicts to the device docs (spec §6 step 4).
export async function sendToGuardian({ db, messaging, portalUrl }, { guardianUid, inboxId, studentId }) {
  const devSnap = await db.collection(`guardians/${guardianUid}/devices`).where('enabled', '==', true).get();
  if (devSnap.empty) return { status: 'skipped_no_device', pruned: 0 };

  const tokens = devSnap.docs.map((d) => d.data().token);
  const res = await messaging.sendEachForMulticast(pushPayload({ tokens, inboxId, studentId, portalUrl }));

  const batch = db.batch();
  let pruned = 0, anySuccess = false;
  res.responses.forEach((r, i) => {
    const docSnap = devSnap.docs[i];
    if (r.success) { anySuccess = true; return; }
    if (DEAD.has(r.error?.code)) { batch.delete(docSnap.ref); pruned++; return; }
    const failureCount = (docSnap.data().failureCount || 0) + 1;
    const update = { failureCount };
    if (failureCount >= MAX_FAILURES) { update.enabled = false; update.disabledAt = Timestamp.now(); }
    batch.update(docSnap.ref, update);
  });
  await batch.commit();
  return { status: anySuccess ? 'sent' : 'failed', pruned };
}
```

- [ ] **Step 5: Implement `functions/src/handlers/scanEvent.js`**

```js
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { classifyEvent } from '../lib/classifyEvent.js';
import { recomputeSummary } from '../lib/recomputeSummary.js';
import { shouldPush, guardianPushGate } from '../lib/shouldPush.js';
import { cached } from '../cache.js';
import { logEvent, logWarn } from '../log.js';
import { sendToGuardian } from './push.js';
import { manilaDate } from '../../shared/dates.js';

const CACHE_MS = 30_000;
const RECENT_QUERY = 40;
const PENDING_RESEND_MS = 5 * 60 * 1000;

const sectionLabel = (s) => (s ? `Grade ${s.gradeLevel} – ${s.name}${s.strand ? ` · ${s.strand}` : ''}` : '');
const displayName = (s) => `${s.firstName} ${s.lastName}`.trim();

// Spec §5. The only writer of learners/* and guardians/*/inbox/*. Every step
// is keyed on eventId so a re-delivered trigger is a no-op.
export async function handleScanEvent({ db, messaging, portalUrl, now = () => new Date() }, { eventId, data, suppressPush = false }) {
  const t0 = Date.now();
  const { studentId, schoolYear, kind, deviceId, source } = data;
  const isStaff = source === 'staff';

  // 1. device
  const kiosk = isStaff ? { label: 'School office', active: true }
    : await cached(`kiosk:${deviceId}`, CACHE_MS, async () => (await db.doc(`kiosks/${deviceId}`).get()).data() || null);
  if (!kiosk || kiosk.active !== true) { logWarn('scan_rejected', { eventId, deviceId, reason: 'device' }); return { outcome: 'rejected:device' }; }

  // 2. enrollment
  const enrollment = (await db.doc(`enrollments/${studentId}_${schoolYear}`).get()).data();
  if (!enrollment || enrollment.status !== 'enrolled' || enrollment.sectionId !== data.sectionId) {
    logWarn('scan_rejected', { eventId, deviceId, reason: 'enrollment' }); return { outcome: 'rejected:enrollment' };
  }

  // 3. classify
  const cls = classifyEvent({ scannedAtMs: data.scannedAt.toMillis(), receivedAtMs: data.receivedAt.toMillis() });
  const todayDate = manilaDate(now());

  // 4. project + summary (transaction)
  const learnerRef = db.doc(`learners/${studentId}`);
  const eventRef = learnerRef.collection('events').doc(eventId);
  const [studentSnap, sectionSnap] = await Promise.all([db.doc(`students/${studentId}`).get(), db.doc(`sections/${enrollment.sectionId}`).get()]);
  const student = studentSnap.data();
  const learnerName = displayName(student);

  await db.runTransaction(async (tx) => {
    const recentSnap = await tx.get(learnerRef.collection('events').orderBy('effectiveAt', 'desc').limit(RECENT_QUERY));
    const existing = recentSnap.docs.map((d) => ({ id: d.id, ...d.data(), effectiveAtMs: d.data().effectiveAt.toMillis() }));

    if (kind === 'void') {
      const target = existing.find((e) => e.id === data.voidsEventId);
      const targetRef = learnerRef.collection('events').doc(data.voidsEventId);
      tx.set(targetRef, { status: 'voided', voidReason: data.note || '', voidedAt: Timestamp.now() }, { merge: true });
      if (target) target.status = 'voided';
    } else {
      const projected = {
        kind, scannedAt: data.scannedAt, scannedDate: data.scannedDate, scannedTime: data.scannedTime,
        receivedAt: data.receivedAt, effectiveAt: Timestamp.fromMillis(cls.effectiveAtMs),
        deviceLabel: kiosk.label, status: 'recorded', delayedSync: cls.delayedSync, clockSkew: cls.clockSkew, source,
        ...(isStaff ? { correctionNote: data.note || '' } : {}),
      };
      tx.set(eventRef, projected, { merge: true });
      const idx = existing.findIndex((e) => e.id === eventId);
      const row = { id: eventId, ...projected, effectiveAtMs: cls.effectiveAtMs };
      if (idx >= 0) existing[idx] = row; else existing.push(row);
    }

    const summary = recomputeSummary({ events: existing, todayDate });
    tx.set(learnerRef, {
      displayName: learnerName, sectionLabel: sectionLabel(sectionSnap.data()), schoolYear,
      today: summary.today, recent: summary.recent, updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  // 5.–6. fan-out + push
  const paused = await cached('settings:parent_portal', CACHE_MS, async () => (await db.doc('settings/parent_portal').get()).data()?.notificationsPaused === true);
  const learnerDoc = (await learnerRef.get()).data();
  const lastPush = learnerDoc.lastPush ? { kind: learnerDoc.lastPush.kind, atMs: learnerDoc.lastPush.at.toMillis() } : null;
  const eventGate = suppressPush ? { send: false, status: 'skipped_suppressed' }
    : shouldPush({ paused, delayedSync: cls.delayedSync, clockSkew: cls.clockSkew, lastPush, kind, nowMs: now().getTime() });

  const links = await db.collection('guardian_links').where('studentId', '==', studentId).where('status', '==', 'active').get();
  let pushesSent = 0, pushesFailed = 0, pruned = 0;
  for (const link of links.docs) {
    const uid = link.data().guardianUid;
    const inboxRef = db.doc(`guardians/${uid}/inbox/${eventId}`);
    const inboxSnap = await inboxRef.get();
    const prior = inboxSnap.data();
    if (prior && prior.pushStatus !== 'pending') continue;
    if (prior && prior.pushStatus === 'pending' && now().getTime() - prior.createdAt.toMillis() > PENDING_RESEND_MS) continue;

    const item = {
      type: 'attendance', studentId, learnerName, kind, scannedDate: data.scannedDate, scannedTime: data.scannedTime,
      eventId: kind === 'void' ? data.voidsEventId : eventId, createdAt: prior?.createdAt || FieldValue.serverTimestamp(), pushStatus: 'pending',
    };
    if (!eventGate.send) { await inboxRef.set({ ...item, pushStatus: eventGate.status }, { merge: true }); continue; }

    const guardian = (await db.doc(`guardians/${uid}`).get()).data() || {};
    const devCount = (await db.collection(`guardians/${uid}/devices`).where('enabled', '==', true).count().get()).data().count;
    const gGate = guardianPushGate({ notificationsEnabled: guardian.notificationsEnabled !== false, tokenCount: devCount });
    if (gGate) { await inboxRef.set({ ...item, pushStatus: gGate }, { merge: true }); continue; }

    if (!prior) await inboxRef.set(item);
    const res = await sendToGuardian({ db, messaging, portalUrl }, { guardianUid: uid, inboxId: eventId, studentId });
    pruned += res.pruned;
    if (res.status === 'sent') pushesSent++; else if (res.status === 'failed') pushesFailed++;
    await inboxRef.set({ pushStatus: res.status, pushSentAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  if (pushesSent > 0) await learnerRef.set({ lastPush: { kind, at: Timestamp.fromDate(now()) } }, { merge: true });

  logEvent('scan_processed', { eventId, deviceId, kind, source, delayedSync: cls.delayedSync, clockSkew: cls.clockSkew,
    guardians: links.size, pushesSent, pushesFailed, tokensPruned: pruned, latencyMs: Date.now() - t0 });
  return { outcome: 'processed' };
}
```

- [ ] **Step 6: Wire the trigger in `functions/index.js`**

```js
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { defineString } from 'firebase-functions/params';
import { db, messaging } from './src/admin.js';
import { handleScanEvent } from './src/handlers/scanEvent.js';

setGlobalOptions({ region: 'asia-southeast1', minInstances: 0, maxInstances: 10, memory: '256MiB' });

export const PORTAL_URL = defineString('PORTAL_URL', { default: 'https://bnhs-parent.web.app' });

const deps = () => ({ db, messaging, portalUrl: PORTAL_URL.value(), now: () => new Date() });

export const onScanEventCreated = onDocumentCreated({ document: 'scan_events/{eventId}', retry: true }, async (event) => {
  const snap = event.data;
  if (!snap) return;
  await handleScanEvent(deps(), { eventId: event.params.eventId, data: snap.data() });
});
```

- [ ] **Step 7: Run the emulator tests**

Run: `npm run test:functions`
Expected: PASS (9 tests). Also `npm --prefix functions test` still passes.

- [ ] **Step 8: Commit**

```bash
git add functions/
git commit -m "feat(functions): onScanEventCreated projects events, fans out inbox items and sends stubbed-tested push

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Parent-side rules tests

**Files:**
- Create: `tests/rules/parent.test.js`

**Interfaces:**
- Consumes: `tests/rules/helpers.js` (Task 3), `firestore.rules` (Task 3).

- [ ] **Step 1: Write the tests**

```js
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { setup, seedBaseline, as, ok, denied, seed, STAFF, KIOSK, GUARDIAN_A, GUARDIAN_B, GUARDIAN_UNVERIFIED, ANON } from './helpers.js';

let env;
beforeAll(async () => { env = await setup(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await seedBaseline(env); });

describe('learners', () => {
  it('linked guardian reads own learner; others denied', async () => {
    await ok(as(env, GUARDIAN_A).doc('learners/S1').get());
    await denied(as(env, GUARDIAN_A).doc('learners/S2').get());
    await denied(as(env, GUARDIAN_B).doc('learners/S1').get());          // revoked link
    await denied(as(env, GUARDIAN_UNVERIFIED).doc('learners/S1').get());
    await denied(as(env, KIOSK).doc('learners/S1').get());
    await denied(as(env, ANON).doc('learners/S1').get());
    await ok(as(env, STAFF).doc('learners/S1').get());
  });
  it('guardian cannot list learners or write', async () => {
    await denied(as(env, GUARDIAN_A).collection('learners').get());
    await denied(as(env, GUARDIAN_A).doc('learners/S1').set({ displayName: 'x' }, { merge: true }));
    await denied(as(env, STAFF).doc('learners/S1').set({ displayName: 'x' }, { merge: true }));
  });
  it('events: bounded list for linked guardian only; never writable', async () => {
    const col = (who) => as(env, who).collection('learners/S1/events');
    await ok(col(GUARDIAN_A).orderBy('effectiveAt', 'desc').limit(50).get());
    await denied(col(GUARDIAN_A).orderBy('effectiveAt', 'desc').limit(51).get());
    await denied(col(GUARDIAN_A).get());
    await denied(as(env, GUARDIAN_A).collection('learners/S2/events').limit(10).get());
    await denied(as(env, GUARDIAN_A).doc('learners/S1/events/e1').update({ status: 'voided' }));
  });
});

describe('guardians', () => {
  it('own profile: read yes, limited update, no create/delete', async () => {
    await ok(as(env, GUARDIAN_A).doc('guardians/gA').get());
    await ok(as(env, GUARDIAN_A).doc('guardians/gA').update({ notificationsEnabled: false, lastOpenedAt: new Date() }));
    await denied(as(env, GUARDIAN_A).doc('guardians/gA').update({ email: 'evil@x' }));
    await denied(as(env, GUARDIAN_A).doc('guardians/gA').delete());
    await denied(as(env, GUARDIAN_B).doc('guardians/gA').get());
    await denied(as(env, GUARDIAN_UNVERIFIED).doc('guardians/gU').set({ email: 'u@gmail.com' }));
    await ok(as(env, STAFF).doc('guardians/gA').get());
  });
  it('devices: own only, fixed shape', async () => {
    const good = { token: 'tok', platform: 'web', createdAt: new Date(), refreshedAt: new Date(), enabled: true, failureCount: 0 };
    await ok(as(env, GUARDIAN_A).doc('guardians/gA/devices/h1').set(good));
    await denied(as(env, GUARDIAN_A).doc('guardians/gA/devices/h2').set({ ...good, extra: 1 }));
    await denied(as(env, GUARDIAN_B).doc('guardians/gA/devices/h3').set(good));
    await ok(as(env, GUARDIAN_A).doc('guardians/gA/devices/h1').delete());
  });
  it('inbox: own bounded list, readAt only', async () => {
    await ok(as(env, GUARDIAN_A).collection('guardians/gA/inbox').orderBy('createdAt', 'desc').limit(20).get());
    await denied(as(env, GUARDIAN_A).collection('guardians/gA/inbox').get());
    await ok(as(env, GUARDIAN_A).doc('guardians/gA/inbox/e1').update({ readAt: new Date() }));
    await denied(as(env, GUARDIAN_A).doc('guardians/gA/inbox/e1').update({ pushStatus: 'sent' }));
    await denied(as(env, GUARDIAN_A).doc('guardians/gA/inbox/e2').set({ type: 'system' }));
    await denied(as(env, GUARDIAN_B).doc('guardians/gA/inbox/e1').get());
  });
});

describe('links, requests, reports, staff-only records', () => {
  it('guardian lists own links only; never writes', async () => {
    await ok(as(env, GUARDIAN_A).collection('guardian_links').where('guardianUid', '==', 'gA').limit(50).get());
    await denied(as(env, GUARDIAN_A).collection('guardian_links').limit(50).get());
    await denied(as(env, GUARDIAN_A).doc('guardian_links/gA_S2').set({ guardianUid: 'gA', studentId: 'S2', status: 'active' }));
    await ok(as(env, STAFF).collection('guardian_links').get());
  });
  it('requests and reports are readable by owner and staff, never client-written', async () => {
    await seed(env, async (db) => {
      await db.doc('access_requests/r1').set({ guardianUid: 'gA', status: 'open' });
      await db.doc('reports/p1').set({ guardianUid: 'gA', status: 'open' });
    });
    await ok(as(env, GUARDIAN_A).doc('access_requests/r1').get());
    await denied(as(env, GUARDIAN_B).doc('access_requests/r1').get());
    await denied(as(env, GUARDIAN_A).doc('access_requests/r2').set({ guardianUid: 'gA', status: 'open' }));
    await ok(as(env, GUARDIAN_A).collection('reports').where('guardianUid', '==', 'gA').limit(20).get());
    await denied(as(env, GUARDIAN_A).doc('reports/p2').set({ guardianUid: 'gA' }));
    await ok(as(env, STAFF).collection('reports').get());
  });
  it('activation_codes, audit_log staff-read only; rate_limits closed', async () => {
    await seed(env, async (db) => { await db.doc('activation_codes/h').set({ studentId: 'S1' }); await db.doc('audit_log/a').set({ action: 'x' }); await db.doc('rate_limits/gA').set({ activate: { count: 1 } }); });
    await ok(as(env, STAFF).doc('activation_codes/h').get());
    await denied(as(env, GUARDIAN_A).doc('activation_codes/h').get());
    await ok(as(env, STAFF).doc('audit_log/a').get());
    await denied(as(env, STAFF).doc('audit_log/b').set({ action: 'y' }));
    await denied(as(env, STAFF).doc('rate_limits/gA').get());
    await denied(as(env, GUARDIAN_A).doc('rate_limits/gA').get());
  });
});
```

- [ ] **Step 2: Run**

Run: `npm run test:rules`
Expected: PASS for all three rules files. If any assertion fails, the fix
belongs in `firestore.rules`, not in the test (the rules text in Task 3 is
the intended policy).

- [ ] **Step 3: Commit**

```bash
git add tests/rules/parent.test.js
git commit -m "test(rules): parent-side least-privilege matrix

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Phase 3 — Guardian actions (callables and scheduled jobs)

**Convention for every callable in this phase.** A handler is a plain async
function `handler(ctx, data)` with `ctx = { db, auth, now: () => Date, uid, email }`.
`functions/index.js` wraps each one with `onCall({ enforceAppCheck: true })`
plus the identity guard from `functions/src/callable.js`. Handlers throw
`CallableError(code, message)`; the wrapper converts it to `HttpsError`.
Emulator tests call the handlers directly, so no `firebase-functions-test`
is needed. Messages returned to clients are generic; specifics go to logs.

### Task 8: Callable guards, rate limiting, validators, activation-code primitives

**Files:**
- Create: `functions/src/errors.js`, `functions/src/callable.js`, `functions/src/audit.js`,
  `functions/src/lib/rateLimit.js` (+`.test.js`), `functions/src/lib/validators.js` (+`.test.js`),
  `functions/src/lib/activationCode.js` (+`.test.js`)

**Interfaces:**
- Produces:
  - `CallableError(code, message)` with `code` ∈ Firebase `HttpsError` codes
  - `guardianIdentity(req)` → `{uid, email}`; `staffIdentity(db, req)` → `{uid, email}`; `toHttpsError(err)`
  - `enforceRateLimit(db, uid, action, {windowMs, max}, nowMs)` — throws `CallableError('resource-exhausted')`
  - `LIMITS = { activate: {windowMs: 3600e3, max: 5}, report: {windowMs: 86400e3, max: 5}, issueCodes: {windowMs: 86400e3, max: 20} }`
  - `audit(db, {action, actorType, actorUid, targetType, targetId, details})`
  - `takeToken(state, {nowMs, windowMs, max})` → `{allowed, next}`
  - validators: `str(v, {name, min?, max?})`, `oneOf(v, allowed, name)`, `lrn(v)`, `bool(v, name)`, `int(v, {name, min, max})`, `hhmm(v, name)`, `ymd(v, name)`
  - `ALPHABET`, `generateCode(bytes)`, `normalizeCode(input)`, `isValidCode(code)`, `formatCode(code)`, `hashCode(code)`

- [ ] **Step 1: Write the failing tests**

`functions/src/lib/rateLimit.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { takeToken } from './rateLimit.js';
const W = 3600_000;
describe('takeToken', () => {
  it('starts a window on first use', () => {
    expect(takeToken(null, { nowMs: 1000, windowMs: W, max: 5 })).toEqual({ allowed: true, next: { count: 1, windowStartMs: 1000 } });
  });
  it('counts within the window and refuses at max', () => {
    let s = { count: 4, windowStartMs: 0 };
    const r = takeToken(s, { nowMs: 10, windowMs: W, max: 5 });
    expect(r.allowed).toBe(true); expect(r.next.count).toBe(5);
    expect(takeToken(r.next, { nowMs: 20, windowMs: W, max: 5 })).toEqual({ allowed: false, next: r.next });
  });
  it('resets after the window', () => {
    expect(takeToken({ count: 5, windowStartMs: 0 }, { nowMs: W, windowMs: W, max: 5 })).toEqual({ allowed: true, next: { count: 1, windowStartMs: W } });
  });
});
```

`functions/src/lib/validators.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { str, oneOf, lrn, bool, int, hhmm, ymd } from './validators.js';
describe('validators', () => {
  it('str trims and bounds', () => {
    expect(str('  hi ', { name: 'x', max: 5 })).toBe('hi');
    expect(() => str('toolong', { name: 'x', max: 3 })).toThrow(/x/);
    expect(() => str(5, { name: 'x' })).toThrow();
    expect(() => str('', { name: 'x', min: 1 })).toThrow();
  });
  it('oneOf / bool / int', () => {
    expect(oneOf('in', ['in', 'out'], 'kind')).toBe('in');
    expect(() => oneOf('void', ['in', 'out'], 'kind')).toThrow(/kind/);
    expect(bool(true, 'b')).toBe(true); expect(() => bool('true', 'b')).toThrow();
    expect(int(3, { name: 'n', min: 1, max: 5 })).toBe(3); expect(() => int(9, { name: 'n', min: 1, max: 5 })).toThrow();
  });
  it('lrn is exactly 12 digits', () => {
    expect(lrn('123456789012')).toBe('123456789012');
    expect(() => lrn('12345678901')).toThrow(); expect(() => lrn('12345678901a')).toThrow();
  });
  it('hhmm and ymd', () => {
    expect(hhmm('07:05', 't')).toBe('07:05'); expect(() => hhmm('7:05', 't')).toThrow(); expect(() => hhmm('25:00', 't')).toThrow();
    expect(ymd('2026-09-21', 'd')).toBe('2026-09-21'); expect(() => ymd('2026-9-21', 'd')).toThrow();
  });
});
```

`functions/src/lib/activationCode.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { ALPHABET, generateCode, normalizeCode, isValidCode, formatCode, hashCode } from './activationCode.js';
describe('activationCode', () => {
  it('alphabet is Crockford base32 without I L O U', () => {
    expect(ALPHABET).toHaveLength(32);
    for (const c of 'ILOU') expect(ALPHABET).not.toContain(c);
  });
  it('generates 8 chars from 8 bytes, uniformly (256 % 32 == 0)', () => {
    const code = generateCode(Uint8Array.from([0, 31, 32, 255, 1, 2, 3, 4]));
    expect(code).toBe('0ZZ71234'.replace('ZZ7', `${ALPHABET[31]}${ALPHABET[0]}${ALPHABET[31]}`));
    expect(isValidCode(code)).toBe(true);
  });
  it('normalizes what parents type', () => {
    expect(normalizeCode(' k7m4-p2xq ')).toBe('K7M4P2XQ');
    expect(normalizeCode('K7M4-P2XO')).toBe('K7M4P2X0');   // O → 0
    expect(normalizeCode('K7M4-P2XI')).toBe('K7M4P2X1');   // I → 1
    expect(isValidCode('K7M4P2XQ')).toBe(true);
    expect(isValidCode('K7M4P2X')).toBe(false);
  });
  it('formats and hashes deterministically', () => {
    expect(formatCode('K7M4P2XQ')).toBe('K7M4-P2XQ');
    expect(hashCode('K7M4P2XQ')).toBe(hashCode('K7M4P2XQ'));
    expect(hashCode('K7M4P2XQ')).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCode('K7M4P2XQ')).not.toBe(hashCode('K7M4P2XR'));
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm --prefix functions test`
Expected: FAIL — three new modules missing.

- [ ] **Step 3: Implement the libs**

`functions/src/errors.js`:

```js
// Thrown by handlers; converted to HttpsError at the function boundary so
// handlers stay testable without firebase-functions.
export class CallableError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
```

`functions/src/lib/rateLimit.js`:

```js
// Fixed-window counter. `state` is what rate_limits/{uid}.{action} holds.
export function takeToken(state, { nowMs, windowMs, max }) {
  if (!state || nowMs - state.windowStartMs >= windowMs) return { allowed: true, next: { count: 1, windowStartMs: nowMs } };
  if (state.count >= max) return { allowed: false, next: state };
  return { allowed: true, next: { count: state.count + 1, windowStartMs: state.windowStartMs } };
}
```

`functions/src/lib/validators.js`:

```js
import { CallableError } from '../errors.js';

const bad = (name, why) => new CallableError('invalid-argument', `${name} ${why}`);

export function str(v, { name, min = 0, max = 200 }) {
  if (typeof v !== 'string') throw bad(name, 'must be text');
  const t = v.trim();
  if (t.length < min) throw bad(name, 'is required');
  if (t.length > max) throw bad(name, `must be at most ${max} characters`);
  return t;
}
export function oneOf(v, allowed, name) { if (!allowed.includes(v)) throw bad(name, 'is not a valid choice'); return v; }
export function bool(v, name) { if (typeof v !== 'boolean') throw bad(name, 'must be true or false'); return v; }
export function int(v, { name, min, max }) {
  if (!Number.isInteger(v) || v < min || v > max) throw bad(name, `must be a whole number between ${min} and ${max}`);
  return v;
}
export function lrn(v) { const t = str(v, { name: 'LRN', max: 12 }); if (!/^\d{12}$/.test(t)) throw bad('LRN', 'must be 12 digits'); return t; }
export function hhmm(v, name) { const t = str(v, { name, max: 5 }); if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw bad(name, 'must be HH:MM'); return t; }
export function ymd(v, name) { const t = str(v, { name, max: 10 }); if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) throw bad(name, 'must be YYYY-MM-DD'); return t; }
```

`functions/src/lib/activationCode.js`:

```js
import { createHash } from 'node:crypto';

// Crockford base32: no I, L, O, U — nothing a parent can misread on paper.
export const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// 8 random bytes → 8 symbols. 256 is divisible by 32, so `byte % 32` is
// exactly uniform: ~2^40 codes.
export function generateCode(bytes) {
  return Array.from(bytes.subarray(0, 8), (b) => ALPHABET[b % 32]).join('');
}
export function normalizeCode(input) {
  return String(input || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}
export const isValidCode = (code) => /^[0-9A-HJKMNP-TV-Z]{8}$/.test(code);
export const formatCode = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;
export const hashCode = (code) => createHash('sha256').update(code).digest('hex');
```

`functions/src/audit.js`:

```js
import { FieldValue } from 'firebase-admin/firestore';

// One append per action (spec §8 "Audit log"). Never contains raw codes,
// tokens, or passwords.
export function audit(db, { action, actorType, actorUid, targetType, targetId, details = {} }) {
  return db.collection('audit_log').add({ action, actorType, actorUid: actorUid || null, targetType, targetId, details, at: FieldValue.serverTimestamp() });
}
```

`functions/src/callable.js`:

```js
import { HttpsError } from 'firebase-functions/v2/https';
import { CallableError } from './errors.js';
import { takeToken } from './lib/rateLimit.js';

export const LIMITS = {
  activate: { windowMs: 60 * 60 * 1000, max: 5 },
  report: { windowMs: 24 * 60 * 60 * 1000, max: 5 },
  issueCodes: { windowMs: 24 * 60 * 60 * 1000, max: 20 },
};
export const MAX_OPEN_REQUESTS = 3;

export function guardianIdentity(req) {
  if (!req.app) throw new CallableError('failed-precondition', 'App Check required');
  const t = req.auth?.token;
  if (!req.auth || t?.firebase?.sign_in_provider === 'anonymous') throw new CallableError('unauthenticated', 'Sign in required');
  if (!t.email_verified) throw new CallableError('failed-precondition', 'Verify your email first');
  return { uid: req.auth.uid, email: t.email, displayName: t.name || '' };
}

export async function staffIdentity(db, req) {
  if (!req.app) throw new CallableError('failed-precondition', 'App Check required');
  const email = req.auth?.token?.email?.toLowerCase();
  if (!email) throw new CallableError('unauthenticated', 'Sign in required');
  const staff = await db.doc(`users/${email}`).get();
  if (!staff.exists) throw new CallableError('permission-denied', 'Staff only');
  return { uid: req.auth.uid, email };
}

// Transactional fixed-window limiter on rate_limits/{uid}.{action}.
export async function enforceRateLimit(db, uid, action, { windowMs, max }, nowMs) {
  const ref = db.doc(`rate_limits/${uid}`);
  const allowed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const r = takeToken(snap.data()?.[action] || null, { nowMs, windowMs, max });
    tx.set(ref, { [action]: r.next }, { merge: true });
    return r.allowed;
  });
  if (!allowed) throw new CallableError('resource-exhausted', 'Too many attempts. Try again later.');
}

export function toHttpsError(err) {
  if (err instanceof CallableError) return new HttpsError(err.code, err.message);
  console.error(err);
  return new HttpsError('internal', 'Something went wrong. Please try again.');
}
```

- [ ] **Step 4: Run the tests**

Run: `npm --prefix functions test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src
git commit -m "feat(functions): callable guards, rate limiting, validators, activation-code primitives, audit helper

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Activation codes — issue, revoke, activate

**Files:**
- Create: `functions/src/handlers/codes.js`, `functions/test/emulator/codes.test.js`
- Modify: `functions/index.js`

**Interfaces:**
- Consumes: Task 8.
- Produces:
  - `issueActivationCodes(ctx, {sectionId, schoolYear})` → `{ slips: [{studentId, name, lrn, sectionLabel, code}], skipped: [{studentId, reason}] }`
  - `revokeCode(ctx, {studentId, schoolYear, reason})` → `{ revoked: n }`
  - `activateCode(ctx, {code, relationship, consentVersion})` → `{ studentId, displayName, sectionLabel }`
  - `RELATIONSHIPS` = `['Mother','Father','Guardian','Grandparent','Sibling','Other']`

- [ ] **Step 1: Write the failing emulator tests**

`functions/test/emulator/codes.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearAll, seedSchool } from './helpers.js';
import { issueActivationCodes, revokeCode, activateCode } from '../../src/handlers/codes.js';
import { hashCode } from '../../src/lib/activationCode.js';

const NOW = new Date('2026-09-21T08:00:00+08:00');
const staff = () => ({ db: db(), now: () => NOW, uid: 'staff1', email: 'registrar@bnhs.edu' });
const guardian = (uid = 'gNew') => ({ db: db(), now: () => NOW, uid, email: `${uid}@gmail.com`, displayName: 'Maria' });

beforeEach(async () => {
  await clearAll(); await seedSchool();
  await db().doc('users/registrar@bnhs.edu').set({ role: 'registrar' });
  await db().doc('enrollments/S2_2026-2027').set({ studentId: 'S2', sectionId: 'SEC1', schoolYear: '2026-2027', status: 'enrolled' });
});

describe('issueActivationCodes', () => {
  it('issues one code per enrolled learner, stores only hashes, skips restricted', async () => {
    await db().doc('students/S2').set({ activationRestricted: true }, { merge: true });
    const r = await issueActivationCodes(staff(), { sectionId: 'SEC1', schoolYear: '2026-2027' });
    expect(r.slips).toHaveLength(1);
    expect(r.slips[0]).toMatchObject({ studentId: 'S1', name: 'Cruz, Ana B.', lrn: '100000000001', sectionLabel: 'Grade 7 – Rizal' });
    expect(r.slips[0].code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(r.skipped).toEqual([{ studentId: 'S2', reason: 'restricted' }]);
    const codes = await db().collection('activation_codes').get();
    expect(codes.size).toBe(1);
    expect(codes.docs[0].id).toBe(hashCode(r.slips[0].code));
    expect(codes.docs[0].data()).toMatchObject({ studentId: 'S1', schoolYear: '2026-2027', status: 'issued', redemptions: 0, maxRedemptions: 2, issuedBy: 'registrar@bnhs.edu' });
    expect(JSON.stringify(codes.docs[0].data())).not.toContain(r.slips[0].code);
  });
  it('reissuing revokes the previous code', async () => {
    const a = await issueActivationCodes(staff(), { sectionId: 'SEC1', schoolYear: '2026-2027' });
    await issueActivationCodes(staff(), { sectionId: 'SEC1', schoolYear: '2026-2027' });
    expect((await db().doc(`activation_codes/${hashCode(a.slips.find((s) => s.studentId === 'S1').code)}`).get()).data().status).toBe('revoked');
  });
  it('enforces the staff daily limit', async () => {
    await db().doc('rate_limits/staff1').set({ issueCodes: { count: 20, windowStartMs: NOW.getTime() - 1000 } });
    await expect(issueActivationCodes(staff(), { sectionId: 'SEC1', schoolYear: '2026-2027' })).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
});

describe('activateCode', () => {
  const issue = async () => (await issueActivationCodes(staff(), { sectionId: 'SEC1', schoolYear: '2026-2027' })).slips.find((s) => s.studentId === 'S1').code;

  it('links the guardian, creates the profile with consent, counts the redemption, audits', async () => {
    const code = await issue();
    const r = await activateCode(guardian(), { code: code.toLowerCase(), relationship: 'Mother', consentVersion: 1 });
    expect(r).toEqual({ studentId: 'S1', displayName: 'Ana Cruz', sectionLabel: 'Grade 7 – Rizal' });
    expect((await db().doc('guardian_links/gNew_S1').get()).data()).toMatchObject({ guardianUid: 'gNew', studentId: 'S1', status: 'active', relationship: 'Mother', activatedVia: 'code', schoolYear: '2026-2027' });
    expect((await db().doc('guardians/gNew').get()).data()).toMatchObject({ email: 'gNew@gmail.com', consentVersion: 1, notificationsEnabled: true });
    expect((await db().doc(`activation_codes/${hashCode(code)}`).get()).data().redemptions).toBe(1);
    const audit = await db().collection('audit_log').where('action', '==', 'link.activated').get();
    expect(audit.size).toBe(1);
  });
  it('second guardian redeems; third is exhausted', async () => {
    const code = await issue();
    await activateCode(guardian('g1'), { code, relationship: 'Mother', consentVersion: 1 });
    await activateCode(guardian('g2'), { code, relationship: 'Father', consentVersion: 1 });
    expect((await db().doc(`activation_codes/${hashCode(code)}`).get()).data().status).toBe('exhausted');
    await expect(activateCode(guardian('g3'), { code, relationship: 'Guardian', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('rejects wrong consent version, unknown code, expired, revoked, restricted learner', async () => {
    const code = await issue();
    await expect(activateCode(guardian(), { code, relationship: 'Mother', consentVersion: 0 })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(activateCode(guardian(), { code: 'AAAAAAAA', relationship: 'Mother', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
    await db().doc(`activation_codes/${hashCode(code)}`).set({ expiresAt: new Date(NOW.getTime() - 1) }, { merge: true });
    await expect(activateCode(guardian(), { code, relationship: 'Mother', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
    await revokeCode(staff(), { studentId: 'S1', schoolYear: '2026-2027', reason: 'lost' });
    await expect(activateCode(guardian(), { code, relationship: 'Mother', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
    const code2 = await issue();
    await db().doc('students/S1').set({ activationRestricted: true }, { merge: true });
    await expect(activateCode(guardian(), { code: code2, relationship: 'Mother', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
  it('rate-limits after 5 attempts per hour', async () => {
    for (let i = 0; i < 5; i++) await expect(activateCode(guardian(), { code: 'AAAAAAAA', relationship: 'Mother', consentVersion: 1 })).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(activateCode(guardian(), { code: 'AAAAAAAA', relationship: 'Mother', consentVersion: 1 })).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
  it('re-activation after revocation flips the same link back to active', async () => {
    const code = await issue();
    await activateCode(guardian(), { code, relationship: 'Mother', consentVersion: 1 });
    await db().doc('guardian_links/gNew_S1').set({ status: 'revoked' }, { merge: true });
    const code2 = await issue();
    await activateCode(guardian(), { code: code2, relationship: 'Mother', consentVersion: 1 });
    expect((await db().doc('guardian_links/gNew_S1').get()).data().status).toBe('active');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test:functions`
Expected: FAIL — `handlers/codes.js` not found.

- [ ] **Step 3: Implement `functions/src/handlers/codes.js`**

```js
import { randomBytes } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { enforceRateLimit, LIMITS } from '../callable.js';
import { audit } from '../audit.js';
import { logEvent, logWarn } from '../log.js';
import { str, oneOf, int } from '../lib/validators.js';
import { generateCode, normalizeCode, isValidCode, hashCode } from '../lib/activationCode.js';

export const RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Sibling', 'Other'];
export const CODE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const MAX_REDEMPTIONS = 2;
const GENERIC = 'That code could not be used. Ask the registrar to reissue your slip.';

const sectionLabel = (s) => (s ? `Grade ${s.gradeLevel} – ${s.name}${s.strand ? ` · ${s.strand}` : ''}` : '');
const formalName = (s) => { const mi = s.middleName?.trim() ? ` ${s.middleName.trim()[0]}.` : ''; const ext = s.extName?.trim() ? ` ${s.extName.trim()}` : ''; return `${s.lastName}, ${s.firstName}${mi}${ext}`; };
const displayName = (s) => `${s.firstName} ${s.lastName}`.trim();

async function revokeIssuedCodes(db, studentId, schoolYear, by, reason) {
  const snap = await db.collection('activation_codes').where('studentId', '==', studentId).where('schoolYear', '==', schoolYear).get();
  const batch = db.batch(); let n = 0;
  snap.docs.forEach((d) => { if (d.data().status === 'issued') { batch.update(d.ref, { status: 'revoked', revokedAt: FieldValue.serverTimestamp(), revokedBy: by, revokedReason: reason }); n++; } });
  await batch.commit();
  return n;
}

// Staff. One code per enrolled learner of the section; previous issued codes
// for the same learner+SY are revoked. Raw codes are returned once for the
// print job and never stored (spec §3).
export async function issueActivationCodes(ctx, data) {
  const { db, now, email } = ctx;
  const sectionId = str(data.sectionId, { name: 'sectionId', min: 1, max: 64 });
  const schoolYear = str(data.schoolYear, { name: 'schoolYear', min: 9, max: 9 });
  await enforceRateLimit(db, ctx.uid, 'issueCodes', LIMITS.issueCodes, now().getTime());

  const section = (await db.doc(`sections/${sectionId}`).get()).data();
  if (!section) throw new CallableError('not-found', 'Section not found');
  const enrolled = await db.collection('enrollments').where('sectionId', '==', sectionId).where('schoolYear', '==', schoolYear).where('status', '==', 'enrolled').get();

  const slips = [], skipped = [];
  for (const e of enrolled.docs) {
    const studentId = e.data().studentId;
    const student = (await db.doc(`students/${studentId}`).get()).data();
    if (!student) { skipped.push({ studentId, reason: 'missing' }); continue; }
    if (student.activationRestricted === true) { skipped.push({ studentId, reason: 'restricted' }); continue; }
    await revokeIssuedCodes(db, studentId, schoolYear, email, 'reissued');
    const code = generateCode(randomBytes(8));
    await db.doc(`activation_codes/${hashCode(code)}`).set({
      studentId, schoolYear, issuedAt: FieldValue.serverTimestamp(), issuedBy: email,
      expiresAt: Timestamp.fromMillis(now().getTime() + CODE_TTL_MS), maxRedemptions: MAX_REDEMPTIONS, redemptions: 0, status: 'issued',
    });
    slips.push({ studentId, name: formalName(student), lrn: student.lrn, sectionLabel: sectionLabel(section), code });
  }
  await audit(db, { action: 'code.issued', actorType: 'staff', actorUid: email, targetType: 'section', targetId: sectionId, details: { schoolYear, count: slips.length, skipped: skipped.length } });
  logEvent('codes_issued', { sectionId, count: slips.length });
  return { slips, skipped };
}

export async function revokeCode(ctx, data) {
  const { db, email } = ctx;
  const studentId = str(data.studentId, { name: 'studentId', min: 1, max: 64 });
  const schoolYear = str(data.schoolYear, { name: 'schoolYear', min: 9, max: 9 });
  const reason = str(data.reason ?? '', { name: 'reason', max: 200 });
  const revoked = await revokeIssuedCodes(db, studentId, schoolYear, email, reason);
  await audit(db, { action: 'code.revoked', actorType: 'staff', actorUid: email, targetType: 'student', targetId: studentId, details: { schoolYear, reason, revoked } });
  return { revoked };
}

// Guardian. Every failure is the same generic message to the caller; the
// real reason is logged (spec §3 "Redemption").
export async function activateCode(ctx, data) {
  const { db, now, uid, email } = ctx;
  const nowMs = now().getTime();
  await enforceRateLimit(db, uid, 'activate', LIMITS.activate, nowMs);
  const relationship = oneOf(data.relationship, RELATIONSHIPS, 'relationship');
  const consentVersion = int(data.consentVersion, { name: 'consentVersion', min: 0, max: 1000 });
  const code = normalizeCode(data.code);

  const fail = (reason) => { logWarn('activation_failed', { uid, reason, codeHash: isValidCode(code) ? hashCode(code) : null }); return new CallableError('failed-precondition', GENERIC); };
  if (!isValidCode(code)) throw fail('format');

  const portal = (await db.doc('settings/parent_portal').get()).data() || {};
  if ((portal.consentVersion ?? 1) !== consentVersion) throw fail('consent');
  const schoolYear = (await db.doc('settings/app').get()).data()?.currentSchoolYear;

  const codeRef = db.doc(`activation_codes/${hashCode(code)}`);
  const codeDoc = (await codeRef.get()).data();
  if (!codeDoc) throw fail('unknown');
  if (codeDoc.status !== 'issued') throw fail(codeDoc.status);
  if (codeDoc.expiresAt.toMillis() < nowMs) throw fail('expired');
  if (codeDoc.schoolYear !== schoolYear) throw fail('school-year');

  const { studentId } = codeDoc;
  const [studentSnap, enrollSnap] = await Promise.all([db.doc(`students/${studentId}`).get(), db.doc(`enrollments/${studentId}_${schoolYear}`).get()]);
  const student = studentSnap.data(); const enrollment = enrollSnap.data();
  if (!student || student.activationRestricted === true) throw fail('restricted');
  if (!enrollment || enrollment.status !== 'enrolled') throw fail('not-enrolled');
  const section = (await db.doc(`sections/${enrollment.sectionId}`).get()).data();

  const linkRef = db.doc(`guardian_links/${uid}_${studentId}`);
  const profileRef = db.doc(`guardians/${uid}`);
  await db.runTransaction(async (tx) => {
    const [c, link, profile] = await Promise.all([tx.get(codeRef), tx.get(linkRef), tx.get(profileRef)]);
    const cd = c.data();
    if (cd.status !== 'issued' || cd.redemptions >= cd.maxRedemptions) throw fail('exhausted');
    const alreadyActive = link.exists && link.data().status === 'active';
    const redemptions = alreadyActive ? cd.redemptions : cd.redemptions + 1;
    tx.update(codeRef, { redemptions, status: redemptions >= cd.maxRedemptions ? 'exhausted' : 'issued', lastRedeemedAt: FieldValue.serverTimestamp() });
    tx.set(linkRef, {
      guardianUid: uid, studentId, schoolYear, relationship, status: 'active', activatedAt: FieldValue.serverTimestamp(), activatedVia: 'code',
      revokedAt: FieldValue.delete(), revokedBy: FieldValue.delete(), revokedReason: FieldValue.delete(),
    }, { merge: true });
    if (!profile.exists) {
      tx.set(profileRef, { email, displayName: ctx.displayName || '', consentAcceptedAt: FieldValue.serverTimestamp(), consentVersion, notificationsEnabled: true, createdAt: FieldValue.serverTimestamp() });
    } else if (profile.data().consentVersion !== consentVersion) {
      tx.update(profileRef, { consentAcceptedAt: FieldValue.serverTimestamp(), consentVersion });
    }
  });
  await audit(db, { action: 'link.activated', actorType: 'guardian', actorUid: uid, targetType: 'student', targetId: studentId, details: { via: 'code', relationship, codeHash: hashCode(code) } });
  logEvent('activation_succeeded', { uid, studentId });
  return { studentId, displayName: displayName(student), sectionLabel: sectionLabel(section) };
}
```

- [ ] **Step 4: Export from `functions/index.js`**

Add:

```js
import { onCall } from 'firebase-functions/v2/https';
import { auth } from './src/admin.js';
import { guardianIdentity, staffIdentity, toHttpsError } from './src/callable.js';
import { issueActivationCodes, revokeCode, activateCode } from './src/handlers/codes.js';

const callDeps = () => ({ db, auth, now: () => new Date() });
const guardianCall = (fn) => onCall({ enforceAppCheck: true }, async (req) => {
  try { return await fn({ ...callDeps(), ...guardianIdentity(req) }, req.data || {}); } catch (e) { throw toHttpsError(e); }
});
const staffCall = (fn) => onCall({ enforceAppCheck: true }, async (req) => {
  try { return await fn({ ...callDeps(), ...(await staffIdentity(db, req)) }, req.data || {}); } catch (e) { throw toHttpsError(e); }
});

export const issueActivationCodesFn = staffCall(issueActivationCodes);
export const revokeCodeFn = staffCall(revokeCode);
export const activateCodeFn = guardianCall(activateCode);
```

Client-facing callable names are the export names (`activateCodeFn`, etc.);
the parent app and SIMS use exactly these names.

- [ ] **Step 5: Run the tests**

Run: `npm run test:functions`
Expected: PASS (codes + scanEvent suites).

- [ ] **Step 6: Commit**

```bash
git add functions/
git commit -m "feat(functions): issue, revoke and redeem activation codes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Access requests, link revocation, kiosk registration

**Files:**
- Create: `functions/src/handlers/links.js`, `functions/src/handlers/kiosks.js`, `functions/test/emulator/links.test.js`
- Modify: `functions/index.js`

**Interfaces:**
- Produces:
  - `requestAccess(ctx, {studentLrn, learnerNameTyped, relationship, contactNumber, message})` → `{ id }`
  - `resolveAccessRequest(ctx, {id, approve, studentId?, note})` → `{ status }`
  - `revokeLink(ctx, {linkId, reason})` → `{ ok: true }`
  - `setActivationRestricted(ctx, {studentId, restricted, reason})` → `{ revokedLinks }`
  - `registerKiosk(ctx, {uid, label})` → `{ ok: true }`; `deactivateKiosk(ctx, {uid, reason})` → `{ ok: true }`
  - `systemInbox(db, uid, {title, body})` helper (exported from `links.js`) used by later tasks.

- [ ] **Step 1: Write the failing tests**

`functions/test/emulator/links.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearAll, seedSchool } from './helpers.js';
import { requestAccess, resolveAccessRequest, revokeLink, setActivationRestricted } from '../../src/handlers/links.js';
import { registerKiosk, deactivateKiosk } from '../../src/handlers/kiosks.js';

const NOW = new Date('2026-09-21T08:00:00+08:00');
const staff = () => ({ db: db(), now: () => NOW, uid: 'staff1', email: 'registrar@bnhs.edu' });
const guardian = (uid = 'gNew') => ({ db: db(), now: () => NOW, uid, email: `${uid}@gmail.com`, displayName: 'Maria' });
const req = { studentLrn: '100000000001', learnerNameTyped: 'Ana Cruz', relationship: 'Guardian', contactNumber: '09171234567', message: 'Lost slip' };

beforeEach(async () => { await clearAll(); await seedSchool(); await db().doc('users/registrar@bnhs.edu').set({ role: 'registrar' }); });

describe('access requests', () => {
  it('creates an open request; max 3 open per guardian', async () => {
    const { id } = await requestAccess(guardian(), req);
    expect((await db().doc(`access_requests/${id}`).get()).data()).toMatchObject({ guardianUid: 'gNew', guardianEmail: 'gNew@gmail.com', studentLrn: '100000000001', status: 'open' });
    await requestAccess(guardian(), req); await requestAccess(guardian(), req);
    await expect(requestAccess(guardian(), req)).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
  it('approval creates the link via staff and a system inbox item; denial records a note', async () => {
    const { id } = await requestAccess(guardian(), req);
    await resolveAccessRequest(staff(), { id, approve: true, studentId: 'S1', note: 'ID checked' });
    expect((await db().doc('guardian_links/gNew_S1').get()).data()).toMatchObject({ status: 'active', activatedVia: 'staff', relationship: 'Guardian' });
    expect((await db().doc(`access_requests/${id}`).get()).data()).toMatchObject({ status: 'approved', resolvedBy: 'registrar@bnhs.edu' });
    const inbox = await db().collection('guardians/gNew/inbox').get();
    expect(inbox.docs[0].data()).toMatchObject({ type: 'system', pushStatus: 'skipped_suppressed' });

    const { id: id2 } = await requestAccess(guardian('g2'), req);
    await resolveAccessRequest(staff(), { id: id2, approve: false, note: 'Not on record' });
    expect((await db().doc(`access_requests/${id2}`).get()).data().status).toBe('denied');
    expect((await db().doc('guardian_links/g2_S1').get()).exists).toBe(false);
  });
});

describe('revokeLink / restricted', () => {
  it('revokes with reason and audits', async () => {
    await revokeLink(staff(), { linkId: 'gA_S1', reason: 'Custody order' });
    expect((await db().doc('guardian_links/gA_S1').get()).data()).toMatchObject({ status: 'revoked', revokedBy: 'registrar@bnhs.edu', revokedReason: 'Custody order' });
    expect((await db().collection('audit_log').where('action', '==', 'link.revoked').get()).size).toBe(1);
  });
  it('restricting a learner revokes every active link and blocks slips', async () => {
    const r = await setActivationRestricted(staff(), { studentId: 'S1', restricted: true, reason: 'Court order' });
    expect(r.revokedLinks).toBe(2);
    expect((await db().doc('students/S1').get()).data().activationRestricted).toBe(true);
    expect((await db().doc('guardian_links/gB_S1').get()).data().status).toBe('revoked');
  });
});

describe('kiosks', () => {
  it('registers and deactivates a device with audit entries', async () => {
    await registerKiosk(staff(), { uid: 'kNew', label: 'Gate 2' });
    expect((await db().doc('kiosks/kNew').get()).data()).toMatchObject({ label: 'Gate 2', active: true, createdBy: 'registrar@bnhs.edu' });
    await deactivateKiosk(staff(), { uid: 'kNew', reason: 'stolen' });
    expect((await db().doc('kiosks/kNew').get()).data().active).toBe(false);
    expect((await db().collection('audit_log').where('targetId', '==', 'kNew').get()).size).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test:functions`
Expected: FAIL — `handlers/links.js`, `handlers/kiosks.js` missing.

- [ ] **Step 3: Implement `functions/src/handlers/links.js`**

```js
import { FieldValue } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { MAX_OPEN_REQUESTS } from '../callable.js';
import { audit } from '../audit.js';
import { logEvent } from '../log.js';
import { str, oneOf, bool, lrn } from '../lib/validators.js';
import { RELATIONSHIPS } from './codes.js';

// A non-attendance inbox item. Never pushed (system messages are read when
// the guardian next opens the portal).
export function systemInbox(db, uid, { title, body, studentId = null }) {
  return db.collection(`guardians/${uid}/inbox`).add({ type: 'system', title, body, studentId, createdAt: FieldValue.serverTimestamp(), pushStatus: 'skipped_suppressed' });
}

export async function requestAccess(ctx, data) {
  const { db, uid, email } = ctx;
  const open = await db.collection('access_requests').where('guardianUid', '==', uid).where('status', '==', 'open').count().get();
  if (open.data().count >= MAX_OPEN_REQUESTS) throw new CallableError('resource-exhausted', 'You already have requests waiting for review.');
  const doc = {
    guardianUid: uid, guardianEmail: email,
    studentLrn: lrn(data.studentLrn),
    learnerNameTyped: str(data.learnerNameTyped, { name: 'Learner name', min: 2, max: 120 }),
    relationship: oneOf(data.relationship, RELATIONSHIPS, 'relationship'),
    contactNumber: str(data.contactNumber, { name: 'Contact number', min: 7, max: 20 }),
    message: str(data.message ?? '', { name: 'Message', max: 500 }),
    status: 'open', createdAt: FieldValue.serverTimestamp(),
  };
  const ref = await db.collection('access_requests').add(doc);
  logEvent('access_requested', { uid, id: ref.id });
  return { id: ref.id };
}

export async function resolveAccessRequest(ctx, data) {
  const { db, email } = ctx;
  const id = str(data.id, { name: 'id', min: 1, max: 64 });
  const approve = bool(data.approve, 'approve');
  const note = str(data.note ?? '', { name: 'note', max: 500 });
  const ref = db.doc(`access_requests/${id}`);
  const request = (await ref.get()).data();
  if (!request || request.status !== 'open') throw new CallableError('failed-precondition', 'Request is not open');

  if (approve) {
    const studentId = str(data.studentId, { name: 'studentId', min: 1, max: 64 });
    const schoolYear = (await db.doc('settings/app').get()).data()?.currentSchoolYear;
    const enrollment = (await db.doc(`enrollments/${studentId}_${schoolYear}`).get()).data();
    if (!enrollment || enrollment.status !== 'enrolled') throw new CallableError('failed-precondition', 'Learner is not enrolled this school year');
    await db.doc(`guardian_links/${request.guardianUid}_${studentId}`).set({
      guardianUid: request.guardianUid, studentId, schoolYear, relationship: request.relationship, status: 'active',
      activatedAt: FieldValue.serverTimestamp(), activatedVia: 'staff',
      revokedAt: FieldValue.delete(), revokedBy: FieldValue.delete(), revokedReason: FieldValue.delete(),
    }, { merge: true });
    const profileRef = db.doc(`guardians/${request.guardianUid}`);
    if (!(await profileRef.get()).exists) {
      await profileRef.set({ email: request.guardianEmail, displayName: '', consentAcceptedAt: null, consentVersion: 0, notificationsEnabled: true, createdAt: FieldValue.serverTimestamp() });
    }
    await systemInbox(db, request.guardianUid, { title: 'Access approved', body: 'The registrar approved your request. Your learner now appears on your home screen.', studentId });
  } else {
    await systemInbox(db, request.guardianUid, { title: 'Access request not approved', body: note ? `The registrar could not approve your request: ${note}` : 'The registrar could not approve your request. Please visit the school.' });
  }
  await ref.update({ status: approve ? 'approved' : 'denied', resolvedAt: FieldValue.serverTimestamp(), resolvedBy: email, resolutionNote: note, ...(approve ? { studentId: data.studentId } : {}) });
  await audit(db, { action: approve ? 'access.approved' : 'access.denied', actorType: 'staff', actorUid: email, targetType: 'access_request', targetId: id, details: { guardianUid: request.guardianUid, studentId: data.studentId || null, note } });
  return { status: approve ? 'approved' : 'denied' };
}

async function revokeOne(db, linkRef, by, reason) {
  await linkRef.set({ status: 'revoked', revokedAt: FieldValue.serverTimestamp(), revokedBy: by, revokedReason: reason }, { merge: true });
}

export async function revokeLink(ctx, data) {
  const { db, email } = ctx;
  const linkId = str(data.linkId, { name: 'linkId', min: 3, max: 130 });
  const reason = str(data.reason, { name: 'reason', min: 1, max: 300 });
  const ref = db.doc(`guardian_links/${linkId}`);
  const link = (await ref.get()).data();
  if (!link) throw new CallableError('not-found', 'Link not found');
  await revokeOne(db, ref, email, reason);
  await systemInbox(db, link.guardianUid, { title: 'Access ended', body: 'Your access to a learner has ended. Contact the registrar if you believe this is a mistake.', studentId: link.studentId });
  await audit(db, { action: 'link.revoked', actorType: 'staff', actorUid: email, targetType: 'guardian_link', targetId: linkId, details: { reason } });
  return { ok: true };
}

export async function setActivationRestricted(ctx, data) {
  const { db, email } = ctx;
  const studentId = str(data.studentId, { name: 'studentId', min: 1, max: 64 });
  const restricted = bool(data.restricted, 'restricted');
  const reason = str(data.reason ?? '', { name: 'reason', max: 300 });
  await db.doc(`students/${studentId}`).set({ activationRestricted: restricted }, { merge: true });
  let revokedLinks = 0;
  if (restricted) {
    const active = await db.collection('guardian_links').where('studentId', '==', studentId).where('status', '==', 'active').get();
    for (const d of active.docs) { await revokeOne(db, d.ref, email, `restricted: ${reason}`); revokedLinks++; }
    const codes = await db.collection('activation_codes').where('studentId', '==', studentId).get();
    for (const c of codes.docs) if (c.data().status === 'issued') await c.ref.update({ status: 'revoked', revokedAt: FieldValue.serverTimestamp(), revokedBy: email, revokedReason: 'restricted' });
  }
  await audit(db, { action: restricted ? 'student.restricted' : 'student.unrestricted', actorType: 'staff', actorUid: email, targetType: 'student', targetId: studentId, details: { reason, revokedLinks } });
  return { revokedLinks };
}
```

`functions/src/handlers/kiosks.js`:

```js
import { FieldValue } from 'firebase-admin/firestore';
import { audit } from '../audit.js';
import { str } from '../lib/validators.js';

export async function registerKiosk(ctx, data) {
  const { db, email } = ctx;
  const uid = str(data.uid, { name: 'uid', min: 4, max: 128 });
  const label = str(data.label, { name: 'label', min: 2, max: 40 });
  await db.doc(`kiosks/${uid}`).set({ label, active: true, createdBy: email, createdAt: FieldValue.serverTimestamp() }, { merge: true });
  await audit(db, { action: 'kiosk.registered', actorType: 'staff', actorUid: email, targetType: 'kiosk', targetId: uid, details: { label } });
  return { ok: true };
}

export async function deactivateKiosk(ctx, data) {
  const { db, email } = ctx;
  const uid = str(data.uid, { name: 'uid', min: 4, max: 128 });
  const reason = str(data.reason ?? '', { name: 'reason', max: 200 });
  await db.doc(`kiosks/${uid}`).set({ active: false, deactivatedAt: FieldValue.serverTimestamp(), deactivatedBy: email }, { merge: true });
  await audit(db, { action: 'kiosk.deactivated', actorType: 'staff', actorUid: email, targetType: 'kiosk', targetId: uid, details: { reason } });
  return { ok: true };
}
```

- [ ] **Step 4: Export from `functions/index.js`**

```js
import { requestAccess, resolveAccessRequest, revokeLink, setActivationRestricted } from './src/handlers/links.js';
import { registerKiosk, deactivateKiosk } from './src/handlers/kiosks.js';

export const requestAccessFn = guardianCall(requestAccess);
export const resolveAccessRequestFn = staffCall(resolveAccessRequest);
export const revokeLinkFn = staffCall(revokeLink);
export const setActivationRestrictedFn = staffCall(setActivationRestricted);
export const registerKioskFn = staffCall(registerKiosk);
export const deactivateKioskFn = staffCall(deactivateKiosk);
```

- [ ] **Step 5: Run the tests, then commit**

Run: `npm run test:functions` — Expected: PASS.

```bash
git add functions/
git commit -m "feat(functions): access requests, link revocation, custody restriction, kiosk registration

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Reports, corrections, account deletion

**Files:**
- Create: `functions/src/handlers/reports.js`, `functions/src/handlers/account.js`, `functions/test/emulator/reports.test.js`
- Modify: `functions/index.js`

**Interfaces:**
- Produces:
  - `submitReport(ctx, {studentId, eventId, reason, message})` → `{ id }`; `REPORT_REASONS = ['wrong_time','not_this_learner','missing_event','other']`
  - `resolveReport(ctx, {id, note, action})` → `{ ok }` with `action ∈ ['none','voided','corrected']`
  - `correctEvent(ctx, {studentId, eventId, reason})` → `{ voidEventId }` — writes a `source: staff, kind: void` scan event
  - `addManualEvent(ctx, {studentId, kind, date, time, reason})` → `{ eventId }` — writes a `source: staff` in/out scan event
  - `deleteGuardianAccount(ctx, {})` → `{ ok }`

- [ ] **Step 1: Write the failing tests**

`functions/test/emulator/reports.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearAll, seedSchool, fakeMessaging, scanDoc } from './helpers.js';
import { handleScanEvent } from '../../src/handlers/scanEvent.js';
import { submitReport, resolveReport, correctEvent, addManualEvent } from '../../src/handlers/reports.js';
import { deleteGuardianAccount } from '../../src/handlers/account.js';
import { clearCache } from '../../src/cache.js';

const NOW = new Date('2026-09-21T09:00:00+08:00');
const staff = () => ({ db: db(), now: () => NOW, uid: 'staff1', email: 'registrar@bnhs.edu' });
const gA = () => ({ db: db(), now: () => NOW, uid: 'gA', email: 'a@x' });
const fakeAuth = () => ({ deleted: [], async deleteUser(uid) { this.deleted.push(uid); } });
const EV = 'k1_S1_202609210712';

beforeEach(async () => {
  await clearAll(); clearCache(); await seedSchool();
  await db().doc('users/registrar@bnhs.edu').set({ role: 'registrar' });
  await db().doc(`scan_events/${EV}`).set(scanDoc());
  await handleScanEvent({ db: db(), messaging: fakeMessaging(), portalUrl: 'https://p.test', now: () => NOW }, { eventId: EV, data: scanDoc() });
});

describe('reports', () => {
  it('linked guardian files a report on own learner; 5/day limit; unlinked learner refused', async () => {
    const { id } = await submitReport(gA(), { studentId: 'S1', eventId: EV, reason: 'wrong_time', message: 'She was late' });
    expect((await db().doc(`reports/${id}`).get()).data()).toMatchObject({ guardianUid: 'gA', studentId: 'S1', eventId: EV, reason: 'wrong_time', status: 'open' });
    await expect(submitReport(gA(), { studentId: 'S2', eventId: EV, reason: 'other', message: '' })).rejects.toMatchObject({ code: 'permission-denied' });
    for (let i = 0; i < 4; i++) await submitReport(gA(), { studentId: 'S1', eventId: EV, reason: 'other', message: '' });
    await expect(submitReport(gA(), { studentId: 'S1', eventId: EV, reason: 'other', message: '' })).rejects.toMatchObject({ code: 'resource-exhausted' });
  });
  it('resolution notifies the guardian via a system inbox item', async () => {
    const { id } = await submitReport(gA(), { studentId: 'S1', eventId: EV, reason: 'wrong_time', message: '' });
    await resolveReport(staff(), { id, note: 'Checked the gate log; the time is correct.', action: 'none' });
    expect((await db().doc(`reports/${id}`).get()).data()).toMatchObject({ status: 'resolved', resolutionAction: 'none', resolvedBy: 'registrar@bnhs.edu' });
    const sys = (await db().collection('guardians/gA/inbox').where('type', '==', 'system').get()).docs[0].data();
    expect(sys.body).toContain('the time is correct');
    expect(JSON.stringify(sys)).not.toContain('registrar@bnhs.edu');
  });
});

describe('corrections', () => {
  it('correctEvent writes a staff void scan_event referencing the original', async () => {
    const { voidEventId } = await correctEvent(staff(), { studentId: 'S1', eventId: EV, reason: 'Borrowed ID' });
    const ev = (await db().doc(`scan_events/${voidEventId}`).get()).data();
    expect(ev).toMatchObject({ source: 'staff', kind: 'void', voidsEventId: EV, studentId: 'S1', sectionId: 'SEC1', note: 'Borrowed ID', createdBy: 'registrar@bnhs.edu', deviceId: 'staff' });
    expect(voidEventId.startsWith('staff_S1_')).toBe(true);
  });
  it('addManualEvent writes a staff in/out scan_event for a date and time', async () => {
    const { eventId } = await addManualEvent(staff(), { studentId: 'S1', kind: 'out', date: '2026-09-21', time: '16:05', reason: 'Kiosk was down' });
    const ev = (await db().doc(`scan_events/${eventId}`).get()).data();
    expect(ev).toMatchObject({ source: 'staff', kind: 'out', scannedDate: '2026-09-21', scannedTime: '16:05', note: 'Kiosk was down' });
    expect(ev.scannedAt.toDate().toISOString()).toBe('2026-09-21T08:05:00.000Z');
    await expect(addManualEvent(staff(), { studentId: 'S2', kind: 'in', date: '2026-09-21', time: '07:00', reason: 'x' })).rejects.toMatchObject({ code: 'failed-precondition' });
  });
});

describe('deleteGuardianAccount', () => {
  it('revokes links, deletes profile/devices/inbox and the auth user; audit stays', async () => {
    const auth = fakeAuth();
    await deleteGuardianAccount({ ...gA(), auth }, {});
    expect((await db().doc('guardians/gA').get()).exists).toBe(false);
    expect((await db().collection('guardians/gA/devices').get()).size).toBe(0);
    expect((await db().collection('guardians/gA/inbox').get()).size).toBe(0);
    expect((await db().doc('guardian_links/gA_S1').get()).data().status).toBe('revoked');
    expect(auth.deleted).toEqual(['gA']);
    expect((await db().collection('audit_log').where('action', '==', 'guardian.deleted').get()).size).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test:functions` — Expected: FAIL, modules missing.

- [ ] **Step 3: Implement `functions/src/handlers/reports.js`**

```js
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { CallableError } from '../errors.js';
import { enforceRateLimit, LIMITS } from '../callable.js';
import { audit } from '../audit.js';
import { logEvent } from '../log.js';
import { str, oneOf, hhmm, ymd } from '../lib/validators.js';
import { systemInbox } from './links.js';

export const REPORT_REASONS = ['wrong_time', 'not_this_learner', 'missing_event', 'other'];
export const RESOLUTION_ACTIONS = ['none', 'voided', 'corrected'];

async function assertActiveLink(db, uid, studentId) {
  const link = (await db.doc(`guardian_links/${uid}_${studentId}`).get()).data();
  if (!link || link.status !== 'active') throw new CallableError('permission-denied', 'You are not linked to this learner');
}

export async function submitReport(ctx, data) {
  const { db, now, uid } = ctx;
  await enforceRateLimit(db, uid, 'report', LIMITS.report, now().getTime());
  const studentId = str(data.studentId, { name: 'studentId', min: 1, max: 64 });
  await assertActiveLink(db, uid, studentId);
  const doc = {
    guardianUid: uid, studentId,
    eventId: str(data.eventId ?? '', { name: 'eventId', max: 200 }),
    reason: oneOf(data.reason, REPORT_REASONS, 'reason'),
    message: str(data.message ?? '', { name: 'message', max: 500 }),
    status: 'open', createdAt: FieldValue.serverTimestamp(),
  };
  const ref = await db.collection('reports').add(doc);
  logEvent('report_submitted', { uid, studentId, reason: doc.reason });
  return { id: ref.id };
}

export async function resolveReport(ctx, data) {
  const { db, email } = ctx;
  const id = str(data.id, { name: 'id', min: 1, max: 64 });
  const note = str(data.note, { name: 'note', min: 1, max: 500 });
  const action = oneOf(data.action, RESOLUTION_ACTIONS, 'action');
  const ref = db.doc(`reports/${id}`);
  const report = (await ref.get()).data();
  if (!report || report.status !== 'open') throw new CallableError('failed-precondition', 'Report is not open');
  await ref.update({ status: 'resolved', resolvedAt: FieldValue.serverTimestamp(), resolvedBy: email, resolutionNote: note, resolutionAction: action });
  await systemInbox(db, report.guardianUid, { title: 'Your report was reviewed', body: `The school reviewed your report: ${note}`, studentId: report.studentId });
  await audit(db, { action: 'report.resolved', actorType: 'staff', actorUid: email, targetType: 'report', targetId: id, details: { action } });
  return { ok: true };
}

// Staff corrections are themselves scan_events (source: staff) so the same
// trigger projects them and the raw log stays the single history (spec §5).
function staffEvent({ studentId, sectionId, schoolYear, kind, scannedAt, extra, email }) {
  const scannedDate = ymdOf(scannedAt); const scannedTime = hhmmOf(scannedAt);
  return {
    studentId, sectionId, schoolYear, kind, deviceId: 'staff', scannedAt: Timestamp.fromDate(scannedAt), scannedDate, scannedTime,
    receivedAt: FieldValue.serverTimestamp(), source: 'staff', createdBy: email, ...extra,
  };
}
const manila = (d) => new Date(d.getTime() + 8 * 3600_000);   // Manila wall time as a UTC Date
const ymdOf = (d) => manila(d).toISOString().slice(0, 10);
const hhmmOf = (d) => manila(d).toISOString().slice(11, 16);
const stampOf = (d) => manila(d).toISOString().replace(/[-:T]/g, '').slice(0, 12); // YYYYMMDDHHMM, timezone-independent
const manilaDateTime = (ymdStr, hhmmStr) => new Date(`${ymdStr}T${hhmmStr}:00+08:00`);

async function enrolledSection(db, studentId) {
  const schoolYear = (await db.doc('settings/app').get()).data()?.currentSchoolYear;
  const e = (await db.doc(`enrollments/${studentId}_${schoolYear}`).get()).data();
  if (!e || e.status !== 'enrolled') throw new CallableError('failed-precondition', 'Learner is not enrolled this school year');
  return { schoolYear, sectionId: e.sectionId };
}

export async function correctEvent(ctx, data) {
  const { db, now, email } = ctx;
  const studentId = str(data.studentId, { name: 'studentId', min: 1, max: 64 });
  const eventId = str(data.eventId, { name: 'eventId', min: 1, max: 200 });
  const reason = str(data.reason, { name: 'reason', min: 1, max: 300 });
  const target = (await db.doc(`learners/${studentId}/events/${eventId}`).get()).data();
  if (!target) throw new CallableError('not-found', 'Event not found');
  const { schoolYear, sectionId } = await enrolledSection(db, studentId);
  const at = now();
  const voidEventId = `staff_${studentId}_${stampOf(at)}_void`;
  await db.doc(`scan_events/${voidEventId}`).set(staffEvent({ studentId, sectionId, schoolYear, kind: 'void', scannedAt: at, email, extra: { voidsEventId: eventId, note: reason } }));
  await audit(db, { action: 'event.voided', actorType: 'staff', actorUid: email, targetType: 'event', targetId: eventId, details: { studentId, reason, voidEventId } });
  return { voidEventId };
}

export async function addManualEvent(ctx, data) {
  const { db, email } = ctx;
  const studentId = str(data.studentId, { name: 'studentId', min: 1, max: 64 });
  const kind = oneOf(data.kind, ['in', 'out'], 'kind');
  const date = ymd(data.date, 'date'); const time = hhmm(data.time, 'time');
  const reason = str(data.reason, { name: 'reason', min: 1, max: 300 });
  const { schoolYear, sectionId } = await enrolledSection(db, studentId);
  const scannedAt = manilaDateTime(date, time);
  const eventId = `staff_${studentId}_${date.replace(/-/g, '')}${time.replace(':', '')}_${kind}`;
  await db.doc(`scan_events/${eventId}`).set(staffEvent({ studentId, sectionId, schoolYear, kind, scannedAt, email, extra: { note: reason } }));
  await audit(db, { action: 'event.added', actorType: 'staff', actorUid: email, targetType: 'event', targetId: eventId, details: { studentId, kind, date, time, reason } });
  return { eventId };
}
```

Note: `staffEvent` computes `scannedDate`/`scannedTime` in Manila time from a
`Date`, so the void's `scannedDate` matches the day the registrar acted.

`functions/src/handlers/account.js`:

```js
import { FieldValue } from 'firebase-admin/firestore';
import { audit } from '../audit.js';
import { logEvent } from '../log.js';

async function deleteCollection(db, path, batchSize = 200) {
  for (;;) {
    const snap = await db.collection(path).limit(batchSize).get();
    if (snap.empty) return;
    const b = db.batch(); snap.docs.forEach((d) => b.delete(d.ref)); await b.commit();
  }
}

// Spec §8 "Data-subject rights": withdrawal/erasure. The audit trail is the
// only thing that survives.
export async function deleteGuardianAccount(ctx) {
  const { db, auth, uid, email } = ctx;
  const links = await db.collection('guardian_links').where('guardianUid', '==', uid).get();
  for (const l of links.docs) await l.ref.set({ status: 'revoked', revokedAt: FieldValue.serverTimestamp(), revokedBy: 'guardian', revokedReason: 'account deleted' }, { merge: true });
  await deleteCollection(db, `guardians/${uid}/devices`);
  await deleteCollection(db, `guardians/${uid}/inbox`);
  await db.doc(`guardians/${uid}`).delete();
  await db.doc(`rate_limits/${uid}`).delete();
  await audit(db, { action: 'guardian.deleted', actorType: 'guardian', actorUid: uid, targetType: 'guardian', targetId: uid, details: { links: links.size, email } });
  await auth.deleteUser(uid);
  logEvent('guardian_deleted', { uid });
  return { ok: true };
}
```

- [ ] **Step 4: Export from `functions/index.js`**

```js
import { submitReport, resolveReport, correctEvent, addManualEvent } from './src/handlers/reports.js';
import { deleteGuardianAccount } from './src/handlers/account.js';

export const submitReportFn = guardianCall(submitReport);
export const resolveReportFn = staffCall(resolveReport);
export const correctEventFn = staffCall(correctEvent);
export const addManualEventFn = staffCall(addManualEvent);
export const deleteGuardianAccountFn = guardianCall(deleteGuardianAccount);
```

- [ ] **Step 5: Run the tests, then commit**

Run: `npm run test:functions` — Expected: PASS.

```bash
git add functions/
git commit -m "feat(functions): guardian reports, staff corrections as staff scan events, account deletion

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Scheduled jobs and settings audit trigger

**Files:**
- Create: `functions/src/lib/retention.js` (+`.test.js`), `functions/src/handlers/scheduled.js`, `functions/src/handlers/settingsAudit.js`, `functions/test/emulator/scheduled.test.js`
- Modify: `functions/index.js`

**Interfaces:**
- Produces:
  - `retentionCutoffs({currentSchoolYear, nowMs})` → `{ eventsBefore: 'YYYY-MM-DD', resolvedBeforeMs, linksBeforeMs, codesBeforeMs, auditBeforeMs, dormantBeforeMs, devicesStaleBeforeMs, devicesDisabledBeforeMs }`
  - `expireLinks(deps)`, `pruneDevices(deps)` (also runs inbox/event/scan-log retention), `reconcileEvents(deps)` — each returns a counts object; `deps = {db, auth, messaging, portalUrl, now}`
  - `auditSettingsChange(db, {before, after, at})`

- [ ] **Step 1: Write the failing tests**

`functions/src/lib/retention.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { retentionCutoffs } from './retention.js';
const DAY = 86400_000;
describe('retentionCutoffs', () => {
  const now = Date.parse('2026-09-21T00:00:00Z');
  const c = retentionCutoffs({ currentSchoolYear: '2026-2027', nowMs: now });
  it('keeps current + previous school year of events', () => expect(c.eventsBefore).toBe('2025-06-01'));
  it('uses the spec windows', () => {
    expect(c.resolvedBeforeMs).toBe(now - 365 * DAY);
    expect(c.linksBeforeMs).toBe(now - 365 * DAY);
    expect(c.codesBeforeMs).toBe(now - 365 * DAY);
    expect(c.auditBeforeMs).toBe(now - 730 * DAY);
    expect(c.dormantBeforeMs).toBe(now - 365 * DAY);
    expect(c.devicesStaleBeforeMs).toBe(now - 60 * DAY);
    expect(c.devicesDisabledBeforeMs).toBe(now - 7 * DAY);
  });
});
```

`functions/test/emulator/scheduled.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearAll, seedSchool, fakeMessaging, scanDoc, ts } from './helpers.js';
import { expireLinks, pruneDevices, reconcileEvents } from '../../src/handlers/scheduled.js';
import { auditSettingsChange } from '../../src/handlers/settingsAudit.js';
import { clearCache } from '../../src/cache.js';

const NOW = new Date('2026-09-21T02:00:00+08:00');
const DAY = 86400_000;
const deps = () => ({ db: db(), auth: { deleted: [], async deleteUser(u) { this.deleted.push(u); } }, messaging: fakeMessaging(), portalUrl: 'https://p.test', now: () => NOW });

beforeEach(async () => { await clearAll(); clearCache(); await seedSchool(); });

describe('expireLinks', () => {
  it('expires links whose learner is no longer enrolled this SY and notifies', async () => {
    await db().doc('enrollments/S1_2026-2027').set({ status: 'withdrawn' }, { merge: true });
    const r = await expireLinks(deps());
    expect(r.expired).toBe(2);
    expect((await db().doc('guardian_links/gA_S1').get()).data().status).toBe('expired');
    expect((await db().collection('guardians/gA/inbox').where('type', '==', 'system').get()).size).toBe(1);
  });
  it('deletes old revoked links, old codes, old audit rows, dormant guardians', async () => {
    await db().doc('guardian_links/gC_S1').set({ revokedAt: ts(NOW.getTime() - 400 * DAY) }, { merge: true });
    await db().doc('activation_codes/h1').set({ studentId: 'S1', schoolYear: '2024-2025', status: 'revoked', expiresAt: ts(NOW.getTime() - 400 * DAY) });
    await db().doc('audit_log/old').set({ action: 'x', at: ts(NOW.getTime() - 800 * DAY) });
    await db().doc('guardians/gOld').set({ email: 'old@x', lastActiveLinkAt: ts(NOW.getTime() - 400 * DAY) });
    const d = deps();
    await expireLinks(d);
    expect((await db().doc('guardian_links/gC_S1').get()).exists).toBe(false);
    expect((await db().doc('activation_codes/h1').get()).exists).toBe(false);
    expect((await db().doc('audit_log/old').get()).exists).toBe(false);
    expect((await db().doc('guardians/gOld').get()).exists).toBe(false);
    expect(d.auth.deleted).toEqual(['gOld']);
  });
});

describe('pruneDevices (+ inbox/event retention)', () => {
  it('removes stale and long-disabled devices, old inbox items, old events, old scan_events, old resolved reports', async () => {
    await db().doc('guardians/gA/devices/tA1').set({ refreshedAt: ts(NOW.getTime() - 61 * DAY) }, { merge: true });
    await db().doc('guardians/gA/devices/tA2').set({ enabled: false, disabledAt: ts(NOW.getTime() - 8 * DAY) }, { merge: true });
    await db().doc('guardians/gA/inbox/old').set({ type: 'attendance', createdAt: ts(Date.parse('2025-05-01T00:00:00Z')) });
    await db().doc('guardians/gA/inbox/new').set({ type: 'attendance', createdAt: ts(NOW.getTime()) });
    await db().doc('learners/S1/events/old').set({ kind: 'in', scannedDate: '2025-05-30', effectiveAt: ts(0) });
    await db().doc('scan_events/old').set(scanDoc({ scannedDate: '2025-05-30' }));
    await db().doc('reports/r').set({ status: 'resolved', resolvedAt: ts(NOW.getTime() - 400 * DAY) });
    const r = await pruneDevices(deps());
    expect(r).toMatchObject({ devices: 2, inbox: 1, events: 1, scanEvents: 1, resolved: 1 });
    expect((await db().doc('guardians/gA/inbox/new').get()).exists).toBe(true);
  });
});

describe('reconcileEvents', () => {
  it('re-projects raw events that have no projection, without pushing', async () => {
    const d = deps();
    await db().doc('scan_events/k1_S1_202609200712').set(scanDoc({ scannedAt: ts('2026-09-20T07:12:00+08:00'), scannedDate: '2026-09-20', receivedAt: ts('2026-09-20T07:12:10+08:00') }));
    const r = await reconcileEvents(d);
    expect(r.missing).toBe(1);
    expect((await db().doc('learners/S1/events/k1_S1_202609200712').get()).exists).toBe(true);
    expect(d.messaging.sent).toHaveLength(0);
    expect((await reconcileEvents(d)).missing).toBe(0);
  });
});

describe('auditSettingsChange', () => {
  it('records before/after for the pause switch', async () => {
    await auditSettingsChange(db(), { before: { notificationsPaused: false }, after: { notificationsPaused: true, pausedBy: 'registrar@bnhs.edu', pauseNote: 'Drill' } });
    const rows = await db().collection('audit_log').where('action', '==', 'portal.settings_changed').get();
    expect(rows.docs[0].data().details).toMatchObject({ before: { notificationsPaused: false }, after: { notificationsPaused: true, pausedBy: 'registrar@bnhs.edu', pauseNote: 'Drill' } });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm --prefix functions test && npm run test:functions` — Expected: FAIL, modules missing.

- [ ] **Step 3: Implement**

`functions/src/lib/retention.js`:

```js
import { previousSchoolYear, schoolYearStartDate } from '../../shared/dates.js';
const DAY = 86400_000;

// Spec §4 "Retention windows", as absolute cut-offs.
export function retentionCutoffs({ currentSchoolYear, nowMs }) {
  return {
    eventsBefore: schoolYearStartDate(previousSchoolYear(currentSchoolYear)),
    resolvedBeforeMs: nowMs - 365 * DAY,
    linksBeforeMs: nowMs - 365 * DAY,
    codesBeforeMs: nowMs - 365 * DAY,
    auditBeforeMs: nowMs - 730 * DAY,
    dormantBeforeMs: nowMs - 365 * DAY,
    devicesStaleBeforeMs: nowMs - 60 * DAY,
    devicesDisabledBeforeMs: nowMs - 7 * DAY,
  };
}
```

`functions/src/handlers/scheduled.js`:

```js
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { retentionCutoffs } from '../lib/retention.js';
import { logEvent, logWarn } from '../log.js';
import { audit } from '../audit.js';
import { systemInbox } from './links.js';
import { handleScanEvent } from './scanEvent.js';
import { manilaDate } from '../../shared/dates.js';

async function deleteMatching(db, query, batchSize = 300) {
  let n = 0;
  for (;;) {
    const snap = await query.limit(batchSize).get();
    if (snap.empty) return n;
    const b = db.batch(); snap.docs.forEach((d) => b.delete(d.ref)); await b.commit();
    n += snap.size;
    if (snap.size < batchSize) return n;
  }
}
const ms = (x) => Timestamp.fromMillis(x);

// Nightly. (1) expire links for learners no longer enrolled this SY;
// (2) delete old revoked/expired links, old codes, old audit rows;
// (3) delete dormant guardian accounts.
export async function expireLinks({ db, auth, now }) {
  const nowMs = now().getTime();
  const sy = (await db.doc('settings/app').get()).data()?.currentSchoolYear;
  const cut = retentionCutoffs({ currentSchoolYear: sy, nowMs });

  let expired = 0;
  const active = await db.collection('guardian_links').where('status', '==', 'active').get();
  for (const l of active.docs) {
    const { studentId, guardianUid, schoolYear } = l.data();
    const e = (await db.doc(`enrollments/${studentId}_${sy}`).get()).data();
    if (e && e.status === 'enrolled' && schoolYear === sy) { await db.doc(`guardians/${guardianUid}`).set({ lastActiveLinkAt: ms(nowMs) }, { merge: true }); continue; }
    await l.ref.set({ status: 'expired', expiredAt: FieldValue.serverTimestamp() }, { merge: true });
    await systemInbox(db, guardianUid, { title: 'Re-activation needed', body: `Your link to a learner for SY ${schoolYear} has ended. Use the new activation slip from the school to link again for SY ${sy}.`, studentId });
    expired++;
  }

  const oldRevoked = await deleteMatching(db, db.collection('guardian_links').where('status', '==', 'revoked').where('revokedAt', '<', ms(cut.linksBeforeMs)));
  const oldExpired = await deleteMatching(db, db.collection('guardian_links').where('status', '==', 'expired').where('expiredAt', '<', ms(cut.linksBeforeMs)));
  const oldCodes = await deleteMatching(db, db.collection('activation_codes').where('expiresAt', '<', ms(cut.codesBeforeMs)));
  const oldAudit = await deleteMatching(db, db.collection('audit_log').where('at', '<', ms(cut.auditBeforeMs)));

  let dormant = 0;
  const dormantSnap = await db.collection('guardians').where('lastActiveLinkAt', '<', ms(cut.dormantBeforeMs)).limit(200).get();
  for (const g of dormantSnap.docs) {
    await deleteMatching(db, db.collection(`guardians/${g.id}/devices`));
    await deleteMatching(db, db.collection(`guardians/${g.id}/inbox`));
    await g.ref.delete();
    try { await auth.deleteUser(g.id); } catch (e) { logWarn('dormant_auth_delete_failed', { uid: g.id, message: e.message }); }
    await audit(db, { action: 'guardian.deleted', actorType: 'system', actorUid: null, targetType: 'guardian', targetId: g.id, details: { reason: 'dormant' } });
    dormant++;
  }
  const counts = { expired, oldRevoked, oldExpired, oldCodes, oldAudit, dormant };
  logEvent('expire_links_done', counts);
  return counts;
}

// Nightly. Device hygiene + school-year retention for inbox, events, raw log,
// and resolved requests/reports.
export async function pruneDevices({ db, now }) {
  const nowMs = now().getTime();
  const sy = (await db.doc('settings/app').get()).data()?.currentSchoolYear;
  const cut = retentionCutoffs({ currentSchoolYear: sy, nowMs });
  const stale = await deleteMatching(db, db.collectionGroup('devices').where('refreshedAt', '<', ms(cut.devicesStaleBeforeMs)));
  const disabled = await deleteMatching(db, db.collectionGroup('devices').where('disabledAt', '<', ms(cut.devicesDisabledBeforeMs)));
  const inboxBeforeMs = Date.parse(`${cut.eventsBefore}T00:00:00+08:00`);
  const inbox = await deleteMatching(db, db.collectionGroup('inbox').where('createdAt', '<', ms(inboxBeforeMs)));
  const events = await deleteMatching(db, db.collectionGroup('events').where('scannedDate', '<', cut.eventsBefore));
  const scanEvents = await deleteMatching(db, db.collection('scan_events').where('scannedDate', '<', cut.eventsBefore));
  const resolved = (await deleteMatching(db, db.collection('reports').where('status', '==', 'resolved').where('resolvedAt', '<', ms(cut.resolvedBeforeMs))))
    + (await deleteMatching(db, db.collection('access_requests').where('status', 'in', ['approved', 'denied']).where('resolvedAt', '<', ms(cut.resolvedBeforeMs))));
  const counts = { devices: stale + disabled, inbox, events, scanEvents, resolved };
  logEvent('prune_done', counts);
  return counts;
}

// Nightly safety net for lost triggers (spec §9): any raw event from the last
// two days without a projection is re-processed with push suppressed.
export async function reconcileEvents(deps) {
  const { db, now } = deps;
  const today = manilaDate(now());
  const yesterday = manilaDate(new Date(now().getTime() - 86400_000));
  const raw = await db.collection('scan_events').where('scannedDate', 'in', [today, yesterday]).get();
  let missing = 0, failed = 0;
  for (const r of raw.docs) {
    const data = r.data();
    if (data.kind === 'void') continue;
    const projected = await db.doc(`learners/${data.studentId}/events/${r.id}`).get();
    if (projected.exists) continue;
    missing++;
    const res = await handleScanEvent(deps, { eventId: r.id, data, suppressPush: true });
    if (res.outcome !== 'processed') failed++;
  }
  logEvent('reconcile_done', { scanned: raw.size, missing, failed });
  return { scanned: raw.size, missing, failed };
}
```

`functions/src/handlers/settingsAudit.js`:

```js
import { audit } from '../audit.js';

const FIELDS = ['notificationsPaused', 'pausedBy', 'pauseNote', 'announcement', 'consentVersion', 'privacyNoticeUrl'];
const pick = (o) => Object.fromEntries(FIELDS.filter((k) => o && k in o).map((k) => [k, o[k]]));

export function auditSettingsChange(db, { before, after }) {
  return audit(db, { action: 'portal.settings_changed', actorType: 'staff', actorUid: after?.pausedBy || after?.updatedBy || null, targetType: 'settings', targetId: 'parent_portal', details: { before: pick(before), after: pick(after) } });
}
```

- [ ] **Step 4: Export from `functions/index.js`**

```js
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { expireLinks, pruneDevices, reconcileEvents } from './src/handlers/scheduled.js';
import { auditSettingsChange } from './src/handlers/settingsAudit.js';

const jobDeps = () => ({ db, auth, messaging, portalUrl: PORTAL_URL.value(), now: () => new Date() });
const SCHED = { timeZone: 'Asia/Manila', retryCount: 1 };

export const expireLinksJob = onSchedule({ schedule: '10 1 * * *', ...SCHED }, () => expireLinks(jobDeps()));
export const pruneDevicesJob = onSchedule({ schedule: '40 1 * * *', ...SCHED }, () => pruneDevices(jobDeps()));
export const reconcileEventsJob = onSchedule({ schedule: '20 2 * * *', ...SCHED }, () => reconcileEvents(jobDeps()));

export const onParentPortalSettingsChanged = onDocumentWritten('settings/parent_portal', (event) =>
  auditSettingsChange(db, { before: event.data?.before?.data() || null, after: event.data?.after?.data() || null }));
```

Exactly three scheduled jobs (spec §10) plus one Firestore trigger.

- [ ] **Step 5: Run all function tests, then commit**

Run: `npm --prefix functions test && npm run test:functions` — Expected: PASS.

```bash
git add functions/
git commit -m "feat(functions): nightly link expiry, retention pruning, reconciliation, settings audit trigger

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Phase 4 — Parent portal (`parent/`)

### Task 13: Portal foundation — Firebase init, strings, router, shell, sign-in and verify screens

**Files:**
- Create: `parent/src/firebase.js`, `parent/src/styles.js`, `parent/src/strings.js`, `parent/src/lib/strings.test.js`,
  `parent/src/lib/router.js` (+`.test.js`), `parent/src/hooks/useRoute.js`, `parent/src/hooks/useAuth.js`, `parent/src/hooks/useDoc.js`,
  `parent/src/components/ui.jsx`, `parent/src/components/Shell.jsx`, `parent/src/App.jsx`,
  `parent/src/screens/SignIn.jsx`, `parent/src/screens/Verify.jsx`
- Modify: `parent/src/main.jsx`

**Interfaces:**
- Produces:
  - `firebase.js` exports `app, auth, db, functions, callable(name)`, `googleProvider`
  - `strings.js` default export `S` (flat object of every UI string); `FORBIDDEN = ['location','tracking','live']`
  - `matchRoute(pathname, search)` → `{ name, params, query }`; route names: `home, verify, consent, activate, learner, inbox, report, requestAccess, settings, notFound`
  - `useRoute()` → `{ route, navigate(path, {replace?}) }`
  - `useAuth()` → `{ user: undefined | null | User, profile: undefined | null | object }`
  - `useDoc(path)` → `{ data, error }`; `useQuery(buildQuery, deps)` → `{ rows, error }`
  - `ui.jsx`: `Btn, Card, Field, Inp, Sel, Banner, Spinner, EmptyState`
  - `Shell` (top bar with banners + bottom nav) and `App`

- [ ] **Step 1: Failing tests for strings and router**

`parent/src/lib/strings.test.js`:

```js
import { describe, it, expect } from 'vitest';
import S, { FORBIDDEN } from '../strings.js';

describe('strings', () => {
  it('has no empty strings', () => {
    for (const [k, v] of Object.entries(S)) expect(typeof v === 'string' && v.trim().length > 0, k).toBe(true);
  });
  it('never uses location/tracking/live wording', () => {
    for (const [k, v] of Object.entries(S)) for (const w of FORBIDDEN) expect(v.toLowerCase().includes(w), `${k} contains "${w}"`).toBe(false);
  });
  it('says gate scan, not attendance, on parent-facing labels', () => {
    expect(S.eventIn).toBe('Entered school');
    expect(S.eventOut).toBe('Left school');
    expect(S.pushDisclaimer).toContain('Inbox');
  });
});
```

`parent/src/lib/router.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { matchRoute } from './router.js';
describe('matchRoute', () => {
  it('matches static and param routes with query', () => {
    expect(matchRoute('/', '')).toEqual({ name: 'home', params: {}, query: {} });
    expect(matchRoute('/activate', '?c=K7M4P2XQ')).toEqual({ name: 'activate', params: {}, query: { c: 'K7M4P2XQ' } });
    expect(matchRoute('/learner/S1', '')).toEqual({ name: 'learner', params: { id: 'S1' }, query: {} });
    expect(matchRoute('/inbox', '?item=k1_S1_202609210712')).toEqual({ name: 'inbox', params: {}, query: { item: 'k1_S1_202609210712' } });
    expect(matchRoute('/report/k1_S1_202609210712', '?student=S1').params).toEqual({ eventId: 'k1_S1_202609210712' });
    expect(matchRoute('/request-access', '').name).toBe('requestAccess');
    expect(matchRoute('/settings/', '').name).toBe('settings');
    expect(matchRoute('/nope', '').name).toBe('notFound');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm --prefix parent test` — Expected: FAIL, modules missing.

- [ ] **Step 3: Implement strings, router, styles**

`parent/src/strings.js`:

```js
// Every user-visible string of the parent portal. Translation later is a
// content change to this file only. Test enforces: no empty values, no
// "location" / "tracking" / "live" wording (spec §7).
export const FORBIDDEN = ['location', 'tracking', 'live'];

const S = {
  appName: 'BNHS Learner Records',
  tagline: 'For parents and guardians of BNHS learners.',
  signInGoogle: 'Sign in with Google',
  signInEmail: 'Sign in with email',
  createAccount: 'Create an account',
  forgotPassword: 'Forgot password?',
  email: 'Email',
  password: 'Password',
  signIn: 'Sign in',
  signOut: 'Sign out',
  back: 'Back',
  continue: 'Continue',
  cancel: 'Cancel',
  send: 'Send',
  loading: 'Loading…',
  offlineBanner: 'You are offline. Showing what was last loaded.',
  lastUpdated: 'Last updated',
  authError: 'That email and password did not match.',
  createError: 'Could not create the account. Check the email and choose a password of at least 8 characters.',
  resetSent: 'A password reset email was sent if that address has an account.',
  verifyTitle: 'Verify your email',
  verifyBody: 'Check your email for a verification message, then tap Continue.',
  verifyResend: 'Send the email again',
  verifyNotYet: 'Not verified yet. Open the email and tap the link, then try again.',
  consentTitle: 'How the school uses your information',
  consentBody1: 'This portal shows you the gate scans the school kiosk recorded for the learner(s) linked to you: the time your learner scanned in and out at the school gate.',
  consentBody2: 'The school records your name, email, relationship to the learner, and the devices you turn notifications on for. It keeps gate scan records for the current and previous school year, then deletes them.',
  consentBody3: 'You can turn notifications off, report a record you think is wrong, or delete your account at any time from Settings. Questions go to the school registrar or the school\'s privacy focal person.',
  consentCheckbox: 'I have read this notice and agree.',
  consentLink: 'Read the full privacy notice',
  activateTitle: 'Link your learner',
  activateBody: 'Enter the activation code printed on the slip from the school.',
  activateCodeLabel: 'Activation code',
  activateRelationship: 'Your relationship to the learner',
  activateButton: 'Link learner',
  activateSuccess: 'Linked! You can now see gate scans for',
  activateFailed: 'That code could not be used. Ask the registrar to reissue your slip.',
  activateNoSlip: 'No slip? Ask the school for access',
  activateAnother: 'Link another learner',
  homeNoLinks: 'No learners linked yet.',
  homeTodayNone: 'No entry recorded today',
  homeEntered: 'Entered',
  homeLeft: 'Left',
  homeNoExit: 'No exit recorded yet',
  homeViewHistory: 'View history',
  notifBannerTitle: 'Get a notification for new gate scans',
  notifBannerButton: 'Turn on notifications',
  historyTitle: 'Gate scans',
  historyEmpty: 'No gate scans recorded yet.',
  historyLoadMore: 'Load more',
  eventIn: 'Entered school',
  eventOut: 'Left school',
  eventVoided: 'Corrected by the school',
  eventLate: 'Recorded late',
  eventManual: 'Added by the school',
  reportThis: 'Report this record',
  inboxTitle: 'Inbox',
  inboxEmpty: 'Nothing here yet. New gate scans and messages from the school appear here.',
  inboxNewEvent: 'New gate scan',
  reportTitle: 'Report a record',
  reportReason: 'What seems wrong?',
  reportReasonWrongTime: 'The time is wrong',
  reportReasonNotThisLearner: 'This scan was not my learner',
  reportReasonMissing: 'A scan is missing',
  reportReasonOther: 'Something else',
  reportMessage: 'Tell the registrar more (optional)',
  reportSent: 'Sent to the registrar. You will get a message here when it is reviewed.',
  reportFailed: 'Could not send the report right now. Please try again.',
  requestTitle: 'Ask the school for access',
  requestBody: 'Use this only if you did not receive an activation slip. The registrar will check your request.',
  requestLrn: 'Learner\'s LRN (12 digits)',
  requestName: 'Learner\'s full name',
  requestContact: 'Your contact number',
  requestMessage: 'Message (optional)',
  requestSent: 'Request sent. The registrar will review it.',
  requestOpen: 'Waiting for the registrar',
  requestApproved: 'Approved',
  requestDenied: 'Not approved',
  settingsTitle: 'Settings',
  settingsNotifications: 'Notifications',
  settingsAccountToggle: 'Send me a notification for new gate scans',
  settingsThisDevice: 'This device',
  notifOn: 'On for this device',
  notifOff: 'Off for this device',
  notifBlocked: 'Blocked in your browser settings',
  notifBlockedHelp: 'Open your browser\'s site settings for this page and allow Notifications, then return here.',
  notifUnsupported: 'Notifications are not available in this browser.',
  notifIosInstall: 'On iPhone or iPad, first add this page to your Home Screen (Share → Add to Home Screen), then open it from there.',
  notifTurnOn: 'Turn on for this device',
  notifTurnOff: 'Turn off for this device',
  pushDisclaimer: 'Notifications may be delayed or missed. Your Inbox always has the complete record.',
  settingsLearners: 'Linked learners',
  settingsRemoveHint: 'To remove a learner, ask the school registrar.',
  settingsReports: 'My reports',
  settingsRequests: 'My access requests',
  settingsPrivacy: 'Privacy notice',
  settingsDelete: 'Delete my account',
  settingsDeleteConfirm: 'This removes your account, your notification devices, and your inbox. Gate scan records stay with the school. Continue?',
  settingsDeleteButton: 'Yes, delete my account',
  pausedBanner: 'Notifications are paused by the school',
  accessEnded: 'Your access to this learner has ended. Contact the registrar.',
  navHome: 'Home',
  navInbox: 'Inbox',
  navSettings: 'Settings',
  notFound: 'That page does not exist.',
};
export default S;
```

`parent/src/lib/router.js`:

```js
// Tiny path router: enough for deep links from pushes and QR slips.
const ROUTES = [
  ['home', /^\/$/],
  ['verify', /^\/verify$/],
  ['consent', /^\/consent$/],
  ['activate', /^\/activate$/],
  ['learner', /^\/learner\/([^/]+)$/, ['id']],
  ['inbox', /^\/inbox$/],
  ['report', /^\/report\/([^/]+)$/, ['eventId']],
  ['requestAccess', /^\/request-access$/],
  ['settings', /^\/settings$/],
];

export function matchRoute(pathname, search = '') {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const query = Object.fromEntries(new URLSearchParams(search));
  for (const [name, re, keys = []] of ROUTES) {
    const m = path.match(re);
    if (m) return { name, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])), query };
  }
  return { name: 'notFound', params: {}, query };
}
```

`parent/src/hooks/useRoute.js`:

```js
import { useCallback, useEffect, useState } from 'react';
import { matchRoute } from '../lib/router.js';

const current = () => matchRoute(window.location.pathname, window.location.search);

export function useRoute() {
  const [route, setRoute] = useState(current);
  useEffect(() => {
    const on = () => setRoute(current());
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const navigate = useCallback((to, { replace = false } = {}) => {
    window.history[replace ? 'replaceState' : 'pushState'](null, '', to);
    setRoute(current());
    window.scrollTo(0, 0);
  }, []);
  return { route, navigate };
}
```

`parent/src/styles.js`:

```js
// Same token family as the SIMS (see src/styles.js) so the two apps feel
// related, tuned for phones: system fonts, larger tap targets.
export const T = {
  primary: '#5B4FE8', primaryDeep: '#4638C2', bg: '#F5F4FC', surface: '#FFFFFF', border: '#E7E5F5',
  ink: '#1E1B33', inkMuted: '#6B6890', danger: '#DC2626', ok: '#15803D', warn: '#B45309',
  font: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  radius: 14, pill: 999, tap: 44,
};
```

- [ ] **Step 4: Firebase init**

`parent/src/firebase.js`:

```js
import { initializeApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

export const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

if (import.meta.env.VITE_APPCHECK_DEBUG_TOKEN) self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
if (import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
  initializeAppCheck(app, { provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
}

export const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }) });
export const auth = getAuth(app);
export const functions = getFunctions(app, import.meta.env.VITE_FUNCTIONS_REGION || 'asia-southeast1');
export const googleProvider = new GoogleAuthProvider();
export const callable = (name) => httpsCallable(functions, name);

if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
```

- [ ] **Step 5: Hooks**

`parent/src/hooks/useAuth.js`:

```js
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase.js';

// user: undefined (resolving) | null (signed out) | User
// profile: undefined (loading) | null (no guardians/{uid} yet) | object
export function useAuth() {
  const [user, setUser] = useState(undefined);
  const [profile, setProfile] = useState(undefined);
  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u && !u.isAnonymous ? u : null)), []);
  useEffect(() => {
    if (!user || !user.emailVerified) { setProfile(user ? null : undefined); return; }
    return onSnapshot(doc(db, 'guardians', user.uid), (s) => setProfile(s.exists() ? { id: s.id, ...s.data() } : null), () => setProfile(null));
  }, [user]);
  return { user, profile };
}
```

`parent/src/hooks/useDoc.js`:

```js
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';

export function useDoc(path) {
  const [state, setState] = useState({ data: undefined, error: null });
  useEffect(() => {
    if (!path) { setState({ data: undefined, error: null }); return; }
    return onSnapshot(doc(db, path),
      { includeMetadataChanges: true },
      (s) => setState({ data: s.exists() ? { id: s.id, ...s.data() } : null, error: null, fromCache: s.metadata.fromCache }),
      (e) => setState({ data: null, error: e.code || 'error' }));
  }, [path]);
  return state;
}

// buildQuery must return a Firestore Query with a limit (rules require it).
export function useQuery(buildQuery, deps) {
  const [state, setState] = useState({ rows: undefined, error: null });
  useEffect(() => {
    const q = buildQuery();
    if (!q) { setState({ rows: undefined, error: null }); return; }
    return onSnapshot(q, (s) => setState({ rows: s.docs.map((d) => ({ id: d.id, ...d.data() })), error: null }), (e) => setState({ rows: [], error: e.code || 'error' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
```

- [ ] **Step 6: UI primitives and shell**

`parent/src/components/ui.jsx`:

```jsx
import { T } from '../styles.js';
const font = { fontFamily: T.font };

export const Btn = ({ variant = 'solid', style, ...p }) => (
  <button {...p} style={{ ...font, minHeight: T.tap, borderRadius: T.pill, padding: '10px 18px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
    background: variant === 'solid' ? T.primary : variant === 'danger' ? T.danger : 'transparent',
    color: variant === 'ghost' ? T.primary : '#fff',
    border: variant === 'ghost' ? `1.5px solid ${T.primary}` : 'none', opacity: p.disabled ? 0.6 : 1, ...style }} />
);
export const Card = ({ style, ...p }) => <section {...p} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: 16, marginBottom: 12, ...style }} />;
export const Field = ({ label, children, hint }) => (
  <label style={{ ...font, display: 'block', marginBottom: 14 }}>
    <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T.inkMuted, marginBottom: 6 }}>{label}</span>
    {children}
    {hint && <span style={{ display: 'block', fontSize: 12, color: T.inkMuted, marginTop: 4 }}>{hint}</span>}
  </label>
);
const inputStyle = { ...font, width: '100%', boxSizing: 'border-box', minHeight: T.tap, fontSize: 16, padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${T.border}`, background: T.surface, color: T.ink };
export const Inp = (p) => <input {...p} style={{ ...inputStyle, ...p.style }} />;
export const Sel = (p) => <select {...p} style={{ ...inputStyle, ...p.style }} />;
export const Banner = ({ tone = 'info', children, action }) => (
  <div role={tone === 'danger' ? 'alert' : 'status'} style={{ ...font, fontSize: 14, borderRadius: 10, padding: '10px 12px', marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between',
    background: tone === 'danger' ? 'rgba(220,38,38,0.08)' : tone === 'warn' ? 'rgba(180,83,9,0.10)' : 'rgba(91,79,232,0.08)',
    color: tone === 'danger' ? T.danger : tone === 'warn' ? T.warn : T.primaryDeep }}>
    <span>{children}</span>{action}
  </div>
);
export const Spinner = ({ label }) => <p role="status" style={{ ...font, color: T.inkMuted, fontSize: 14 }}>{label}</p>;
export const EmptyState = ({ title, hint }) => (
  <div style={{ ...font, textAlign: 'center', color: T.inkMuted, padding: '40px 16px' }}>
    <div style={{ fontWeight: 700, color: T.ink, marginBottom: 6 }}>{title}</div>{hint && <div style={{ fontSize: 13 }}>{hint}</div>}
  </div>
);
```

`parent/src/components/Shell.jsx`:

```jsx
import { useEffect, useState } from 'react';
import S from '../strings.js';
import { T } from '../styles.js';
import { Banner } from './ui.jsx';
import { useDoc } from '../hooks/useDoc.js';

const NAV = [['/', S.navHome], ['/inbox', S.navInbox], ['/settings', S.navSettings]];

export default function Shell({ route, navigate, children }) {
  const portal = useDoc('settings/parent_portal').data;
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return (
    <div style={{ fontFamily: T.font, color: T.ink, background: T.bg, minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '14px 16px 0', maxWidth: 560, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>{S.appName}</div>
        {!online && <Banner tone="warn">{S.offlineBanner}</Banner>}
        {portal?.notificationsPaused && <Banner tone="warn">{S.pausedBanner}{portal.pauseNote ? `: ${portal.pauseNote}` : ''}</Banner>}
        {portal?.announcement && <Banner>{portal.announcement}</Banner>}
      </header>
      <main style={{ flex: 1, padding: '0 16px 88px', maxWidth: 560, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>{children}</main>
      <nav aria-label="Main" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: T.surface, borderTop: `1px solid ${T.border}`, display: 'flex', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {NAV.map(([path, label]) => {
          const active = (path === '/' ? route.name === 'home' || route.name === 'learner' : route.name === (path === '/inbox' ? 'inbox' : 'settings'));
          return <button key={path} onClick={() => navigate(path)} aria-current={active ? 'page' : undefined} style={{ flex: 1, minHeight: 56, border: 'none', background: 'transparent', fontFamily: T.font, fontSize: 14, fontWeight: active ? 700 : 500, color: active ? T.primary : T.inkMuted, cursor: 'pointer' }}>{label}</button>;
        })}
      </nav>
    </div>
  );
}
```

- [ ] **Step 7: Sign-in and verify screens**

`parent/src/screens/SignIn.jsx`:

```jsx
import { useState } from 'react';
import { signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import { auth, googleProvider } from '../firebase.js';
import S from '../strings.js';
import { T } from '../styles.js';
import { Btn, Card, Field, Inp, Banner } from '../components/ui.jsx';

export default function SignIn() {
  const [mode, setMode] = useState('choose'); // choose | email | create
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);

  const run = async (fn, failText) => { setBusy(true); setMsg(null); try { await fn(); } catch { setMsg({ tone: 'danger', text: failText }); } setBusy(false); };
  const google = () => run(() => signInWithPopup(auth, googleProvider), S.authError);
  const signIn = () => run(() => signInWithEmailAndPassword(auth, email.trim(), pw), S.authError);
  const create = () => run(async () => { const c = await createUserWithEmailAndPassword(auth, email.trim(), pw); await sendEmailVerification(c.user); }, S.createError);
  const reset = () => run(async () => { await sendPasswordResetEmail(auth, email.trim()); setMsg({ tone: 'info', text: S.resetSent }); }, S.resetSent);

  return (
    <div style={{ fontFamily: T.font, background: T.bg, minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <Card style={{ width: '100%', maxWidth: 400 }}>
        <img src="/icons/icon-192.png" alt="" width={48} height={48} />
        <h1 style={{ fontSize: 22, margin: '8px 0 2px' }}>{S.appName}</h1>
        <p style={{ color: T.inkMuted, fontSize: 14, marginTop: 0 }}>{S.tagline}</p>
        {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
        {mode === 'choose' && (
          <div style={{ display: 'grid', gap: 10 }}>
            <Btn onClick={google} disabled={busy}>{S.signInGoogle}</Btn>
            <Btn variant="ghost" onClick={() => setMode('email')}>{S.signInEmail}</Btn>
          </div>
        )}
        {mode !== 'choose' && (
          <>
            <Field label={S.email}><Inp type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label={S.password}><Inp type="password" autoComplete={mode === 'create' ? 'new-password' : 'current-password'} value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <div style={{ display: 'grid', gap: 10 }}>
              {mode === 'email' ? <Btn onClick={signIn} disabled={busy}>{S.signIn}</Btn> : <Btn onClick={create} disabled={busy}>{S.createAccount}</Btn>}
              {mode === 'email' && <Btn variant="ghost" onClick={() => setMode('create')}>{S.createAccount}</Btn>}
              {mode === 'email' && <Btn variant="ghost" onClick={reset} disabled={busy || !email}>{S.forgotPassword}</Btn>}
              <Btn variant="ghost" onClick={() => setMode('choose')}>{S.back}</Btn>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
```

`parent/src/screens/Verify.jsx`:

```jsx
import { useState } from 'react';
import { sendEmailVerification, signOut } from 'firebase/auth';
import { auth } from '../firebase.js';
import S from '../strings.js';
import { Btn, Card, Banner } from '../components/ui.jsx';

export default function Verify({ user }) {
  const [msg, setMsg] = useState(null);
  const check = async () => { await user.reload(); if (!auth.currentUser.emailVerified) setMsg(S.verifyNotYet); else window.location.replace('/'); };
  return (
    <Card>
      <h1 style={{ fontSize: 20 }}>{S.verifyTitle}</h1>
      <p>{S.verifyBody}</p>
      {msg && <Banner tone="warn">{msg}</Banner>}
      <div style={{ display: 'grid', gap: 10 }}>
        <Btn onClick={check}>{S.continue}</Btn>
        <Btn variant="ghost" onClick={() => sendEmailVerification(user)}>{S.verifyResend}</Btn>
        <Btn variant="ghost" onClick={() => signOut(auth)}>{S.signOut}</Btn>
      </div>
    </Card>
  );
}
```

- [ ] **Step 8: `App.jsx` and `main.jsx`**

`parent/src/App.jsx` (screens from Tasks 14–15 are imported here; until
they exist, keep their imports commented and the routes falling through to
`NotFound`):

```jsx
import { useRoute } from './hooks/useRoute.js';
import { useAuth } from './hooks/useAuth.js';
import Shell from './components/Shell.jsx';
import { Spinner, EmptyState } from './components/ui.jsx';
import S from './strings.js';
import SignIn from './screens/SignIn.jsx';
import Verify from './screens/Verify.jsx';
import Consent from './screens/Consent.jsx';
import Activate from './screens/Activate.jsx';
import Home from './screens/Home.jsx';
import History from './screens/History.jsx';
import Inbox from './screens/Inbox.jsx';
import Report from './screens/Report.jsx';
import RequestAccess from './screens/RequestAccess.jsx';
import Settings from './screens/Settings.jsx';

const CONSENT_KEY = 'bnhs-parent-consent';

export default function App() {
  const { route, navigate } = useRoute();
  const { user, profile } = useAuth();

  if (user === undefined) return <Spinner label={S.loading} />;
  if (!user) return <SignIn />;
  if (!user.emailVerified) return <Shell route={route} navigate={navigate}><Verify user={user} /></Shell>;
  if (profile === undefined) return <Spinner label={S.loading} />;

  // First-time flow: consent (stored locally until the first activation
  // records it server-side) → activation. Deep links to /activate?c= survive.
  let consented = false;
  try { consented = Boolean(profile) || localStorage.getItem(CONSENT_KEY) !== null; } catch { consented = Boolean(profile); }
  const props = { user, profile, route, navigate };
  let screen;
  if (!profile && !consented && route.name !== 'requestAccess') screen = <Consent {...props} onAccepted={(v) => { try { localStorage.setItem(CONSENT_KEY, String(v)); } catch {} navigate(route.name === 'activate' ? `/activate${window.location.search}` : '/activate', { replace: true }); }} />;
  else if (!profile && ['home', 'learner', 'inbox', 'settings', 'report'].includes(route.name)) screen = <Activate {...props} />;
  else switch (route.name) {
    case 'home': screen = <Home {...props} />; break;
    case 'consent': screen = <Consent {...props} onAccepted={() => navigate('/activate')} />; break;
    case 'activate': screen = <Activate {...props} />; break;
    case 'learner': screen = <History {...props} studentId={route.params.id} />; break;
    case 'inbox': screen = <Inbox {...props} />; break;
    case 'report': screen = <Report {...props} eventId={route.params.eventId} studentId={route.query.student} />; break;
    case 'requestAccess': screen = <RequestAccess {...props} />; break;
    case 'settings': screen = <Settings {...props} />; break;
    default: screen = <EmptyState title={S.notFound} />;
  }
  return <Shell route={route} navigate={navigate}>{screen}</Shell>;
}
```

`parent/src/main.jsx`:

```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

const reducedMotion = '@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } } body { margin: 0; }';
createRoot(document.getElementById('root')).render(<StrictMode><style>{reducedMotion}</style><App /></StrictMode>);
```

- [ ] **Step 9: Run the tests**

Run: `npm --prefix parent test` — Expected: PASS (strings + router).
`npm --prefix parent run build` will fail until Tasks 14–15 add the screens;
that is expected at this point.

- [ ] **Step 10: Commit**

```bash
git add parent/
git commit -m "feat(parent): portal foundation — firebase init, strings, router, shell, sign-in and verify

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: Consent, Activate, Home, History, Inbox screens

**Files:**
- Create: `parent/src/lib/format.js` (+`.test.js`), `parent/src/hooks/useLinks.js`,
  `parent/src/screens/Consent.jsx`, `Activate.jsx`, `Home.jsx`, `History.jsx`, `Inbox.jsx`

**Interfaces:**
- Consumes: Task 13; callable `activateCodeFn`; `shared/dates.js`.
- Produces: `groupByDate(events)` → `[{date, label, items}]`; `eventTitle(ev)`; `describeToday(today, todayDate)` → `{ entered, left }` strings;
  `useLinks(uid)` → `{ links }` (active links only).

- [ ] **Step 1: Failing tests for format helpers**

`parent/src/lib/format.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { groupByDate, eventTitle, describeToday } from './format.js';
describe('format', () => {
  it('groups newest-first by date with labels', () => {
    const g = groupByDate([{ id: 'a', scannedDate: '2026-09-21', kind: 'in' }, { id: 'b', scannedDate: '2026-09-20', kind: 'out' }, { id: 'c', scannedDate: '2026-09-21', kind: 'out' }]);
    expect(g.map((x) => x.date)).toEqual(['2026-09-21', '2026-09-20']);
    expect(g[0].label).toBe('Mon 21 Sep');
    expect(g[0].items.map((i) => i.id)).toEqual(['a', 'c']);
  });
  it('titles events by kind/status', () => {
    expect(eventTitle({ kind: 'in', status: 'recorded' })).toBe('Entered school');
    expect(eventTitle({ kind: 'out', status: 'recorded' })).toBe('Left school');
  });
  it('describes today honestly, including a stale summary from another day', () => {
    expect(describeToday({ date: '2026-09-21', firstIn: { time: '07:12' }, lastOut: null, status: 'in' }, '2026-09-21')).toEqual({ entered: 'Entered 07:12 AM', left: 'No exit recorded yet' });
    expect(describeToday({ date: '2026-09-20', firstIn: { time: '07:12' }, lastOut: { time: '16:05' }, status: 'out' }, '2026-09-21')).toEqual({ entered: 'No entry recorded today', left: null });
    expect(describeToday(null, '2026-09-21')).toEqual({ entered: 'No entry recorded today', left: null });
  });
});
```

- [ ] **Step 2: Run to verify it fails, then implement**

Run: `npm --prefix parent test` — Expected: FAIL (`format.js` missing).

`parent/src/lib/format.js`:

```js
import S from '../strings.js';
import { formatDateLabel, formatScanTime } from '../../../shared/dates.js';

export function groupByDate(events) {
  const by = new Map();
  for (const e of events) { if (!by.has(e.scannedDate)) by.set(e.scannedDate, []); by.get(e.scannedDate).push(e); }
  return [...by.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, items]) => ({ date, label: formatDateLabel(date), items }));
}
export const eventTitle = (e) => (e.kind === 'in' ? S.eventIn : S.eventOut);

export function describeToday(today, todayDate) {
  if (!today || today.date !== todayDate || (!today.firstIn && !today.lastOut)) return { entered: S.homeTodayNone, left: null };
  return {
    entered: today.firstIn ? `${S.homeEntered} ${formatScanTime(today.firstIn.time)}` : S.homeTodayNone,
    left: today.lastOut ? `${S.homeLeft} ${formatScanTime(today.lastOut.time)}` : S.homeNoExit,
  };
}
```

Run: `npm --prefix parent test` — Expected: PASS.

- [ ] **Step 3: Links hook**

`parent/src/hooks/useLinks.js`:

```js
import { collection, query, where, limit } from 'firebase/firestore';
import { db } from '../firebase.js';
import { useQuery } from './useDoc.js';

export function useLinks(uid) {
  const { rows } = useQuery(() => uid && query(collection(db, 'guardian_links'), where('guardianUid', '==', uid), where('status', '==', 'active'), limit(20)), [uid]);
  return { links: rows };
}
```

- [ ] **Step 4: Consent and Activate**

`parent/src/screens/Consent.jsx`:

```jsx
import { useState } from 'react';
import S from '../strings.js';
import { Btn, Card } from '../components/ui.jsx';
import { useDoc } from '../hooks/useDoc.js';

export default function Consent({ onAccepted }) {
  const portal = useDoc('settings/parent_portal').data;
  const [agreed, setAgreed] = useState(false);
  const version = portal?.consentVersion ?? 1;
  return (
    <Card>
      <h1 style={{ fontSize: 20 }}>{S.consentTitle}</h1>
      <p>{S.consentBody1}</p><p>{S.consentBody2}</p><p>{S.consentBody3}</p>
      {portal?.privacyNoticeUrl && <p><a href={portal.privacyNoticeUrl} target="_blank" rel="noreferrer">{S.consentLink}</a></p>}
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44, fontSize: 15 }}>
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ width: 22, height: 22 }} />{S.consentCheckbox}
      </label>
      <Btn disabled={!agreed} onClick={() => onAccepted(version)} style={{ width: '100%', marginTop: 10 }}>{S.continue}</Btn>
    </Card>
  );
}
```

`parent/src/screens/Activate.jsx`:

```jsx
import { useState } from 'react';
import { callable } from '../firebase.js';
import S from '../strings.js';
import { Btn, Card, Field, Inp, Sel, Banner } from '../components/ui.jsx';
import { useDoc } from '../hooks/useDoc.js';

const RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Sibling', 'Other'];
const normalize = (v) => v.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 8);
const pretty = (v) => (v.length > 4 ? `${v.slice(0, 4)}-${v.slice(4)}` : v);

export default function Activate({ route, navigate }) {
  const portal = useDoc('settings/parent_portal').data;
  const [code, setCode] = useState(normalize(route.query.c || ''));
  const [relationship, setRelationship] = useState('Mother');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(null); const [done, setDone] = useState(null);

  const submit = async () => {
    setBusy(true); setErr(null);
    let consentVersion = portal?.consentVersion ?? 1;
    try { const stored = localStorage.getItem('bnhs-parent-consent'); if (stored) consentVersion = Number(stored); } catch {}
    try { const r = await callable('activateCodeFn')({ code, relationship, consentVersion }); setDone(r.data); }
    catch { setErr(S.activateFailed); }
    setBusy(false);
  };

  if (done) return (
    <Card>
      <h1 style={{ fontSize: 20 }}>{S.activateSuccess} {done.displayName}</h1>
      <p>{done.sectionLabel}</p>
      <div style={{ display: 'grid', gap: 10 }}>
        <Btn onClick={() => navigate('/')}>{S.continue}</Btn>
        <Btn variant="ghost" onClick={() => { setDone(null); setCode(''); }}>{S.activateAnother}</Btn>
      </div>
    </Card>
  );
  return (
    <Card>
      <h1 style={{ fontSize: 20 }}>{S.activateTitle}</h1>
      <p>{S.activateBody}</p>
      {err && <Banner tone="danger">{err}</Banner>}
      <Field label={S.activateCodeLabel}><Inp inputMode="text" autoCapitalize="characters" autoComplete="one-time-code" value={pretty(code)} onChange={(e) => setCode(normalize(e.target.value))} style={{ letterSpacing: '0.12em', fontSize: 20, textAlign: 'center' }} /></Field>
      <Field label={S.activateRelationship}><Sel value={relationship} onChange={(e) => setRelationship(e.target.value)}>{RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}</Sel></Field>
      <Btn onClick={submit} disabled={busy || code.length !== 8} style={{ width: '100%' }}>{S.activateButton}</Btn>
      <p style={{ textAlign: 'center' }}><a href="/request-access" onClick={(e) => { e.preventDefault(); navigate('/request-access'); }}>{S.activateNoSlip}</a></p>
    </Card>
  );
}
```

- [ ] **Step 5: Home**

`parent/src/screens/Home.jsx`:

```jsx
import S from '../strings.js';
import { T } from '../styles.js';
import { Btn, Card, Banner, Spinner, EmptyState } from '../components/ui.jsx';
import { useLinks } from '../hooks/useLinks.js';
import { useDoc } from '../hooks/useDoc.js';
import { describeToday } from '../lib/format.js';
import { localDate } from '../../../shared/dates.js';
import { notificationState } from '../lib/notificationState.js';
import { useDeviceStatus } from '../lib/notifications.js';

function LearnerCard({ link, navigate }) {
  const { data, error } = useDoc(`learners/${link.studentId}`);
  if (error === 'permission-denied') return <Card><Banner tone="warn">{S.accessEnded}</Banner></Card>;
  if (data === undefined) return <Card><Spinner label={S.loading} /></Card>;
  const today = describeToday(data?.today, localDate());
  return (
    <Card>
      <div style={{ fontWeight: 800, fontSize: 18 }}>{data?.displayName || '—'}</div>
      <div style={{ color: T.inkMuted, fontSize: 13, marginBottom: 10 }}>{data?.sectionLabel}</div>
      <div style={{ fontSize: 16, marginBottom: 4 }}>{today.entered}</div>
      {today.left && <div style={{ fontSize: 16, marginBottom: 10 }}>{today.left}</div>}
      <Btn variant="ghost" onClick={() => navigate(`/learner/${link.studentId}`)}>{S.homeViewHistory}</Btn>
    </Card>
  );
}

export default function Home({ user, profile, navigate }) {
  const { links } = useLinks(user.uid);
  const device = useDeviceStatus(user.uid);
  const notif = notificationState({ ...device, accountEnabled: profile?.notificationsEnabled !== false });
  if (links === undefined) return <Spinner label={S.loading} />;
  return (
    <>
      {notif === 'off' && <Banner action={<Btn onClick={() => navigate('/settings')} style={{ padding: '6px 12px', minHeight: 36 }}>{S.notifBannerButton}</Btn>}>{S.notifBannerTitle}</Banner>}
      {links.length === 0 && <EmptyState title={S.homeNoLinks} hint={S.activateBody} />}
      {links.length === 0 && <Btn onClick={() => navigate('/activate')} style={{ width: '100%' }}>{S.activateTitle}</Btn>}
      {links.map((l) => <LearnerCard key={l.id} link={l} navigate={navigate} />)}
    </>
  );
}
```

- [ ] **Step 6: History**

`parent/src/screens/History.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, startAfter, getDocs } from 'firebase/firestore';
import { db } from '../firebase.js';
import S from '../strings.js';
import { T } from '../styles.js';
import { Btn, Card, Banner, Spinner, EmptyState } from '../components/ui.jsx';
import { useDoc } from '../hooks/useDoc.js';
import { groupByDate, eventTitle } from '../lib/format.js';
import { formatScanTime } from '../../../shared/dates.js';

const PAGE = 30;

export function EventRow({ ev, studentId, navigate, highlight }) {
  const voided = ev.status === 'voided';
  return (
    <div id={`ev-${ev.id}`} style={{ padding: '10px 0', borderBottom: `1px solid ${T.border}`, background: highlight ? 'rgba(91,79,232,0.06)' : 'transparent' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontWeight: 600, textDecoration: voided ? 'line-through' : 'none' }}>{eventTitle(ev)}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', textDecoration: voided ? 'line-through' : 'none' }}>{formatScanTime(ev.scannedTime)}</span>
      </div>
      <div style={{ fontSize: 12, color: T.inkMuted }}>
        {ev.deviceLabel}{ev.delayedSync ? ` · ${S.eventLate}` : ''}{ev.source === 'staff' && !voided ? ` · ${S.eventManual}` : ''}
        {voided ? ` · ${S.eventVoided}${ev.voidReason ? `: ${ev.voidReason}` : ''}` : ''}
      </div>
      {!voided && <button onClick={() => navigate(`/report/${ev.id}?student=${studentId}`)} style={{ background: 'none', border: 'none', color: T.primary, padding: '6px 0', minHeight: 32, fontFamily: T.font, fontSize: 13, cursor: 'pointer' }}>{S.reportThis}</button>}
    </div>
  );
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
  return (
    <>
      <h1 style={{ fontSize: 20, margin: '4px 0 0' }}>{learner?.displayName}</h1>
      <div style={{ color: T.inkMuted, fontSize: 13, marginBottom: 12 }}>{learner?.sectionLabel} · {S.historyTitle}</div>
      {rows.length === 0 && !busy && <EmptyState title={S.historyEmpty} />}
      {groupByDate(rows).map((g) => (
        <Card key={g.date}>
          <div style={{ fontWeight: 700, fontSize: 13, color: T.inkMuted, marginBottom: 4 }}>{g.label}</div>
          {g.items.map((ev) => <EventRow key={ev.id} ev={ev} studentId={studentId} navigate={navigate} highlight={route.query.event === ev.id} />)}
        </Card>
      ))}
      {more && <Btn variant="ghost" disabled={busy} onClick={() => load(last)} style={{ width: '100%' }}>{S.historyLoadMore}</Btn>}
    </>
  );
}
```

- [ ] **Step 7: Inbox**

`parent/src/screens/Inbox.jsx`:

```jsx
import { useEffect } from 'react';
import { collection, query, orderBy, limit, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';
import S from '../strings.js';
import { T } from '../styles.js';
import { Card, Spinner, EmptyState } from '../components/ui.jsx';
import { useQuery } from '../hooks/useDoc.js';
import { formatDateLabel, formatScanTime } from '../../../shared/dates.js';

const KIND = { in: S.eventIn, out: S.eventOut, void: S.eventVoided };

export default function Inbox({ user, navigate, route }) {
  const { rows } = useQuery(() => query(collection(db, `guardians/${user.uid}/inbox`), orderBy('createdAt', 'desc'), limit(30)), [user.uid]);
  const open = async (item) => {
    if (!item.readAt) updateDoc(doc(db, `guardians/${user.uid}/inbox/${item.id}`), { readAt: serverTimestamp() }).catch(() => {});
    if (item.type === 'attendance') navigate(`/learner/${item.studentId}?event=${item.eventId}`);
  };
  useEffect(() => { const target = rows?.find((r) => r.id === route.query.item); if (target) open(target); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [rows === undefined, route.query.item]);

  if (rows === undefined) return <Spinner label={S.loading} />;
  if (rows.length === 0) return <EmptyState title={S.inboxTitle} hint={S.inboxEmpty} />;
  return (
    <>
      <h1 style={{ fontSize: 20 }}>{S.inboxTitle}</h1>
      {rows.map((item) => (
        <Card key={item.id} role="button" tabIndex={0} onClick={() => open(item)} onKeyDown={(e) => e.key === 'Enter' && open(item)} style={{ cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span aria-label={item.readAt ? undefined : 'Unread'} style={{ width: 10, height: 10, borderRadius: 5, marginTop: 6, background: item.readAt ? 'transparent' : T.primary, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{item.type === 'attendance' ? `${item.learnerName}: ${KIND[item.kind] || S.inboxNewEvent}` : item.title}</div>
            <div style={{ fontSize: 13, color: T.inkMuted }}>
              {item.type === 'attendance' ? `${formatDateLabel(item.scannedDate)} · ${formatScanTime(item.scannedTime)}` : item.body}
            </div>
          </div>
        </Card>
      ))}
    </>
  );
}
```

- [ ] **Step 8: Commit**

Run: `npm --prefix parent test` — Expected: PASS. (Build still needs Task 15.)

```bash
git add parent/
git commit -m "feat(parent): consent, activation, home, history and inbox screens

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 15: Report, Request access, Settings, push registration, service worker, PWA manifest

**Files:**
- Create: `parent/src/lib/notificationState.js` (+`.test.js`), `parent/src/lib/notifications.js`,
  `parent/src/screens/Report.jsx`, `RequestAccess.jsx`, `Settings.jsx`,
  `parent/public/firebase-messaging-sw.js`, `parent/public/manifest.webmanifest`, `parent/public/icons/icon-192.png`, `parent/public/icons/icon-512.png`

**Interfaces:**
- Produces:
  - `notificationState({supported, permission, isIOS, isStandalone, registered, accountEnabled})` → `'unsupported' | 'ios_needs_install' | 'blocked' | 'account_off' | 'off' | 'on'`
  - `useDeviceStatus(uid)` → `{supported, permission, isIOS, isStandalone, registered}`
  - `enableOnThisDevice(uid)`, `disableOnThisDevice(uid)`, `refreshTokenIfRegistered(uid)`

- [ ] **Step 1: Failing test**

`parent/src/lib/notificationState.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { notificationState } from './notificationState.js';
const base = { supported: true, permission: 'default', isIOS: false, isStandalone: true, registered: false, accountEnabled: true };
describe('notificationState', () => {
  it('walks the decision tree', () => {
    expect(notificationState({ ...base, supported: false })).toBe('unsupported');
    expect(notificationState({ ...base, supported: false, isIOS: true, isStandalone: false })).toBe('ios_needs_install');
    expect(notificationState({ ...base, permission: 'denied' })).toBe('blocked');
    expect(notificationState({ ...base, accountEnabled: false, permission: 'granted', registered: true })).toBe('account_off');
    expect(notificationState({ ...base, permission: 'granted', registered: false })).toBe('off');
    expect(notificationState({ ...base })).toBe('off');
    expect(notificationState({ ...base, permission: 'granted', registered: true })).toBe('on');
  });
});
```

Run: `npm --prefix parent test` — Expected: FAIL.

- [ ] **Step 2: Implement notification helpers**

`parent/src/lib/notificationState.js`:

```js
export function notificationState({ supported, permission, isIOS, isStandalone, registered, accountEnabled }) {
  if (!supported) return isIOS && !isStandalone ? 'ios_needs_install' : 'unsupported';
  if (permission === 'denied') return 'blocked';
  if (!accountEnabled) return 'account_off';
  return permission === 'granted' && registered ? 'on' : 'off';
}
```

`parent/src/lib/notifications.js`:

```js
import { useEffect, useState } from 'react';
import { getMessaging, getToken, deleteToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { app, db } from '../firebase.js';

const LOCAL_KEY = 'bnhs-parent-device';   // sha256 of the registered token, per browser

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const env = () => ({
  isIOS: /iPad|iPhone|iPod/.test(navigator.userAgent),
  isStandalone: window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  permission: typeof Notification === 'undefined' ? 'default' : Notification.permission,
});
const local = { get: () => { try { return localStorage.getItem(LOCAL_KEY); } catch { return null; } }, set: (v) => { try { v ? localStorage.setItem(LOCAL_KEY, v) : localStorage.removeItem(LOCAL_KEY); } catch {} } };

async function swRegistration() { return navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' }); }

async function writeDevice(uid, token) {
  const hash = await sha256(token);
  const prev = local.get();
  if (prev && prev !== hash) await deleteDoc(doc(db, `guardians/${uid}/devices/${prev}`)).catch(() => {});
  await setDoc(doc(db, `guardians/${uid}/devices/${hash}`), {
    token, platform: 'web', createdAt: serverTimestamp(), refreshedAt: serverTimestamp(), enabled: true, failureCount: 0,
  }, { merge: true });
  local.set(hash);
}

// Called from Settings/Home after an explicit tap (never on load).
export async function enableOnThisDevice(uid) {
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY, serviceWorkerRegistration: await swRegistration() });
  await writeDevice(uid, token);
}
export async function disableOnThisDevice(uid) {
  const prev = local.get();
  if (prev) await deleteDoc(doc(db, `guardians/${uid}/devices/${prev}`)).catch(() => {});
  local.set(null);
  try { await deleteToken(getMessaging(app)); } catch {}
}
// Called on every app open: bumps refreshedAt and replaces a rotated token.
export async function refreshTokenIfRegistered(uid) {
  if (!local.get() || env().permission !== 'granted' || !(await isSupported())) return;
  try { await enableOnThisDevice(uid); } catch {}
}

export function useDeviceStatus(uid) {
  const [s, setS] = useState({ supported: false, registered: Boolean(local.get()), ...env() });
  useEffect(() => {
    let alive = true;
    isSupported().then((ok) => alive && setS((p) => ({ ...p, supported: ok })));
    if (uid) refreshTokenIfRegistered(uid).then(() => alive && setS((p) => ({ ...p, registered: Boolean(local.get()), ...env() })));
    return () => { alive = false; };
  }, [uid]);
  const refresh = () => setS((p) => ({ ...p, registered: Boolean(local.get()), ...env() }));
  return { ...s, refresh };
}

// Foreground messages: refresh the inbox via a toast instead of an OS notification.
export function onForegroundMessage(cb) {
  return isSupported().then((ok) => (ok ? onMessage(getMessaging(app), cb) : () => {}));
}
```

- [ ] **Step 3: Service worker and manifest**

`parent/public/firebase-messaging-sw.js` — a plain push service worker; it
needs no Firebase config because FCM Web Push delivers the payload as a
standard `push` event:

```js
/* eslint-env serviceworker */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const n = payload.notification || {};
  const link = (payload.fcmOptions && payload.fcmOptions.link) || (payload.data && payload.data.inboxId ? `/inbox?item=${payload.data.inboxId}` : '/inbox');
  event.waitUntil(self.registration.showNotification(n.title || 'BNHS Learner Records', {
    body: n.body || 'BNHS recorded a new attendance event. Tap to view securely.',
    tag: n.tag || (payload.data && payload.data.inboxId) || 'bnhs',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { link },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/inbox';
  const url = new URL(link, self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if (new URL(c.url).origin === self.location.origin && 'focus' in c) { c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
```

`parent/public/manifest.webmanifest`:

```json
{
  "name": "BNHS Learner Records",
  "short_name": "BNHS Records",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#F5F4FC",
  "theme_color": "#5B4FE8",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

Icons: export `src/assets/bnhs_logo.png` (the school seal, square) at
192×192 and 512×512 PNG into `parent/public/icons/`. Any image tool works;
from the repo root with ImageMagick: `magick src/assets/bnhs_logo.png -resize 192x192 parent/public/icons/icon-192.png` and the same for 512.

- [ ] **Step 4: Report and Request-access screens**

`parent/src/screens/Report.jsx`:

```jsx
import { useState } from 'react';
import { callable } from '../firebase.js';
import S from '../strings.js';
import { Btn, Card, Field, Sel, Banner } from '../components/ui.jsx';

const REASONS = [['wrong_time', S.reportReasonWrongTime], ['not_this_learner', S.reportReasonNotThisLearner], ['missing_event', S.reportReasonMissing], ['other', S.reportReasonOther]];

export default function Report({ eventId, studentId, navigate }) {
  const [reason, setReason] = useState('wrong_time'); const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false); const [state, setState] = useState(null);
  const send = async () => {
    setBusy(true); setState(null);
    try { await callable('submitReportFn')({ studentId, eventId, reason, message }); setState('sent'); }
    catch { setState('failed'); }
    setBusy(false);
  };
  if (state === 'sent') return <Card><Banner>{S.reportSent}</Banner><Btn onClick={() => navigate(`/learner/${studentId}`)} style={{ width: '100%' }}>{S.back}</Btn></Card>;
  return (
    <Card>
      <h1 style={{ fontSize: 20 }}>{S.reportTitle}</h1>
      {state === 'failed' && <Banner tone="danger">{S.reportFailed}</Banner>}
      <Field label={S.reportReason}><Sel value={reason} onChange={(e) => setReason(e.target.value)}>{REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Sel></Field>
      <Field label={S.reportMessage}><textarea value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} rows={4} style={{ width: '100%', boxSizing: 'border-box', fontSize: 16, padding: 10, borderRadius: 10, border: '1.5px solid #E7E5F5', fontFamily: 'inherit' }} /></Field>
      <div style={{ display: 'grid', gap: 10 }}>
        <Btn onClick={send} disabled={busy}>{S.send}</Btn>
        <Btn variant="ghost" onClick={() => navigate(`/learner/${studentId}`)}>{S.cancel}</Btn>
      </div>
    </Card>
  );
}
```

`parent/src/screens/RequestAccess.jsx`:

```jsx
import { useState } from 'react';
import { collection, query, where, limit } from 'firebase/firestore';
import { db, callable } from '../firebase.js';
import S from '../strings.js';
import { T } from '../styles.js';
import { Btn, Card, Field, Inp, Sel, Banner } from '../components/ui.jsx';
import { useQuery } from '../hooks/useDoc.js';

const RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Sibling', 'Other'];
const STATUS = { open: S.requestOpen, approved: S.requestApproved, denied: S.requestDenied };

export default function RequestAccess({ user, navigate }) {
  const { rows } = useQuery(() => query(collection(db, 'access_requests'), where('guardianUid', '==', user.uid), limit(10)), [user.uid]);
  const [f, setF] = useState({ studentLrn: '', learnerNameTyped: '', relationship: 'Guardian', contactNumber: '', message: '' });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null);
  const send = async () => {
    setBusy(true); setMsg(null);
    try { await callable('requestAccessFn')(f); setMsg({ tone: 'info', text: S.requestSent }); setF((p) => ({ ...p, studentLrn: '', learnerNameTyped: '', message: '' })); }
    catch (e) { setMsg({ tone: 'danger', text: e?.message || S.reportFailed }); }
    setBusy(false);
  };
  return (
    <>
      <Card>
        <h1 style={{ fontSize: 20 }}>{S.requestTitle}</h1>
        <p style={{ color: T.inkMuted, fontSize: 14 }}>{S.requestBody}</p>
        {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
        <Field label={S.requestLrn}><Inp inputMode="numeric" maxLength={12} value={f.studentLrn} onChange={set('studentLrn')} /></Field>
        <Field label={S.requestName}><Inp value={f.learnerNameTyped} onChange={set('learnerNameTyped')} /></Field>
        <Field label={S.activateRelationship}><Sel value={f.relationship} onChange={set('relationship')}>{RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}</Sel></Field>
        <Field label={S.requestContact}><Inp inputMode="tel" value={f.contactNumber} onChange={set('contactNumber')} /></Field>
        <Field label={S.requestMessage}><Inp value={f.message} maxLength={500} onChange={set('message')} /></Field>
        <div style={{ display: 'grid', gap: 10 }}>
          <Btn onClick={send} disabled={busy || f.studentLrn.length !== 12 || !f.learnerNameTyped || !f.contactNumber}>{S.send}</Btn>
          <Btn variant="ghost" onClick={() => navigate('/')}>{S.back}</Btn>
        </div>
      </Card>
      {rows?.length > 0 && <Card><h2 style={{ fontSize: 16, marginTop: 0 }}>{S.settingsRequests}</h2>{rows.map((r) => <div key={r.id} style={{ fontSize: 14, padding: '6px 0' }}>{r.learnerNameTyped} — <strong>{STATUS[r.status]}</strong>{r.resolutionNote ? `: ${r.resolutionNote}` : ''}</div>)}</Card>}
    </>
  );
}
```

- [ ] **Step 5: Settings**

`parent/src/screens/Settings.jsx`:

```jsx
import { useState } from 'react';
import { signOut } from 'firebase/auth';
import { doc, updateDoc, collection, query, where, limit } from 'firebase/firestore';
import { auth, db, callable } from '../firebase.js';
import S from '../strings.js';
import { T } from '../styles.js';
import { Btn, Card, Banner } from '../components/ui.jsx';
import { useLinks } from '../hooks/useLinks.js';
import { useQuery, useDoc } from '../hooks/useDoc.js';
import { notificationState } from '../lib/notificationState.js';
import { useDeviceStatus, enableOnThisDevice, disableOnThisDevice } from '../lib/notifications.js';

const STATE_TEXT = { on: S.notifOn, off: S.notifOff, blocked: S.notifBlocked, unsupported: S.notifUnsupported, ios_needs_install: S.notifIosInstall, account_off: S.notifOff };

export default function Settings({ user, profile, navigate }) {
  const { links } = useLinks(user.uid);
  const device = useDeviceStatus(user.uid);
  const portal = useDoc('settings/parent_portal').data;
  const { rows: reports } = useQuery(() => query(collection(db, 'reports'), where('guardianUid', '==', user.uid), limit(10)), [user.uid]);
  const accountEnabled = profile?.notificationsEnabled !== false;
  const state = notificationState({ ...device, accountEnabled });
  const [busy, setBusy] = useState(false); const [confirmDelete, setConfirmDelete] = useState(false); const [err, setErr] = useState(null);

  const toggleAccount = () => updateDoc(doc(db, 'guardians', user.uid), { notificationsEnabled: !accountEnabled }).catch(() => setErr(S.reportFailed));
  const enable = async () => { setBusy(true); setErr(null); try { await enableOnThisDevice(user.uid); } catch { setErr(S.notifBlockedHelp); } device.refresh(); setBusy(false); };
  const disable = async () => { setBusy(true); await disableOnThisDevice(user.uid); device.refresh(); setBusy(false); };
  const remove = async () => { setBusy(true); try { await callable('deleteGuardianAccountFn')({}); await signOut(auth); } catch { setErr(S.reportFailed); setBusy(false); } };

  return (
    <>
      <h1 style={{ fontSize: 20 }}>{S.settingsTitle}</h1>
      {err && <Banner tone="danger">{err}</Banner>}
      <Card>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>{S.settingsNotifications}</h2>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 44 }}>
          <input type="checkbox" checked={accountEnabled} onChange={toggleAccount} style={{ width: 22, height: 22 }} />{S.settingsAccountToggle}
        </label>
        <div style={{ fontSize: 13, color: T.inkMuted, marginTop: 8 }}>{S.settingsThisDevice}: {STATE_TEXT[state]}</div>
        {state === 'blocked' && <p style={{ fontSize: 13 }}>{S.notifBlockedHelp}</p>}
        {(state === 'off' || state === 'account_off') && accountEnabled && <Btn onClick={enable} disabled={busy} style={{ marginTop: 8 }}>{S.notifTurnOn}</Btn>}
        {state === 'on' && <Btn variant="ghost" onClick={disable} disabled={busy} style={{ marginTop: 8 }}>{S.notifTurnOff}</Btn>}
        <p style={{ fontSize: 12, color: T.inkMuted }}>{S.pushDisclaimer}</p>
      </Card>
      <Card>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>{S.settingsLearners}</h2>
        {(links || []).map((l) => <div key={l.id} style={{ padding: '6px 0', fontSize: 14 }}>{l.relationship} · <button onClick={() => navigate(`/learner/${l.studentId}`)} style={{ background: 'none', border: 'none', color: T.primary, fontFamily: T.font, fontSize: 14, cursor: 'pointer', padding: 0 }}>{S.homeViewHistory}</button></div>)}
        <Btn variant="ghost" onClick={() => navigate('/activate')} style={{ marginTop: 6 }}>{S.activateAnother}</Btn>
        <p style={{ fontSize: 12, color: T.inkMuted }}>{S.settingsRemoveHint}</p>
      </Card>
      <Card>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>{S.settingsReports}</h2>
        {(reports || []).length === 0 && <div style={{ fontSize: 13, color: T.inkMuted }}>—</div>}
        {(reports || []).map((r) => <div key={r.id} style={{ fontSize: 14, padding: '6px 0' }}>{r.reason} — <strong>{r.status === 'open' ? S.requestOpen : 'Reviewed'}</strong>{r.resolutionNote ? `: ${r.resolutionNote}` : ''}</div>)}
        <Btn variant="ghost" onClick={() => navigate('/request-access')} style={{ marginTop: 6 }}>{S.settingsRequests}</Btn>
      </Card>
      <Card>
        {portal?.privacyNoticeUrl && <p><a href={portal.privacyNoticeUrl} target="_blank" rel="noreferrer">{S.settingsPrivacy}</a></p>}
        {!confirmDelete && <Btn variant="ghost" onClick={() => setConfirmDelete(true)}>{S.settingsDelete}</Btn>}
        {confirmDelete && <><p>{S.settingsDeleteConfirm}</p><div style={{ display: 'grid', gap: 10 }}><Btn variant="danger" onClick={remove} disabled={busy}>{S.settingsDeleteButton}</Btn><Btn variant="ghost" onClick={() => setConfirmDelete(false)}>{S.cancel}</Btn></div></>}
        <Btn variant="ghost" onClick={() => signOut(auth)} style={{ marginTop: 12 }}>{S.signOut}</Btn>
      </Card>
    </>
  );
}
```

Foreground pushes: in `parent/src/App.jsx` add, inside the component after
`useAuth()`:

```jsx
  useEffect(() => {
    if (!user) return;
    let off = () => {};
    onForegroundMessage(() => navigate('/inbox')).then((unsub) => { off = unsub; });
    return () => off();
  }, [user, navigate]);
```

with `import { useEffect } from 'react';` and
`import { onForegroundMessage } from './lib/notifications.js';`.

- [ ] **Step 6: Build and test**

Run: `npm --prefix parent test && npm --prefix parent run build`
Expected: PASS; build emits `parent/dist` with the manifest, SW, and icons.

- [ ] **Step 7: Commit**

```bash
git add parent/
git commit -m "feat(parent): report, access request, settings, push registration, service worker and PWA manifest

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 16: Bundle budget, emulator walkthrough, PWA checks

**Files:**
- Create: `parent/scripts/checkSize.mjs`
- Modify: `parent/package.json` (already has `"size"` script)

- [x] **Step 1: Size check** — DONE, but not as originally specified here.
  See below for what actually shipped and why; this Step 1 text is kept for
  history, not as a description of the current `checkSize.mjs`.

**What actually happened (superseding the script and limit below):** the
naive "sum every file in `dist/assets/`" script below, run against the real
build, measured 263.7 KB — over its own 200 KB limit. Lazy-loading
`firebase/messaging`/`firebase/functions`/`firebase/app-check` and
route-splitting the 8 screens via `React.lazy()` reduced the entry chunk but
could not reduce the *sum of every chunk* (splitting moves bytes into
separate files, it doesn't shrink the total) — the sum-everything
methodology was itself wrong for a "first paint" budget, since a browser
never downloads a lazily-`import()`ed route's code until that route is
visited. The script was rewritten to parse `dist/index.html` for the chunk(s)
actually referenced by an eager `<script type="module">` or
`<link rel="modulepreload">`, and sum only those. Measured that way, the
entry chunk is ~248 KB gzipped — still over 200 KB, because React 19 +
Firestore-with-offline-persistence + Auth + App Check + Functions cannot fit
under 200 KB gzipped without dropping the offline-persistence UX goal. The
user decided to revise the budget to **260 KB gzipped, initial-load-only**
rather than cut that feature; the Global Constraints section above and the
design spec were updated to match. See
`docs/superpowers/plans/2026-09-21-parent-guardian-portal.md`'s Global
Constraints and the design spec §7 for the current, authoritative numbers,
and the actual `parent/scripts/checkSize.mjs` on disk for the current script
(it explicitly guards against finding zero eager paths, which would
otherwise silently "pass" at a false 0 KB).

Original (superseded) `parent/scripts/checkSize.mjs` content, kept for
history only — do not use this version, it measures the wrong thing and
enforces a limit that was revised:

```js
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const LIMIT = 200 * 1024;
const dir = join(process.cwd(), 'dist', 'assets');
let total = 0;
for (const f of readdirSync(dir)) {
  if (!f.endsWith('.js') && !f.endsWith('.css')) continue;
  const gz = gzipSync(readFileSync(join(dir, f))).length;
  total += gz;
  console.log(`${f}: ${(gz / 1024).toFixed(1)} KB gz`);
}
console.log(`total: ${(total / 1024).toFixed(1)} KB gz (limit ${(LIMIT / 1024).toFixed(0)} KB)`);
if (total > LIMIT) { console.error('Bundle budget exceeded'); process.exit(1); }
```

- [ ] **Step 2: Emulator walkthrough (manual, must pass before Phase 5)**

1. Root: `npm run emulators`. Seed via Emulator UI: `settings/app`,
   `settings/parent_portal` (`{notificationsPaused:false, consentVersion:1}`),
   `users/registrar@bnhs.local`, one student/section/enrollment, one kiosk
   account and `kiosks/{uid}`.
2. Issue a code: in the Functions emulator shell or with a tiny Node script
   using the Admin SDK against the emulator, call
   `issueActivationCodes({db, now, uid:'staff', email:'registrar@bnhs.local'}, {sectionId, schoolYear})`
   and note the raw code (Phase 5 gives the registrar a UI for this).
3. `parent/.env` with `VITE_USE_EMULATORS=true`; `npm --prefix parent run dev`;
   open `http://localhost:5174/activate?c=<code>`.
4. Sign in with email/password (Emulator Auth) → the emulator prints the
   verification link in its log; open it → Continue → Consent → code
   pre-filled → Link learner → success shows the learner's name.
5. Home shows "No entry recorded today". Scan on the kiosk (Task 4 dev
   server) → the card updates to "Entered 07:12 AM" without reload; Inbox
   shows the item; Functions log shows `scan_processed`.
6. History: the event row, "Report this record" → send → Settings shows the
   report as waiting.
7. Settings → Turn on for this device (Chrome): permission prompt appears
   only now; device doc appears under `guardians/{uid}/devices`.
8. Settings → Delete my account → confirm → signed out; Firestore shows the
   profile gone and the link revoked.
9. DevTools → Application → Manifest: installable; Service Workers: active.
10. Responsive mode at 320 px: no horizontal scroll on any screen.

- [x] **Step 3: Commit** — DONE, as three commits rather than one, reflecting
  the investigation above: `f0efd79` (original script), `1d267df`
  (lazy-loading fix attempt), `86dcfd0` (measurement fix + budget revision to
  260 KB, with the spec/plan updated). All three carry
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (the session's
  actual attribution at the time — not the "Claude Opus 5" this plan
  document was originally written under).

---

## Phase 5 — SIMS Guardians area (`src/`)

### Task 17: SIMS wiring — callables, App Check, Guardians page with Devices and Portal Settings tabs

**Files:**
- Modify: `src/firebase.js`, `src/App.jsx`, `src/components/Shell.jsx`, `src/hooks/useCollection.js`
- Create: `src/data/guardians.js`, `src/pages/GuardiansPage.jsx`, `src/pages/guardians/DevicesTab.jsx`, `src/pages/guardians/PortalSettingsTab.jsx`

**Interfaces:**
- Produces:
  - `src/firebase.js` additionally exports `functions`
  - `src/data/guardians.js` exports `call = { issueActivationCodes, revokeCode, resolveAccessRequest, revokeLink, setActivationRestricted, registerKiosk, deactivateKiosk, resolveReport, correctEvent, addManualEvent }` (each `(data) => Promise<result.data>`) and `updatePortalSettings(fields, me)`
  - `useQueryRows(buildQuery, deps)` in `src/hooks/useCollection.js` → array (bounded query listener)
  - `GuardiansPage({ schoolYear, me })` with tabs `devices | codes | requests | reports | links | scanlog | audit | settings`

- [ ] **Step 1: Firebase wiring in the SIMS**

Replace `src/firebase.js`:

```js
import { initializeApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
if (import.meta.env.VITE_APPCHECK_DEBUG_TOKEN) self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
if (import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
  initializeAppCheck(app, { provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
}
export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app, 'asia-southeast1');
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
enableIndexedDbPersistence(db).catch(() => {});
```

`src/data/guardians.js`:

```js
import { httpsCallable } from 'firebase/functions';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, functions } from '../firebase.js';

const fn = (name) => async (data) => (await httpsCallable(functions, name)(data)).data;

// Every staff action on the parent portal goes through a callable so it is
// validated and audited server-side (spec §8). Names match functions/index.js.
export const call = {
  issueActivationCodes: fn('issueActivationCodesFn'),
  revokeCode: fn('revokeCodeFn'),
  resolveAccessRequest: fn('resolveAccessRequestFn'),
  revokeLink: fn('revokeLinkFn'),
  setActivationRestricted: fn('setActivationRestrictedFn'),
  registerKiosk: fn('registerKioskFn'),
  deactivateKiosk: fn('deactivateKioskFn'),
  resolveReport: fn('resolveReportFn'),
  correctEvent: fn('correctEventFn'),
  addManualEvent: fn('addManualEventFn'),
};

// The pause switch and banners are a direct staff write; the
// onParentPortalSettingsChanged trigger records the audit entry.
export const updatePortalSettings = (fields, me) =>
  setDoc(doc(db, 'settings', 'parent_portal'), { ...fields, updatedBy: me.email, updatedAt: serverTimestamp() }, { merge: true });
```

Append to `src/hooks/useCollection.js`:

```js
import { onSnapshot as onQuerySnapshot } from 'firebase/firestore';

// Bounded query listener for the Guardians area. buildQuery must include a
// limit(); never use useCollection() on audit_log, scan_events, reports,
// access_requests or guardian_links.
export function useQueryRows(buildQuery, deps) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    const q = buildQuery();
    if (!q) { setRows([]); return; }
    return onQuerySnapshot(q, (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setRows([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return rows;
}
```

(`useState`, `useEffect` are already imported at the top of that file.)

- [ ] **Step 2: Navigation and page switch**

In `src/components/Shell.jsx` add to `NAV` after `idcards`:
`{ k: 'guardians', label: 'Guardians' },`.

In `src/App.jsx` add `import GuardiansPage from './pages/GuardiansPage.jsx';`
and, after the `idcards` line:
`{page==='guardians' && <GuardiansPage schoolYear={schoolYear} me={me} />}`.

- [ ] **Step 3: Guardians page shell**

`src/pages/GuardiansPage.jsx`:

```jsx
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

const TABS = [
  ['codes', 'Activation slips'], ['requests', 'Access requests'], ['reports', 'Reports'], ['links', 'Learner access'],
  ['devices', 'Kiosk devices'], ['scanlog', 'Scan log'], ['audit', 'Audit log'], ['settings', 'Portal settings'],
];

// Until Tasks 18–19 land, import only the tabs that exist and leave the
// others out of TABS; the page must build at every step.
export default function GuardiansPage({ schoolYear, me }) {
  const [tab, setTab] = useState('codes');
  return (
    <div>
      <div style={S.plate}><h1 style={S.h1}>Guardians</h1></div>
      <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
        {TABS.map(([k, label]) => {
          const active = tab === k;
          return <button key={k} role="tab" aria-selected={active} onClick={() => setTab(k)} style={{ fontFamily: T.body, fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', cursor: 'pointer', padding: '9px 16px', borderRadius: T.pill, border: 'none', background: active ? T.primary : 'transparent', color: active ? '#fff' : T.inkMuted }}>{label}</button>;
        })}
      </div>
      {tab === 'codes' && <CodesTab schoolYear={schoolYear} />}
      {tab === 'requests' && <RequestsTab schoolYear={schoolYear} />}
      {tab === 'reports' && <ReportsTab />}
      {tab === 'links' && <LinksTab schoolYear={schoolYear} />}
      {tab === 'devices' && <DevicesTab />}
      {tab === 'scanlog' && <ScanLogTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'settings' && <PortalSettingsTab me={me} />}
    </div>
  );
}
```

- [ ] **Step 4: Devices tab**

`src/pages/guardians/DevicesTab.jsx`:

```jsx
import { useState } from 'react';
import { useCollection } from '../../hooks/useCollection.js';
import { call } from '../../data/guardians.js';
import { T, S } from '../../styles.js';
import { Btn, Inp, Field, Card, Confirm } from '../../components/ui.jsx';

// Kiosk accounts are created by hand in Firebase Auth (console → Users →
// Add user, e.g. kiosk-gate1@bnhs.local + a generated 16+ char password);
// this tab allow-lists the resulting UID and labels the gate.
export default function DevicesTab() {
  const kiosks = useCollection('kiosks');
  const [uid, setUid] = useState(''); const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [confirm, setConfirm] = useState(null);

  const register = async () => {
    setBusy(true); setErr('');
    try { await call.registerKiosk({ uid: uid.trim(), label: label.trim() }); setUid(''); setLabel(''); }
    catch (e) { setErr(e.message || 'Could not register the device.'); }
    setBusy(false);
  };
  const deactivate = async (k) => { await call.deactivateKiosk({ uid: k.id, reason: 'Deactivated from SIMS' }); setConfirm(null); };

  return (
    <>
      <Card style={{ padding: 20, marginBottom: 16 }}>
        <h2 style={S.h2}>Register a kiosk device</h2>
        <p style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted }}>Create the device's email/password user in Firebase Authentication first, then paste its UID here. Sign the device in at the kiosk's <code>/setup</code> page.</p>
        {err && <div style={{ color: T.absent, fontSize: 12, marginBottom: 8 }}>{err}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 12, alignItems: 'end' }}>
          <Field label="Auth UID"><Inp value={uid} onChange={(e) => setUid(e.target.value)} /></Field>
          <Field label="Gate label (shown to parents)"><Inp value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Main Gate" /></Field>
          <Btn onClick={register} disabled={busy || !uid || !label} style={{ marginBottom: 14 }}>Register</Btn>
        </div>
      </Card>
      <Card>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: T.body, fontSize: 13 }}>
          <thead style={S.thead}><tr><th style={S.th}>Label</th><th style={S.th}>UID</th><th style={S.th}>Status</th><th style={S.th}>Last seen</th><th style={S.th}></th></tr></thead>
          <tbody>
            {kiosks.map((k) => (
              <tr key={k.id}>
                <td style={S.td}>{k.label}</td><td style={{ ...S.td, ...T.num }}>{k.id}</td>
                <td style={S.td}>{k.active ? 'Active' : 'Deactivated'}</td>
                <td style={S.td}>{k.lastSeenAt?.toDate ? k.lastSeenAt.toDate().toLocaleString() : '—'}</td>
                <td style={S.td}>{k.active ? <Btn variant="ghost" onClick={() => setConfirm(k)}>Deactivate</Btn> : <Btn variant="ghost" onClick={() => call.registerKiosk({ uid: k.id, label: k.label })}>Re-activate</Btn>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {confirm && <Confirm message={`Deactivate "${confirm.label}"? The kiosk stops scanning within seconds.`} label="Deactivate" onYes={() => deactivate(confirm)} onNo={() => setConfirm(null)} />}
    </>
  );
}
```

- [ ] **Step 5: Portal settings tab (pause switch, announcement, consent version)**

`src/pages/guardians/PortalSettingsTab.jsx`:

```jsx
import { useEffect, useState } from 'react';
import { useDoc } from '../../hooks/useCollection.js';
import { updatePortalSettings } from '../../data/guardians.js';
import { T, S } from '../../styles.js';
import { Btn, Inp, Field, Card } from '../../components/ui.jsx';

export default function PortalSettingsTab({ me }) {
  const portal = useDoc('settings/parent_portal');
  const [note, setNote] = useState(''); const [announcement, setAnnouncement] = useState(''); const [url, setUrl] = useState('');
  useEffect(() => { if (portal) { setAnnouncement(portal.announcement || ''); setUrl(portal.privacyNoticeUrl || ''); } }, [portal]);
  const paused = portal?.notificationsPaused === true;

  const togglePause = () => updatePortalSettings(paused
    ? { notificationsPaused: false, pauseNote: '', pausedBy: me.email }
    : { notificationsPaused: true, pauseNote: note.trim(), pausedBy: me.email, pausedAt: new Date() }, me);

  return (
    <>
      <Card style={{ padding: 20, marginBottom: 16, borderColor: paused ? T.absent : T.border }}>
        <h2 style={S.h2}>Emergency switch — parent notifications</h2>
        <p style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted }}>
          {paused ? `PAUSED since ${portal.pausedAt?.toDate?.().toLocaleString() || '—'} by ${portal.pausedBy || '—'}: "${portal.pauseNote}". Gate scans are still recorded and appear in parents' inboxes; pushes are not sent.` : 'Notifications are being sent. Pausing stops pushes within 30 seconds; scans and inbox items continue.'}
        </p>
        {!paused && <Field label="Reason (shown to parents)"><Inp value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Kiosk maintenance today" /></Field>}
        <Btn onClick={togglePause} disabled={!paused && !note.trim()} style={{ background: paused ? T.primary : T.absent }}>{paused ? 'Resume notifications' : 'Pause notifications'}</Btn>
      </Card>
      <Card style={{ padding: 20 }}>
        <h2 style={S.h2}>Portal banner and privacy notice</h2>
        <Field label="Announcement shown to all parents (blank = none)"><Inp value={announcement} onChange={(e) => setAnnouncement(e.target.value)} /></Field>
        <Field label="Privacy notice URL"><Inp value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
        <Field label="Consent version (raise it to require every parent to re-accept)"><Inp type="number" value={portal?.consentVersion ?? 1} onChange={(e) => updatePortalSettings({ consentVersion: Number(e.target.value) }, me)} style={{ width: 120 }} /></Field>
        <Btn onClick={() => updatePortalSettings({ announcement: announcement.trim(), privacyNoticeUrl: url.trim() }, me)}>Save</Btn>
      </Card>
    </>
  );
}
```

- [ ] **Step 6: Build with only these two tabs wired**

Temporarily reduce `TABS` and the tab render list in `GuardiansPage.jsx` to
`devices` and `settings` (the other tab imports are added in Tasks 18–19).

Run: `npm run build && npm test` — Expected: build OK, existing tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/firebase.js src/App.jsx src/components/Shell.jsx src/hooks/useCollection.js src/data/guardians.js src/pages/GuardiansPage.jsx src/pages/guardians/
git commit -m "feat(sims): Guardians area with kiosk device registry and portal emergency switch

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 18: Activation slips — issue and print

**Files:**
- Create: `src/lib/slipLayout.js` (+`.test.js`), `src/components/ActivationSlipsPrintable.jsx`, `src/pages/guardians/CodesTab.jsx`
- Modify: `src/pages/GuardiansPage.jsx` (add the tab)

**Interfaces:**
- Produces: `chunkSlips(slips, perSheet = 10)` → `slips[][]`; `activationUrl(base, code)`; `SLIP_PRINT_STYLES`;
  `ActivationSlipsPrintable({ slips, portalUrl })`

- [ ] **Step 1: Failing test**

`src/lib/slipLayout.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { chunkSlips, activationUrl, SLIPS_PER_SHEET } from './slipLayout.js';
describe('slipLayout', () => {
  it('chunks 10 per A4 sheet, last sheet partial', () => {
    const slips = Array.from({ length: 23 }, (_, i) => ({ studentId: `S${i}` }));
    const sheets = chunkSlips(slips);
    expect(SLIPS_PER_SHEET).toBe(10);
    expect(sheets.map((s) => s.length)).toEqual([10, 10, 3]);
    expect(chunkSlips([])).toEqual([]);
  });
  it('builds the QR deep link without a trailing slash problem', () => {
    expect(activationUrl('https://bnhs-parent.web.app', 'K7M4P2XQ')).toBe('https://bnhs-parent.web.app/activate?c=K7M4P2XQ');
    expect(activationUrl('https://bnhs-parent.web.app/', 'K7M4P2XQ')).toBe('https://bnhs-parent.web.app/activate?c=K7M4P2XQ');
  });
});
```

Run: `npx vitest run src/lib/slipLayout.test.js` — Expected: FAIL.

- [ ] **Step 2: Implement**

`src/lib/slipLayout.js`:

```js
export const SLIPS_PER_SHEET = 10; // 2 columns × 5 rows on A4 portrait

export function chunkSlips(slips, perSheet = SLIPS_PER_SHEET) {
  const out = [];
  for (let i = 0; i < slips.length; i += perSheet) out.push(slips.slice(i, i + perSheet));
  return out;
}
export const activationUrl = (base, code) => `${base.replace(/\/+$/, '')}/activate?c=${code}`;

export const SLIP_PRINT_STYLES = `
  .slips-sheet { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; }
  .slip { border: 1px dashed #999; border-radius: 6px; padding: 8px 10px; break-inside: avoid; display: grid; grid-template-columns: 96px 1fr; gap: 10px; align-items: center; font-family: Inter, system-ui, sans-serif; color: #1E1B33; }
  .slip-code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 20px; letter-spacing: 0.12em; font-weight: 700; }
  .slip-small { font-size: 9px; color: #444; line-height: 1.25; }
  @media print {
    body * { visibility: hidden; }
    .slips-print-root, .slips-print-root * { visibility: visible; }
    .slips-print-root { position: absolute; left: 0; top: 0; width: 100%; }
    .slips-sheet { page-break-after: always; }
    .slips-sheet:last-child { page-break-after: auto; }
    @page { size: A4 portrait; margin: 12mm; }
  }
`;
```

`src/components/ActivationSlipsPrintable.jsx`:

```jsx
import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { chunkSlips, activationUrl, formatCodeForPrint, SLIP_PRINT_STYLES } from '../lib/slipLayout.js';

function Slip({ slip, portalUrl }) {
  const [qr, setQr] = useState(null);
  const url = activationUrl(portalUrl, slip.code);
  useEffect(() => { let on = true; QRCode.toDataURL(url, { margin: 0, width: 96 }).then((u) => on && setQr(u)).catch(() => {}); return () => { on = false; }; }, [url]);
  return (
    <div className="slip">
      {qr ? <img src={qr} alt="" width={96} height={96} /> : <div style={{ width: 96, height: 96 }} />}
      <div>
        <div style={{ fontWeight: 700, fontSize: 12 }}>{slip.name}</div>
        <div className="slip-small">{slip.sectionLabel} · LRN {slip.lrn}</div>
        <div className="slip-code">{formatCodeForPrint(slip.code)}</div>
        <div className="slip-small">Parent/guardian: scan the QR or go to {portalUrl.replace(/^https?:\/\//, '')} and enter this code. Valid 90 days, for up to 2 guardians. Keep it private. By activating you agree to the school's privacy notice for gate-scan updates.</div>
      </div>
    </div>
  );
}

export default function ActivationSlipsPrintable({ slips, portalUrl }) {
  const sheets = useMemo(() => chunkSlips(slips), [slips]);
  return (
    <div className="slips-print-root">
      <style>{SLIP_PRINT_STYLES}</style>
      {sheets.map((sheet, i) => <div className="slips-sheet" key={i}>{sheet.map((s) => <Slip key={s.studentId} slip={s} portalUrl={portalUrl} />)}</div>)}
    </div>
  );
}
```

Add to `src/lib/slipLayout.js`:

```js
export const formatCodeForPrint = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;
```

- [ ] **Step 3: Codes tab**

`src/pages/guardians/CodesTab.jsx`:

```jsx
import { useMemo, useState } from 'react';
import { useCollection } from '../../hooks/useCollection.js';
import { call } from '../../data/guardians.js';
import { T, S } from '../../styles.js';
import { Btn, Sel, Field, Card, EmptyState } from '../../components/ui.jsx';
import ActivationSlipsPrintable from '../../components/ActivationSlipsPrintable.jsx';

const PORTAL_URL = import.meta.env.VITE_PARENT_PORTAL_URL || 'https://bnhs-parent.web.app';

// Raw codes exist only in this component's state after issuing. Closing the
// page loses them; the registrar reissues (which revokes the old codes).
export default function CodesTab({ schoolYear }) {
  const sections = useCollection('sections');
  const sectionsSY = useMemo(() => sections.filter((s) => s.schoolYear === schoolYear).sort((a, b) => a.gradeLevel - b.gradeLevel || a.name.localeCompare(b.name)), [sections, schoolYear]);
  const [sectionId, setSectionId] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [result, setResult] = useState(null);

  const issue = async () => {
    if (!window.confirm('Issue new activation slips for this section? Any previously printed slips for these learners stop working.')) return;
    setBusy(true); setErr('');
    try { setResult(await call.issueActivationCodes({ sectionId, schoolYear })); }
    catch (e) { setErr(e.message || 'Could not issue codes.'); }
    setBusy(false);
  };

  return (
    <>
      <Card style={{ padding: 20, marginBottom: 16 }} className="no-print">
        <h2 style={S.h2}>Issue activation slips</h2>
        <p style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted }}>One slip per enrolled learner. Print them right away — codes are shown only once. Hand them to parents in person (adviser/homeroom). Learners flagged "restricted" are skipped.</p>
        {err && <div style={{ color: T.absent, fontSize: 12, marginBottom: 8 }}>{err}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'end' }}>
          <Field label="Section"><Sel value={sectionId} onChange={(e) => { setSectionId(e.target.value); setResult(null); }}><option value="">Choose a section…</option>{sectionsSY.map((s) => <option key={s.id} value={s.id}>{`${s.name} · Grade ${s.gradeLevel}${s.strand ? ` · ${s.strand}` : ''}`}</option>)}</Sel></Field>
          <Btn onClick={issue} disabled={busy || !sectionId} style={{ marginBottom: 14 }}>{busy ? 'Issuing…' : 'Issue slips'}</Btn>
          <Btn variant="ghost" onClick={() => window.print()} disabled={!result?.slips?.length} style={{ marginBottom: 14 }}>Print</Btn>
        </div>
        {result && <div style={{ fontFamily: T.body, fontSize: 13 }}>{result.slips.length} slips issued{result.skipped.length ? `, ${result.skipped.length} skipped (${result.skipped.map((s) => s.reason).join(', ')})` : ''}.</div>}
      </Card>
      {result?.slips?.length ? <ActivationSlipsPrintable slips={result.slips} portalUrl={PORTAL_URL} /> : <EmptyState title="No slips issued yet" hint="Choose a section and issue slips to print them." />}
    </>
  );
}
```

Add `VITE_PARENT_PORTAL_URL=` to the root `.env.example`.

- [ ] **Step 4: Wire the tab, test, commit**

In `src/pages/GuardiansPage.jsx` add `codes` back to `TABS` and the render
list (import `CodesTab`).

Run: `npm test && npm run build` — Expected: PASS, build OK. Manually on the
emulator: Guardians → Activation slips → choose a section → Issue → Print
preview shows 2×5 slips per A4 page with QR codes; `activation_codes`
contains hashes only.

```bash
git add src/lib/slipLayout.js src/lib/slipLayout.test.js src/components/ActivationSlipsPrintable.jsx src/pages/guardians/CodesTab.jsx src/pages/GuardiansPage.jsx .env.example
git commit -m "feat(sims): issue and print activation slips with QR deep links

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 19: Requests, Reports, Learner access, Scan log, Audit tabs

**Files:**
- Create: `src/pages/guardians/RequestsTab.jsx`, `ReportsTab.jsx`, `LinksTab.jsx`, `ScanLogTab.jsx`, `AuditTab.jsx`
- Modify: `src/pages/GuardiansPage.jsx` (all tabs enabled)

**Interfaces:**
- Consumes: `call.*`, `useQueryRows`, `useCollection('students')`, `fullName` from `src/lib/roster.js`, `formatScanTime` from `src/lib/attendance.js`.

- [ ] **Step 1: Shared bits**

All five tabs use this small table helper — put it at the top of
`src/pages/guardians/RequestsTab.jsx` and export it for the others:

```jsx
import { T, S } from '../../styles.js';
export function Table({ head, rows }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: T.body, fontSize: 13 }}>
      <thead style={S.thead}><tr>{head.map((h) => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
      <tbody>{rows}</tbody>
    </table>
  );
}
export const when = (ts) => (ts?.toDate ? ts.toDate().toLocaleString() : '—');
```

- [ ] **Step 2: Requests tab**

```jsx
// src/pages/guardians/RequestsTab.jsx (below the helpers above)
import { useMemo, useState } from 'react';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useCollection, useQueryRows } from '../../hooks/useCollection.js';
import { call } from '../../data/guardians.js';
import { fullName } from '../../lib/roster.js';
import { Btn, Inp, Card, EmptyState } from '../../components/ui.jsx';

export default function RequestsTab({ schoolYear }) {
  const open = useQueryRows(() => query(collection(db, 'access_requests'), where('status', '==', 'open'), orderBy('createdAt', 'desc'), limit(50)), []);
  const students = useCollection('students');
  const enrollments = useCollection('enrollments');
  const byLrn = useMemo(() => new Map(students.map((s) => [s.lrn, s])), [students]);
  const [notes, setNotes] = useState({});
  const note = (id) => notes[id] || '';

  const resolve = async (r, approve) => {
    const student = byLrn.get(r.studentLrn);
    if (approve && !student) return;
    await call.resolveAccessRequest({ id: r.id, approve, studentId: student?.id, note: note(r.id) });
  };

  if (open.length === 0) return <EmptyState title="No open access requests" hint="Parents who lost their slip or have a custody change appear here." />;
  return (
    <Card>
      <Table head={['Requested', 'Guardian', 'Learner (typed)', 'On record', 'Contact', 'Message', 'Note / action']} rows={open.map((r) => {
        const s = byLrn.get(r.studentLrn);
        const enrolled = s && enrollments.some((e) => e.studentId === s.id && e.schoolYear === schoolYear && e.status === 'enrolled');
        return (
          <tr key={r.id}>
            <td style={S.td}>{when(r.createdAt)}</td>
            <td style={S.td}>{r.guardianEmail}<br /><span style={{ color: T.inkMuted }}>{r.relationship}</span></td>
            <td style={S.td}>{r.learnerNameTyped}<br /><span style={{ ...T.num, color: T.inkMuted }}>{r.studentLrn}</span></td>
            <td style={S.td}>{s ? <>{fullName(s)}<br /><span style={{ color: T.inkMuted }}>Guardian on file: {s.guardianName || '—'} ({s.guardianRelationship || '—'}) {s.guardianContact || ''}</span>{!enrolled && <div style={{ color: T.absent }}>Not enrolled this SY</div>}{s.activationRestricted && <div style={{ color: T.absent }}>RESTRICTED</div>}</> : <span style={{ color: T.absent }}>No learner with this LRN</span>}</td>
            <td style={{ ...S.td, ...T.num }}>{r.contactNumber}</td>
            <td style={S.td}>{r.message}</td>
            <td style={S.td}>
              <Inp value={note(r.id)} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} placeholder="Note to the parent" style={{ marginBottom: 6 }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <Btn onClick={() => resolve(r, true)} disabled={!s || !enrolled || s.activationRestricted}>Approve</Btn>
                <Btn variant="ghost" onClick={() => resolve(r, false)}>Deny</Btn>
              </div>
            </td>
          </tr>
        );
      })} />
    </Card>
  );
}
```

- [ ] **Step 3: Reports tab**

`src/pages/guardians/ReportsTab.jsx`:

```jsx
import { useMemo, useState } from 'react';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useCollection, useQueryRows } from '../../hooks/useCollection.js';
import { call } from '../../data/guardians.js';
import { fullName } from '../../lib/roster.js';
import { T, S } from '../../styles.js';
import { Btn, Inp, Sel, Card, EmptyState } from '../../components/ui.jsx';
import { Table, when } from './RequestsTab.jsx';

const REASON = { wrong_time: 'Wrong time', not_this_learner: 'Not this learner', missing_event: 'Missing scan', other: 'Other' };

export default function ReportsTab() {
  const open = useQueryRows(() => query(collection(db, 'reports'), where('status', '==', 'open'), orderBy('createdAt', 'desc'), limit(50)), []);
  const students = useCollection('students');
  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const [draft, setDraft] = useState({});
  const d = (id) => draft[id] || { note: '', action: 'none' };
  const set = (id, k, v) => setDraft((p) => ({ ...p, [id]: { ...d(id), [k]: v } }));

  const resolve = async (r) => {
    const { note, action } = d(r.id);
    if (action === 'voided') await call.correctEvent({ studentId: r.studentId, eventId: r.eventId, reason: note });
    await call.resolveReport({ id: r.id, note, action });
  };

  if (open.length === 0) return <EmptyState title="No open reports" hint="Records parents flagged as possibly wrong appear here." />;
  return (
    <Card>
      <Table head={['Filed', 'Learner', 'Event', 'Reason', 'Message', 'Resolution']} rows={open.map((r) => (
        <tr key={r.id}>
          <td style={S.td}>{when(r.createdAt)}</td>
          <td style={S.td}>{byId.get(r.studentId) ? fullName(byId.get(r.studentId)) : r.studentId}</td>
          <td style={{ ...S.td, ...T.num, fontSize: 11 }}>{r.eventId}</td>
          <td style={S.td}>{REASON[r.reason] || r.reason}</td>
          <td style={S.td}>{r.message}</td>
          <td style={S.td}>
            <Sel value={d(r.id).action} onChange={(e) => set(r.id, 'action', e.target.value)} style={{ marginBottom: 6 }}>
              <option value="none">Record is correct — no change</option>
              <option value="voided">Void this scan (shown as corrected)</option>
              <option value="corrected">Corrected another way (see Learner access → add manual scan)</option>
            </Sel>
            <Inp value={d(r.id).note} onChange={(e) => set(r.id, 'note', e.target.value)} placeholder="Note to the parent (required)" style={{ marginBottom: 6 }} />
            <Btn onClick={() => resolve(r)} disabled={!d(r.id).note.trim()}>Resolve</Btn>
          </td>
        </tr>
      ))} />
    </Card>
  );
}
```

- [ ] **Step 4: Learner access tab (links, restrict, manual scan)**

`src/pages/guardians/LinksTab.jsx`:

```jsx
import { useMemo, useState } from 'react';
import { collection, query, where, limit } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useCollection, useQueryRows } from '../../hooks/useCollection.js';
import { call } from '../../data/guardians.js';
import { fullName } from '../../lib/roster.js';
import { localDate } from '../../lib/dates.js';
import { T, S } from '../../styles.js';
import { Btn, Inp, Sel, Field, Card, EmptyState } from '../../components/ui.jsx';
import { Table, when } from './RequestsTab.jsx';

export default function LinksTab({ schoolYear }) {
  const students = useCollection('students');
  const [q, setQ] = useState(''); const [studentId, setStudentId] = useState('');
  const matches = useMemo(() => q.length < 2 ? [] : students.filter((s) => `${s.lastName} ${s.firstName} ${s.lrn}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8), [students, q]);
  const student = students.find((s) => s.id === studentId);
  const links = useQueryRows(() => studentId && query(collection(db, 'guardian_links'), where('studentId', '==', studentId), limit(20)), [studentId]);
  const [reason, setReason] = useState('');
  const [manual, setManual] = useState({ kind: 'in', date: localDate(), time: '', reason: '' });

  return (
    <>
      <Card style={{ padding: 20, marginBottom: 16 }}>
        <Field label="Find a learner (name or LRN)"><Inp value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        {matches.map((s) => <Btn key={s.id} variant="ghost" onClick={() => { setStudentId(s.id); setQ(''); }} style={{ marginRight: 6, marginBottom: 6 }}>{fullName(s)} · {s.lrn}</Btn>)}
      </Card>
      {!student && <EmptyState title="Choose a learner" hint="See who can view their gate scans, revoke access, restrict self-service activation, or add a manual scan." />}
      {student && (
        <>
          <Card style={{ padding: 20, marginBottom: 16 }}>
            <h2 style={S.h2}>{fullName(student)} · {student.lrn} {student.activationRestricted && <span style={{ color: T.absent }}>· RESTRICTED</span>}</h2>
            <Field label="Reason (recorded in the audit log)"><Inp value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" disabled={!reason.trim()} onClick={() => call.revokeCode({ studentId: student.id, schoolYear, reason })}>Revoke unused slip</Btn>
              <Btn variant="ghost" disabled={!reason.trim()} style={{ color: T.absent, borderColor: T.absent }} onClick={() => call.setActivationRestricted({ studentId: student.id, restricted: !student.activationRestricted, reason })}>{student.activationRestricted ? 'Lift restriction' : 'Restrict (custody) — revokes all access'}</Btn>
            </div>
          </Card>
          <Card style={{ marginBottom: 16 }}>
            {links.length === 0 ? <EmptyState title="No guardians linked" /> : (
              <Table head={['Guardian', 'Relationship', 'Status', 'Activated', 'Via', 'Revoked', '']} rows={links.map((l) => (
                <tr key={l.id}>
                  <td style={{ ...S.td, ...T.num, fontSize: 11 }}>{l.guardianUid}</td><td style={S.td}>{l.relationship}</td><td style={S.td}>{l.status}</td>
                  <td style={S.td}>{when(l.activatedAt)}</td><td style={S.td}>{l.activatedVia}</td>
                  <td style={S.td}>{l.status === 'revoked' ? `${when(l.revokedAt)} — ${l.revokedReason || ''}` : '—'}</td>
                  <td style={S.td}>{l.status === 'active' && <Btn variant="ghost" disabled={!reason.trim()} onClick={() => call.revokeLink({ linkId: l.id, reason })}>Revoke</Btn>}</td>
                </tr>
              ))} />
            )}
          </Card>
          <Card style={{ padding: 20 }}>
            <h2 style={S.h2}>Add a manual gate scan (e.g. kiosk was down)</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto 1fr auto', gap: 12, alignItems: 'end' }}>
              <Field label="Kind"><Sel value={manual.kind} onChange={(e) => setManual({ ...manual, kind: e.target.value })}><option value="in">Entered</option><option value="out">Left</option></Sel></Field>
              <Field label="Date"><Inp type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} /></Field>
              <Field label="Time"><Inp type="time" value={manual.time} onChange={(e) => setManual({ ...manual, time: e.target.value })} /></Field>
              <Field label="Reason (shown to the parent)"><Inp value={manual.reason} onChange={(e) => setManual({ ...manual, reason: e.target.value })} /></Field>
              <Btn style={{ marginBottom: 14 }} disabled={!manual.time || !manual.reason.trim()} onClick={() => call.addManualEvent({ studentId: student.id, ...manual })}>Add</Btn>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 5: Scan log and audit tabs**

`src/pages/guardians/ScanLogTab.jsx`:

```jsx
import { useMemo, useState } from 'react';
import { collection, query, where, limit } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useCollection, useQueryRows } from '../../hooks/useCollection.js';
import { fullName } from '../../lib/roster.js';
import { localDate } from '../../lib/dates.js';
import { formatScanTime } from '../../lib/attendance.js';
import { T, S } from '../../styles.js';
import { Inp, Sel, Field, Card, EmptyState } from '../../components/ui.jsx';
import { Table, when } from './RequestsTab.jsx';

export default function ScanLogTab() {
  const [date, setDate] = useState(localDate()); const [deviceId, setDeviceId] = useState('');
  const kiosks = useCollection('kiosks'); const students = useCollection('students');
  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const rows = useQueryRows(() => {
    const base = [collection(db, 'scan_events'), where('scannedDate', '==', date)];
    return query(...base, ...(deviceId ? [where('deviceId', '==', deviceId)] : []), limit(500));
  }, [date, deviceId]);
  const sorted = useMemo(() => [...rows].sort((a, b) => (a.scannedTime < b.scannedTime ? 1 : -1)), [rows]);
  return (
    <>
      <Card style={{ padding: 20, marginBottom: 16, display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: 12, alignItems: 'end' }}>
        <Field label="Date"><Inp type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Device"><Sel value={deviceId} onChange={(e) => setDeviceId(e.target.value)}><option value="">All</option>{kiosks.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}<option value="staff">School office (manual)</option></Sel></Field>
        <div style={{ fontFamily: T.body, fontSize: 13, color: T.inkMuted, marginBottom: 14 }}>{rows.length} raw events (append-only; corrections appear as separate rows)</div>
      </Card>
      <Card>
        {sorted.length === 0 ? <EmptyState title="No scans for this date" /> : (
          <Table head={['Time', 'Learner', 'Kind', 'Device', 'Received', 'Note']} rows={sorted.map((e) => (
            <tr key={e.id}>
              <td style={{ ...S.td, ...T.num }}>{formatScanTime(e.scannedTime)}</td>
              <td style={S.td}>{byId.get(e.studentId) ? fullName(byId.get(e.studentId)) : e.studentId}</td>
              <td style={S.td}>{e.kind}{e.voidsEventId ? ` → ${e.voidsEventId}` : ''}</td>
              <td style={S.td}>{kiosks.find((k) => k.id === e.deviceId)?.label || e.deviceId}</td>
              <td style={S.td}>{when(e.receivedAt)}</td>
              <td style={S.td}>{e.note || ''}{e.createdBy ? ` (${e.createdBy})` : ''}</td>
            </tr>
          ))} />
        )}
      </Card>
    </>
  );
}
```

`src/pages/guardians/AuditTab.jsx`:

```jsx
import { useState } from 'react';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase.js';
import { useQueryRows } from '../../hooks/useCollection.js';
import { S } from '../../styles.js';
import { Inp, Field, Card, EmptyState } from '../../components/ui.jsx';
import { Table, when } from './RequestsTab.jsx';

export default function AuditTab() {
  const [target, setTarget] = useState('');
  const rows = useQueryRows(() => {
    const base = [collection(db, 'audit_log')];
    return target.trim() ? query(...base, where('targetId', '==', target.trim()), limit(100)) : query(...base, orderBy('at', 'desc'), limit(100));
  }, [target]);
  return (
    <>
      <Card style={{ padding: 20, marginBottom: 16 }}>
        <Field label="Filter by target ID (learner ID, guardian UID, link ID, kiosk UID, request/report ID)"><Inp value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
      </Card>
      <Card>
        {rows.length === 0 ? <EmptyState title="No audit entries" /> : (
          <Table head={['When', 'Action', 'Actor', 'Target', 'Details']} rows={rows.map((a) => (
            <tr key={a.id}><td style={S.td}>{when(a.at)}</td><td style={S.td}>{a.action}</td><td style={S.td}>{a.actorType}: {a.actorUid || '—'}</td><td style={S.td}>{a.targetType}/{a.targetId}</td><td style={{ ...S.td, fontSize: 11 }}>{JSON.stringify(a.details)}</td></tr>
          ))} />
        )}
      </Card>
    </>
  );
}
```

The `audit_log (targetId)` filter uses a single-field index (automatic);
`orderBy('at')` without a filter also needs none.

- [ ] **Step 6: Enable all tabs, build, verify on the emulator, commit**

Restore the full `TABS` list and render block in `GuardiansPage.jsx` from
Task 17 Step 3.

Run: `npm test && npm run build` — Expected: PASS.

Emulator check: file a report from the parent app → Reports tab shows it →
resolve with "Void this scan" → parent's history shows the strike-through
and an inbox message; Learner access → Restrict → parent's card shows
"Your access to this learner has ended"; Audit tab lists every action.

```bash
git add src/pages/guardians/ src/pages/GuardiansPage.jsx
git commit -m "feat(sims): access requests, reports, learner access, scan log and audit tabs

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Phase 6 — Operations and rollout

### Task 20: CI, runbook, privacy notice, adviser guide

**Files:**
- Create: `.github/workflows/ci.yml`, `docs/parent-portal-runbook.md`, `docs/parent-portal-privacy-notice.md`, `docs/parent-portal-adviser-guide.md`
- Modify: `README.md`

- [ ] **Step 1: CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: ci
on:
  push: { branches: [master] }
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: 21 }   # Firestore emulator needs a JRE
      - run: npm ci
      - run: npm --prefix functions ci
      - run: npm --prefix parent ci
      - run: npm test
      - run: npm --prefix functions test
      - run: npm --prefix parent test
      - run: npm run build
      - run: npm --prefix parent run build && npm --prefix parent run size
      - run: npx firebase emulators:exec --only firestore,auth --project bnhs-sims-ci "npx vitest run -c vitest.rules.config.js && npm --prefix functions run test:emulator"
        env: { GCLOUD_PROJECT: bnhs-sims-ci }
```

Run locally the same sequence (`npm run test:all`) — Expected: everything
green before the workflow is committed.

- [ ] **Step 2: Runbook**

`docs/parent-portal-runbook.md`:

```markdown
# Parent portal — registrar and admin runbook

All actions below are in the SIMS → **Guardians** area unless stated.
Every one of them is written to the Audit log tab.

## Pause / resume parent notifications (emergency switch)
Guardians → Portal settings → type a reason → **Pause notifications**.
Pushes stop within 30 s. Gate scans are still recorded and still appear in
parents' inboxes with a "paused" note. **Resume** when done.

## A kiosk is lost, stolen, or misbehaving
Guardians → Kiosk devices → **Deactivate**. The device stops scanning within
seconds. To rotate its password instead: Firebase console → Authentication →
the kiosk user → Reset password, then sign in again at the kiosk's `/setup`.

## Register a new kiosk
1. Firebase console → Authentication → Add user: `kiosk-<gate>@bnhs.local`,
   password = 16+ random characters (generate one; store it in the office safe).
2. Copy the UID → Guardians → Kiosk devices → paste UID + gate label → Register.
3. On the device: open `/setup`, sign in once. Done.

## Parent lost the slip / new guardian / custody change
- Reissue: Guardians → Activation slips → section → Issue → print. (Old
  slips for that section stop working.) For one learner only: Learner
  access → find learner → **Revoke unused slip**, then issue the section again
  after the other slips are handed out — or approve an access request instead.
- Custody restriction: Learner access → find learner → reason → **Restrict**.
  This revokes every guardian's access and blocks slips until lifted.
- Remove one guardian: Learner access → row → **Revoke**.

## Parent says a record is wrong
Guardians → Reports. Check the Scan log tab for that date/device. Resolve
with "no change", or "Void this scan" (parent sees it struck through with
your note), or add a manual scan under Learner access.

## School-year rollover (before the first school day of the new SY)
1. Settings → set the new current school year (as today).
2. Enroll learners into the new sections (as today).
3. Print ID cards **and** activation slips per section; hand out together.
4. The nightly job expires last year's links automatically and tells parents
   to re-activate. Old events remain visible for the previous school year only.

## App Check break-glass (parents or kiosks all see "can't reach the server")
Firebase console → App Check → Firestore → **Unenforced** (and Functions).
This is temporary; re-enforce after the reCAPTCHA/App Check issue clears.
Record the time in the audit log by pausing and resuming notifications with a
note, so there is a trace.

## Cost or usage alarm
Billing email at ₱500 / ₱1,500 / ₱3,000 → check Firebase console → Usage.
If parent traffic is the cause: pause notifications; if needed run
`npx firebase hosting:disable --site bnhs-parent` (SIMS and kiosk unaffected).
Re-enable with a normal parent deploy.

## Rollbacks
- Parent site: `npx firebase hosting:rollback --site bnhs-parent` (or the
  console → Hosting → release history).
- Functions: `git checkout <previous tag> -- functions && npx firebase deploy --only functions`.
  Raw scans keep accumulating; the nightly reconcile fills gaps.
- Rules: `git checkout <previous tag> -- firestore.rules && npx firebase deploy --only firestore:rules`.

## Data-subject requests (DPA)
- Access: the parent's own portal. Correction: Reports flow. Erasure: the
  parent can delete their account in Settings; or Learner access → Revoke,
  and ask the developer to run `deleteGuardianAccount` for that UID if the
  parent cannot sign in.
- Breach or suspected misuse: pause notifications, deactivate the affected
  kiosk or revoke the affected link, export the Audit log tab for the date
  range, and notify the school's privacy focal person.
```

- [ ] **Step 3: Privacy notice and adviser guide**

`docs/parent-portal-privacy-notice.md`:

```markdown
# BNHS Learner Records — Privacy Notice for Parents and Guardians (v1)

**Who we are.** Bukidnon National High School (BNHS), through its registrar's
office. Privacy focal person: the school inserts the designated person's
name, office, and contact number here before the pilot (rollout checklist
prerequisite).

**What this service does.** Shows you the gate scans the school's kiosk
recorded for the learner(s) linked to your account — the time your learner
scanned their ID at the school gate on entering and leaving — and sends a
notification to devices you choose. It does not track location.

**What we collect about you.** Your name and email from your sign-in
provider; your relationship to the learner; which learners you are linked
to; the devices you turned notifications on for; reports and access
requests you send; and a log of link activations and changes.

**What you can see about your learner.** Name, section, and gate scan times
for the current and previous school year. Not shown: attendance marks,
grades, address, or other learners.

**Why (purpose and legal basis).** To inform you of your learner's gate scans,
with your consent, as part of the school's duty of care. Nothing else is
derived from or done with this data.

**Who can see it.** You; the school registrar (who manages links and reviews
reports); and the service providers that host the system (Google Firebase,
data stored in Singapore).

**How long we keep it.** Gate scan events and your inbox: current and
previous school year. Notification device records: 60 days after last use.
Access requests and reports: 1 year after resolution. Link and audit
history: up to 2 years. Your account: until you delete it or one year after
your last active link.

**Your rights.** Access (this portal); correction (use "Report this
record"); withdrawal of consent and erasure (Settings → Delete my account, or
ask the registrar); objection to notifications (Settings toggle). You may
also complain to the National Privacy Commission.

**Security.** Access is limited by school-verified links; every staff action
is logged; data is encrypted in transit and at rest.

**Changes.** If this notice changes materially, you will be asked to accept
the new version in the portal.
```

`docs/parent-portal-adviser-guide.md`:

```markdown
# Activation slips — adviser one-pager

1. The registrar gives you one slip per learner in your section.
2. Hand each slip **to the parent or guardian in person** (enrollment day,
   homeroom meeting, or card claiming). Do not send slips through learners
   or group chats — the slip is what proves the parent is entitled.
3. Tell the parent: scan the QR or type the code at the portal address on
   the slip; sign in with Google or an email; agree to the notice; done.
   Up to two guardians can use one slip. It works for 90 days.
4. Lost slip, separated parents, custody orders, or "the app says the code
   can't be used": send the parent to the registrar, or have them tap
   "No slip? Ask the school for access" in the portal.
5. Parents receive a short notification when the learner scans at the gate.
   They see details only inside the app. The Inbox in the app is the
   complete record; a phone may miss a notification.
```

- [ ] **Step 4: README section and commit**

Append to `README.md` a "Parent portal" section: what lives where
(`parent/`, `functions/`, rules), the local emulator flow
(`npm run emulators`, `npm --prefix parent run dev`, kiosk `/setup`), the
test commands (`npm run test:all`), and a link to the runbook and the spec.

```bash
git add .github/workflows/ci.yml docs/parent-portal-runbook.md docs/parent-portal-privacy-notice.md docs/parent-portal-adviser-guide.md README.md
git commit -m "docs: CI workflow, parent-portal runbook, privacy notice, adviser guide

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 21: Monitoring setup and staged rollout checklist

**Files:**
- Create: `docs/parent-portal-rollout-checklist.md`, `scripts/monitoring/create-metrics.sh`

This task produces the checklist the rollout is run against. Deployment
itself is a human, gated activity; nothing here is run by CI.

- [ ] **Step 1: Monitoring script (run once by an owner, after the first Functions deploy)**

`scripts/monitoring/create-metrics.sh`:

```bash
#!/usr/bin/env bash
# Logs-based metrics + alert policies for the parent portal (spec §10).
# Requires: gcloud auth login; gcloud config set project bnhs-sims
set -euo pipefail
P=bnhs-sims

metric() { # name, filter
  gcloud logging metrics create "$1" --project "$P" --description "$1" --log-filter="$2" 2>/dev/null \
    || gcloud logging metrics update "$1" --project "$P" --log-filter="$2"
}
BASE='resource.type="cloud_run_revision" AND jsonPayload.event='
metric events_processed     "${BASE}\"scan_processed\""
metric events_rejected      "${BASE}\"scan_rejected\""
metric activation_failures  "${BASE}\"activation_failed\""
metric reconcile_missing    "${BASE}\"reconcile_done\" AND jsonPayload.missing>0"
metric push_failures        "${BASE}\"scan_processed\" AND jsonPayload.pushesFailed>0"
metric function_errors      'resource.type="cloud_run_revision" AND severity>=ERROR'

echo "Metrics created. Now in Cloud Console → Monitoring → Alerting create policies:"
echo "  activation_failures  > 50 in 1h"
echo "  reconcile_missing    > 0 in 24h"
echo "  push_failures        > 20% of events_processed over 1h"
echo "  function_errors      > 5% of requests over 15m"
echo "  Uptime check: https://bnhs-parent.web.app/ every 5 min"
echo "Budget: Billing → Budgets → PHP 1,500 with 50/100/200% email alerts to the owner and registrar."
```

- [ ] **Step 2: Rollout checklist**

`docs/parent-portal-rollout-checklist.md`:

```markdown
# Parent portal — staged rollout checklist

Stop and fix (or roll back) whenever an exit criterion fails. Each stage's
outcome is recorded in this file with the date and who verified it.

## Prerequisites (console, one-time)
- [ ] Project on Blaze; budget PHP 1,500 with 50/100/200 % alerts (owner + registrar emails).
- [ ] Authentication → Sign-in method: Email/Password on, Google on, Anonymous still ON (turned off in step K4).
- [ ] Cloud Messaging → Web Push certificates → generate key pair → `VITE_FIREBASE_VAPID_KEY` in `parent/.env`.
- [ ] App Check → register the three web apps with reCAPTCHA v3 (one site key covering the three hostnames); enforcement OFF for now; debug tokens registered for dev machines.
- [ ] Hosting → add site `bnhs-parent`; `firebase target:apply hosting sims bnhs-sims`; `firebase target:apply hosting parent bnhs-parent`.
- [ ] Firestore → `settings/parent_portal` = `{ notificationsPaused: true, consentVersion: 1, privacyNoticeUrl: "<published notice URL>" }`.
- [ ] Privacy notice reviewed by the school head; focal person named in it.
- [ ] Create kiosk Auth users (`kiosk-<gate>@…`) per device; passwords in the office safe.

## Stage 0 — Emulator (dev)
- [ ] `npm run test:all` green.
- [ ] Throughput rehearsal: `node scripts/rehearsal.mjs` (seeds 8,000 scans over 15 simulated minutes against the emulator; script written during this stage from `functions/test/emulator/helpers.js`) → all projections exist; Emulator UI request counts recorded here: reads ____ writes ____.
- [ ] Manual walkthrough (Task 16 Step 2) completed on Android Chrome and iOS Safari (PWA installed).

## Kiosk migration (production, in this order — the gate never stops)
- [ ] K1 Deploy kiosk v2 (`npm run deploy` in the kiosk repo). Old rules still accept it.
- [ ] K2 Register each device (Guardians → Kiosk devices) and sign in at `/setup`. Verify one scan per device writes `scan_events`.
- [ ] K3 Deploy indexes + rules + functions: `npx firebase deploy --only firestore,functions`. Verify scanning at every gate immediately. Rollback = redeploy previous `firestore.rules`.
- [ ] K4 Disable Anonymous sign-in in the console.
- [ ] K5 After one clean school day (Scan log tab shows every gate; Functions logs show `scan_processed`, zero `scan_rejected:device`): App Check → enforce for Firestore, then Functions.

## Stage 1 — Internal staff test (3 school days)
- [ ] Deploy parent site: `npm --prefix parent run build && npx firebase deploy --only hosting:parent`.
- [ ] Issue slips for a test section containing staff members' own children or test learners; 5–10 staff activate.
- [ ] Portal settings → Resume notifications.
- [ ] Exit: 0 rejected events, `reconcile_missing` = 0 each night, pushes received on Android and iOS-PWA, kiosk offline test (unplug network, scan, reconnect) passed, Firestore reads/writes per day recorded: ____ / ____.

## Stage 2 — Consenting-parent pilot (~30 guardians, 5 school days)
- [ ] Advisers recruit ~30 parents; slips issued for those learners only (issue the section, hand out only the pilot slips, revoke the rest via Learner access → Revoke unused slip).
- [ ] Exit: ≥ 80 % activated, ≥ 60 % enabled push, every report resolved same day, no privacy incident, billing for the period ≤ PHP 50.

## Stage 3 — One section (2 weeks)
- [ ] Slips printed through the normal pipeline and handed out in homeroom.
- [ ] Exit: adviser confirms the handout worked; measured reads/writes per active guardian × 8,000 projects to ≤ PHP 600/month; registrar backlog (open requests + reports) ≤ 2 days.

## Stage 4 — School-wide, one grade level per week (7 → 12)
- [ ] Weekly review: Firestore usage vs ceilings (reads ≤ 60K/day, writes ≤ 35K/day), cost, `push_failures`, report volume, registrar workload.
- [ ] Stop condition: any ceiling exceeded 2× on a normal day, or registrar backlog > 2 days → pause expansion, investigate.

## Stage 5 — Steady state
- [ ] Nightly jobs verified in Cloud Scheduler (3 jobs, last run success).
- [ ] SY-rollover rehearsal on the emulator before March (change `currentSchoolYear`, run `expireLinks`, confirm inbox notices).
- [ ] Decision on paid fallback (SMS/WhatsApp) taken only from measured push adoption and `push_failures` — not before.
```

- [ ] **Step 3: Commit**

```bash
git add scripts/monitoring/create-metrics.sh docs/parent-portal-rollout-checklist.md
git commit -m "docs: monitoring setup script and staged rollout checklist with gates

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Plan self-review notes

- **Spec coverage:** §2 boundaries → Tasks 2, 13; §3 auth/linking → 8, 9, 10, 13, 14; §4 data model → 3, 6, 12 (retention); §5 event flow → 4, 5, 6, 11 (corrections); §6 push → 6, 15; §7 UX → 13–16; §8 security → 3, 7, 8, 20; §9 failure handling → 4 (offline/deactivation), 6 (retries, token pruning), 12 (reconcile), 20 (break-glass); §10 cost → 2 (headers, caching), 6 (cache), 16 (bundle), 21 (metrics, budget); §11 testing → every task; §12 migration/rollout → 21.
- **Known simplifications relative to the spec, stated here so nobody assumes otherwise:** events are ordered by `effectiveAt` (scan time, or server time for skewed clocks) rather than raw `scannedAt`; the SIMS keeps its own `src/lib/dates.js` (only `parent/` and `functions/` use `shared/`); staff corrections that need a *replacement* time are done as void + manual add rather than a single "edit" action.
- **Names to keep consistent across tasks:** callables are exported with the `…Fn` suffix (`activateCodeFn`, `submitReportFn`, …) and called by exactly those names from `parent/src/firebase.js` `callable()` and `src/data/guardians.js`; inbox `pushStatus` values are the seven strings in spec §4; the raw-log ID format is `{deviceUid}_{studentId}_{YYYYMMDDHHMM}` from the kiosk and `staff_{studentId}_{stamp}_{void|in|out}` from staff.

