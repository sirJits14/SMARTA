# Prompt — Plan the Temporary Student ID Pass + Student Photo Upload feature

Use **/superpowers:writing-plans**. The design below was already settled in a brainstorming
session (2026-11-27). Do NOT re-open the decisions; if code reality contradicts one, stop and ask.

First write the spec to `docs/superpowers/specs/2026-11-27-temp-student-id-pass-design.md`
(follow the existing spec format: Date / Status header, Goal, Decisions table), then write the
implementation plan to `docs/superpowers/plans/2026-11-27-temp-student-id-pass.md`.
Split the plan into independently shippable phases with TDD steps, exact file paths, and a
verification step per phase.

Reference design image: `docs/superpowers/specs/assets/2026-11-27-temp-id-pass-reference.png`

---

## Goal

1. Let advisers and SIMS staff **upload a student photo** that is stored once and reused
   (temporary pass now, official ID card later).
2. Let SIMS staff **print a Temporary ID Pass** for enrolled learners who have no official ID
   card yet. Its QR works at the attendance kiosk **only until the official ID card is issued**.

## Settled decisions

| # | Topic | Decision |
|---|-------|----------|
| 1 | QR purpose | Kiosk attendance tap-in/out, same as the official ID. |
| 2 | Who uploads photos | Advisers, in the **Parent App school mode** advisory class list. Admins and coordinators (own grades) can also upload or replace from the SIMS student profile. |
| 3 | Photo reuse | One photo per student, reused by the official ID card later. Official card changes are out of scope; just make the field available. |
| 4 | Expiry trigger | Pass becomes `superseded` automatically when the official card is confirmed printed (`students/{id}.idCard.printedAt` set with `idCard.lrn === student.lrn`). |
| 5 | Manual revoke | Admin-only **Revoke** (lost pass, transfer). Re-issuing after revoke creates a new code. |
| 6 | Production | Printed by the school, single or batch per section, A4 sheets of portrait CR80 passes, hand-cut. No digital/Parent App pass. |
| 7 | Who prints | SIMS only: admins (all) and coordinators (`jhs_coord`/`shs_coord`, own grade levels). |
| 8 | Card layout | Front only, matching the reference image. No signature image; no issue/valid-until date. |
| 9 | Signatory | Configurable `principalName` + `principalTitle` in `settings/app` (e.g. "PAUL O. ORONG" / "Secondary Principal IV"), editable in Settings. Not hard-coded. |
| 10 | Photo capture | File upload **or** device camera, forced 1:1 crop, compressed JPEG ~600×600 ≤200 KB. New photo overwrites old; no history. |
| 11 | Photo visibility | Staff (admin; coordinators for their grades), the learner's adviser, and the learner's linked guardians in the Parent App. Nobody else. |
| 12 | QR mechanism | **Opaque random pass code** (e.g. `BNHS-TP-7K3Q9X2M`, ≥10 chars, unambiguous alphabet), NOT the LRN. Server-side `temp_passes` record with status. Official LRN QR stays unchanged. |

## Current codebase facts (verify before relying on them)

- **ID Cards today:** `src/pages/IDCardsPage.jsx` with tabs `src/pages/idCards/BySectionTab.jsx`
  and `SavedBatchTab.jsx`. Printing is HTML + `window.print()` (`src/components/IdCardsPrintable.jsx`,
  layout `src/pages/idCardPrintLayout.js`). QR = `QRCode.toDataURL(student.lrn)` (`qrcode` lib).
  Print confirm: `src/components/IdCardPrintConfirm.jsx`. Data: `src/data/idCards.js`
  (`students/{id}.idCard = { printedAt, printedBy, lrn }`, `id_card_batch/{studentId}`).
  `isIdCardPrinted` and enrollment eligibility in `src/lib/idCardQueue.js`.
  ID cards are admin-only today (`firestore.rules` ~L150-167, `src/lib/access.js` `COORDINATOR_PAGES`).
- **No photos exist:** no `photoUrl` field, no `firebase/storage` import, no `storage.rules`,
  no storage section in `firebase.json`. SIMS hosting header sets `camera=()`; Parent App sets
  `camera=(self)`. No crop/compress utility exists (only canvas use is `src/lib/gradeSummaryImage.js`).
- **Students:** `students` (`lrn`, `lastName`, `firstName`, `middleName`, `extName`, `status`, …;
  `src/data/students.js`), `enrollments/{studentId}_{schoolYear}` (`gradeLevel`, `sectionId`,
  `status`), `sections` (`name`, `gradeLevel`, `schoolYear`, `adviserName`), `settings/app`
  (`currentSchoolYear`, `schoolId`, `schoolName`; `src/data/settings.js`, `src/pages/SettingsPage.jsx`).
  Parent-facing projection `learners/{studentId}` is written by functions only.
  Name format helper: `src/lib/roster.js`.
- **Roles:** SIMS staff `admin`, `jhs_coord`, `shs_coord`, `glc` (`shared/staffRoles.js`); school
  portal roles `adviser`, `curriculum_adviser` (`shared/schoolAccess.js`). Rule helpers `isStaff`,
  `isAdmin`, `coordinatorGrades`, `isKiosk`, `isGuardian` in `firestore.rules`. Callable wrappers
  `adminCall`, `staffCall`, `schoolCall`, `guardianCall` in `functions/index.js` (App Check enforced).
- **Kiosk:** separate repo `../bnhs-student-kiosk` (sibling of this repo's main checkout).
  Hardware wedge scanner (`src/lib/hardwareScanner.js`), offline roster lookup by LRN
  (`src/lib/rosterIndex.js`, `src/App.jsx`), writes `scan_events/{...}` with
  `{ studentId, sectionId, schoolYear, kind, deviceId, scannedAt }`.
  Server: `onScanEventCreated` → `functions/src/handlers/scanEvent.js` →
  `functions/src/handlers/scanAttendance.js` (`attendanceResult` = `applied` | `rejected:<reason>`).
  Scan-event create rules in `firestore.rules` ~L209-249.
- **Existing status patterns to mirror:** activation codes (`functions/src/lib/codeSlots.js`,
  `functions/src/handlers/codes.js`) and advisory slips (`functions/src/handlers/advisorySlips.js`)
  use `issued` / `revoked` statuses.
- **Logo:** `src/assets/bnhs_logo.png` (imported as `?url` in `gradeSummaryImage.js`).

## Design to plan

### A. Student photos (shared)
- Enable Firebase Storage: new `storage.rules`, `firebase.json` storage entry, emulator config.
  Path `student_photos/{studentId}.jpg`.
- `students/{id}.photo = { path, updatedAt, updatedBy }`; project `photoUpdatedAt` (cache-buster)
  onto `learners/{id}` so the Parent App can show it to linked guardians.
- One shared crop + compress module (put it in `shared/` if both apps can import it; otherwise
  mirror it with tests in both): file or camera input → 1:1 crop UI → 600×600 JPEG ≤200 KB.
- Parent App school mode: photo upload on the adviser's advisory class list (adviser may only
  touch learners in sections they advise for the current school year).
- SIMS: upload/replace on the student profile for admins and coordinators (own grades). Change
  SIMS hosting `Permissions-Policy` to `camera=(self)`.
- Parent App guardian view: show the child's photo.
- Storage rules enforce: write = admin | coordinator for the learner's grade | adviser of the
  learner's current section; read = those plus linked guardians; content-type `image/jpeg`,
  size ≤ 300 KB. Decide in the plan whether rules can resolve adviser/guardian links directly or
  whether uploads/reads must go through a callable / signed URL — pick one and justify it.

### B. Temporary pass data + lifecycle
- `temp_passes/{studentId}` = `{ code, status: 'active'|'superseded'|'revoked', lrn, sectionId,
  schoolYear, issuedAt, issuedBy, endedAt, endedReason }`. Client writes denied; functions only.
  Reads: admins, coordinators for their grades, kiosks (active codes only, for the roster).
- Eligibility: enrolled in current school year, has section + LRN, has photo, official card NOT
  printed for current LRN.
- `issueTempPassFn` (staffCall; coordinators limited to their grades): creates the record with a
  crypto-random code; if an active pass exists, return it (reprint keeps the same code).
- Firestore trigger on `students/{id}`: when `idCard.printedAt` is set with matching LRN, mark the
  active pass `superseded` (`endedReason: 'official_id_printed'`). Also supersede if the LRN
  changes, and decide what happens on transfer/drop (recommend: revoke with reason).
- `revokeTempPassFn` (adminCall): status `revoked`; re-issue generates a new code.

### C. SIMS printing UI
- New "Temporary passes" tab in ID Cards, visible to admins and coordinators (adjust
  `access.js` so coordinators can open ID Cards but only this tab; official-card tabs stay admin-only).
- Section picker → learner list with status chips: Missing photo / Ready / Active / Superseded /
  Revoked; select + batch print; admin Revoke action.
- Printable: portrait CR80 (54×85.6 mm) passes, as many per A4 as fit with cut guides, built
  with the existing HTML print approach. Match the reference image: green header with logo and
  "BUKIDNON NATIONAL HIGH SCHOOL", photo, FULL NAME, GRADE & SECTION (letter-spaced), "LRN: …",
  caption "STUDENT'S TEMPORARY QR CODE:", QR of the pass code, principal name + title from
  settings, red note "This temporary ID pass is issued only to students without an official ID
  card and expires once the official ID is issued.", vertical "BNHS ID PASS" on the right edge.
  Long names must fit (auto-shrink), and the QR must stay scannable at print size by the kiosk
  hardware scanner.
- Settings page: add `principalName` and `principalTitle` fields.

### D. Kiosk + server validation
- Kiosk repo: roster load also pulls active `temp_passes` (code → studentId); scanner input that
  matches a pass code resolves the student; the scan event adds `credential: 'temp_pass'` and
  `passCode`. Unknown or inactive code → message "Temporary pass expired — please use your
  official ID." Keep roster refresh behaviour so newly issued/superseded passes propagate.
- `firestore.rules` scan_events create: allow the new optional fields; if `credential == 'temp_pass'`,
  require the pass to exist, be `active`, and belong to `studentId`.
- `applyScanAttendance`: re-check the pass server-side; reject as `rejected:temp_pass_inactive`.
- Official LRN QR flow must be completely unchanged (regression tests).

### E. Testing
- Rules tests (`tests/rules/`): storage photo read/write matrix, `temp_passes` deny-client-write
  and read matrix, scan_events with temp pass fields.
- Function tests: issue (eligibility, idempotent reprint, coordinator scope), supersede trigger,
  revoke + reissue new code, scan rejection paths, official LRN scan regression.
- Unit tests: crop/compress module, code generator (alphabet, length, uniqueness), eligibility helper.
- Emulator browser check of the print layout against the reference image, and of photo upload
  in both apps (see the project's emulator browser-check setup).

### F. Release (follow repo rules; plan the order, do not deploy)
1. Firestore rules + Storage rules + functions (new callables, trigger, scan validation).
2. Kiosk build (separate repo, its own release flow).
3. SIMS hosting from the documented release tree (never the root master build), with the
   reCAPTCHA site key bundle check.
4. Parent App via `npm run deploy:parent` (`hosting:parent` only), byte-verified per `AGENTS.md`.
Each deploy gets an audit record under `docs/audits/deployments/`.

## Out of scope
- Putting the photo on the official ID card (only the field is ready).
- Digital passes in the Parent App, signatures, back side, issue/expiry dates on the card.
- Photo history / audit trail beyond `updatedBy` / `updatedAt`.
- Parent-submitted photos.

## Open items the plan must resolve (do not guess silently)
- How storage rules verify adviser and guardian access (direct rules vs callable/signed URL).
- Exact behaviour on transfer/drop and LRN correction.
- How many passes fit per A4 sheet at CR80 portrait, and the kiosk scanner's minimum QR size.
- Whether `glc` role gets any access (default: no).
