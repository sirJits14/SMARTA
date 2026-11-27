# Kiosk remote management — design

Date: 2026-11-24
Repos: `bnhs-sims` (SIMS UI, functions, rules) and `bnhs-student-kiosk` (kiosk app)
Screen: SIMS → Guardians → Kiosk devices (`src/pages/guardians/DevicesTab.jsx`)

## Goal

Administrators can see which kiosks are running right now, delete kiosk
accounts they no longer need, and switch a kiosk between Entrance and Exit
from SIMS without anyone touching or refreshing the kiosk. The kiosk's own
Entrance/Exit toggle keeps working.

## Today

- `kiosks/{uid}` holds `label`, `active`, `createdBy`, `createdAt`,
  `lastSeenAt`, and on deactivation `deactivatedAt`, `deactivatedBy`.
- "Active" means "allowed to scan", not "running".
- The kiosk writes `lastSeenAt` once, when the page loads
  (`bnhs-student-kiosk/src/App.jsx`). So "Last seen" means "last opened".
- Entrance/Exit is stored only in the kiosk browser's `localStorage`
  (`MODE_STORAGE_KEY`). SIMS can't see it or change it.
- The kiosk already has a live listener on its own `kiosks/{uid}` doc
  (`src/hooks/useKioskDevice.js`). Remote control builds on that listener.
- Rules: an admin can read every kiosk doc. A kiosk can read its own doc
  while active, and can update only `lastSeenAt`. Creates and deletes go
  through callables.

## 1. Online / Offline status

**Kiosk app.** While a device is signed in and active, write
`{ lastSeenAt: serverTimestamp() }` to its own doc when the page loads and
then every 2 minutes (`HEARTBEAT_MS = 120_000`). Clear the interval when the
device changes or the page unmounts. Failures are ignored, as today. Writes
made offline queue in the persistent cache, and the last one lands with the
server's time when the kiosk reconnects.

**SIMS.** The Status column shows one of:

| State | Rule | Display |
| --- | --- | --- |
| Deactivated | `active !== true` | "Deactivated" (muted) |
| Online | active, and `lastSeenAt` no more than 5 minutes ago | green dot + "Online" |
| Offline | active, and `lastSeenAt` older than 5 minutes or missing | grey dot + "Offline · last seen 2h ago" (or "never seen") |

The tab re-checks this every 30 seconds with a ticking `now`, so a kiosk
turns Offline without a reload. The "Last seen" column stays and keeps the
full date and time. The threshold (`ONLINE_WINDOW_MS = 5 * 60_000`) lives
in a small pure helper, `kioskPresence(kiosk, nowMs)`, with unit tests.

The page notes that "Online" means the kiosk page is open and connected,
not that the computer is powered on.

**Cost.** About 720 writes per kiosk per day, or roughly 14,400 a day for 20
kiosks. That's a few cents a day on the Blaze plan.

## 2. Delete kiosk

**Callable: `deleteKioskFn`** (admin only, `adminCall`), in
`functions/src/handlers/kiosks.js`.

1. Validate `uid`. Load `kiosks/{uid}`. If it doesn't exist or is already
   `deleted`, return `not-found`.
2. Run `assertKioskAccount(auth, uid)`, so only `@bnhs.local` device accounts
   can be deleted. If the Auth user is already gone (`auth/user-not-found`),
   skip this step and the next one, and continue so the doc can still be
   tombstoned.
3. Run `auth.deleteUser(uid)`.
4. Merge into `kiosks/{uid}`: `active: false`, `deleted: true`,
   `deletedAt: serverTimestamp()`, `deletedBy: <staff email>`. Keep `label`.
5. Audit with `kiosk.deleted`, including `{ label }`.

The doc stays as a tombstone so Scan log rows keep showing the gate name.

**Effect on a running kiosk.** `active: false` makes the rules deny its
reads, so it shows the existing "not registered" screen within seconds. Its
sign-in stops working when its token expires (at most an hour).

**Safety.** `registerKiosk` (Re-activate) refuses a doc with
`deleted: true` (`failed-precondition`, "This kiosk was deleted."). Today it
would already fail, because the Auth user is gone, but the explicit check
gives a clear message. `deactivateKiosk` leaves `deleted` untouched.

**SIMS UI.**
- Each row gets a **Delete** button. The confirm dialog reads: `Delete
  "<label>"? Its sign-in is removed for good and this can't be undone. Past
  scans keep its name.` The confirm label is "Delete", styled as a danger
  button.
- The Kiosk devices list hides docs with `deleted: true`.
- In the Scan log, the Device filter dropdown hides deleted kiosks. The row
  name lookup still uses every kiosk doc, so old rows keep their gate name.

## 3. Entrance / Exit from both places

### Data

New fields on `kiosks/{uid}`:

| Field | Values |
| --- | --- |
| `mode` | `'entrance'` or `'exit'` |
| `modeChangedAt` | server timestamp |
| `modeChangedBy` | `'kiosk'`, or the staff email |
| `modeChangedByName` | staff display name (from `ctx.profile`, falling back to the email); not set for kiosk changes |

Whoever writes last wins. There's no lock.

### From SIMS

**Callable: `setKioskModeFn`** (admin only), with input
`{ uids: string[], mode: 'entrance' | 'exit' }`.

- `uids` must hold 1 to 100 ids, and `mode` must be one of the two values.
- For each uid, the doc must exist, be `active: true`, and not be
  `deleted`. Others are skipped and returned in `skipped`.
- Writes go out in one batch: `mode`, `modeChangedAt: serverTimestamp()`,
  `modeChangedBy: email`, and `modeChangedByName`.
- One audit row, `kiosk.mode_changed`, records
  `{ mode, uids: <updated>, count }`.
- Returns `{ updated: string[], skipped: string[] }`.

**UI.**
- A new **Mode** column shows a two-option segmented control (Entrance |
  Exit) for active kiosks, and "—" for deactivated ones. Below it, a muted
  line reads "changed at the kiosk, 2:15 PM", "changed by Sir Geths, 7:02 AM",
  or "not reported yet" when `mode` is missing.
- Above the table, two buttons read **Set all active kiosks to Entrance**
  and **Set all active kiosks to Exit**. Each asks for confirmation ("Switch
  N active kiosks to Exit?") and then calls `setKioskModeFn` with every
  active, non-deleted uid.
- Feedback uses the existing `ActionFeedback` / `useAsyncAction` pattern.

### From the kiosk

**Rules** (`firestore.rules`, `match /kiosks/{uid}`). A kiosk can update its
own doc only while active, and only these fields:

```
allow update: if own(uid) && resource.data.active == true
  && affectedOnly(['lastSeenAt', 'mode', 'modeChangedAt', 'modeChangedBy'])
  && (!request.resource.data.diff(resource.data).affectedKeys().hasAny(['mode', 'modeChangedAt', 'modeChangedBy'])
      || (request.resource.data.mode in ['entrance', 'exit']
          && request.resource.data.modeChangedBy == 'kiosk'
          && request.resource.data.modeChangedAt == request.time));
```

A kiosk can't set `modeChangedByName`, `active`, `label` or `deleted`.
(Requiring `active == true` for `lastSeenAt` is new. A deactivated kiosk
can't read its own doc anyway, so it no longer needs to write it.)

**Kiosk app** (`bnhs-student-kiosk`):

- **Effective mode** is `device.mode` when it's present. Otherwise it's the
  `localStorage` value, as today.
- **Toggle tap:** update the local state and `localStorage` right away, as
  today, then `updateDoc(kiosks/{uid}, { mode, modeChangedAt:
  serverTimestamp(), modeChangedBy: 'kiosk' })`. Errors are ignored, and
  writes made offline queue.
- **Remote change:** when a snapshot arrives with a `mode` different from
  the current one, adopt it and mirror it to `localStorage`. The toggle
  moves to match, with no reload.
- **First run after rollout:** if the doc has no `mode` once the device has
  loaded, write the current local mode with `modeChangedBy: 'kiosk'`. This
  way nothing flips, and SIMS learns the current mode.
- Scans keep reading `mode` from `dataRef.current`. A scan in flight while
  the mode changes uses the mode it started with.
- **Offline conflict:** a toggle tapped offline is written when the kiosk
  reconnects. If SIMS changed the mode in between, the kiosk's later write
  wins. This matches "last change wins" from the server's point of view, and
  SIMS shows "changed at the kiosk".

## Rollout

1. **SIMS backend:** deploy `deleteKioskFn`, `setKioskModeFn` and the updated
   `registerKioskFn`. Deploy the rules change on top of the current live
   ruleset, following the SIMS release recipe, not straight from master's
   file.
2. **SIMS hosting:** ship the Kiosk devices and Scan log changes through the
   documented SIMS release preparation.
3. **Kiosk app:** deploy `hosting:kiosk` from the kiosk repo's main checkout.
   Each kiosk needs one refresh to load it. From then on, mode changes need
   none.

Until step 3 reaches a kiosk, that kiosk shows "Offline" (no heartbeat) and
"not reported yet" for mode, and SIMS mode changes don't reach it. That's
expected during the gap. Old kiosk builds aren't broken, because they only
write `lastSeenAt` while active.

## Testing

- **Unit tests** (`functions/src/handlers/kiosks.test.js`):
  - `deleteKiosk`: deletes the Auth user and tombstones the doc; refuses
    non-kiosk accounts; succeeds when the Auth user is already gone; returns
    not-found for a missing or already-deleted kiosk; writes an audit row.
  - `setKioskMode`: validates `mode` and `uids`; skips inactive and deleted
    kiosks; sets every field; writes one audit row.
  - `registerKiosk`: refuses a deleted kiosk.
- **Rules tests** (`tests/rules/existing.test.js`): an active kiosk can
  write `mode`, `modeChangedAt == request.time` and `modeChangedBy: 'kiosk'`.
  These are denied: a bad mode value, `modeChangedBy` other than `'kiosk'`,
  writing `modeChangedByName`, `active` or `deleted`, and any write by a
  deactivated kiosk or another kiosk's account.
- **SIMS unit test:** `kioskPresence` around the 5-minute boundary, missing
  `lastSeenAt`, and deactivated kiosks.
- **Kiosk app:** a unit test for the effective-mode choice (remote, then
  local, then default). Staging-harness check: a SIMS-style write to
  `kiosks/{uid}.mode` flips the toggle with no reload; a toggle tap writes
  the doc; a doc with no mode gets back-filled.
- **Browser check** on the emulator for the Devices tab: status dots,
  per-row switch, Set all buttons, delete flow, and Scan log names for a
  deleted kiosk.

## Out of scope

- Automatic time-of-day switching.
- Locking the kiosk toggle from SIMS.
- Powering kiosk computers on or off remotely.
- Hard-deleting kiosk docs.
