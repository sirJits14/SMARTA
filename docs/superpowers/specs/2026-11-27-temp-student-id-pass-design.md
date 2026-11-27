# Temporary Student ID Pass and Student Photos — Design

Date: 2026-11-27
Status: Approved in brainstorming; implementation requested 2026-11-27. Not deployed.
Reference card: [assets/2026-11-27-temp-id-pass-reference.png](assets/2026-11-27-temp-id-pass-reference.png)
Source prompt: [../prompts/2026-11-27-temp-student-id-pass-plan-prompt.md](../prompts/2026-11-27-temp-student-id-pass-plan-prompt.md)

## Goal

1. Advisers and SIMS staff upload a learner photo that is stored once and reused (temporary pass
   now, official ID card later).
2. SIMS staff print a Temporary ID Pass for enrolled learners who have no official ID card. Its QR
   works at the attendance kiosk only until the official ID card is issued.

## Decisions

| # | Topic | Decision |
|---|-------|----------|
| 1 | QR purpose | Kiosk attendance tap-in/out, same as the official ID. |
| 2 | Who uploads photos | Class advisers in the Parent App school mode; administrators and JHS/SHS coordinators (own grades) from SIMS. |
| 3 | Photo reuse | One photo per learner. Putting it on the official card is out of scope. |
| 4 | Expiry | A pass becomes `superseded` when the official card is confirmed printed for the learner's current LRN. |
| 5 | Revoke | Administrators only. Issuing again creates a new code. |
| 6 | Production | School-printed, single or batch per section, A4 sheets of portrait CR80 passes. No digital pass. |
| 7 | Who prints | SIMS administrators (all) and `jhs_coord` / `shs_coord` (own grades). `glc` has no access. |
| 8 | Layout | Front only, per the reference image. No signature image, no dates. |
| 9 | Signatory | `settings/app.principalName` and `principalTitle`, edited in Settings. |
| 10 | Capture | File or device camera, forced 1:1 crop, 600×600 JPEG of at most 200 KB. A new photo replaces the old one. |
| 11 | Visibility | Administrators, coordinators (own grades), the learner's class adviser, linked guardians. |
| 12 | QR content | `BNHS-TP-` + 10 random characters from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`. Server record in `temp_passes`. Official LRN QR unchanged. |

## Resolved open items

**Photo access goes through callables; Storage rules deny every client.** Storage rules may read at
most two Firestore documents per request. Deciding access needs the staff profile and its UID
binding, the enrollment, the section, and the adviser assignment or guardian link, so rules cannot
do it. `saveStudentPhotoFn` and `getStudentPhotoFn` check access and use the Admin SDK. Photos are
returned as base64 (at most about 270 KB), so no signed URLs and no client Storage SDK.

**Transfer, drop, section change, LRN correction.** One reconciliation runs on every `students`
and `enrollments` write, re-reading current data:

| Situation | Result | `endedReason` |
|---|---|---|
| Learner record deleted | `revoked` | `learner_removed` |
| Official card printed for current LRN | `superseded` | `official_id_printed` |
| LRN changed | `superseded` | `lrn_changed` |
| Student status not active | `revoked` | `learner_inactive` |
| Enrollment gone or not `enrolled` | `revoked` | `enrollment_ended` |
| Moved to another section, still enrolled | stays `active`; `sectionId`, `gradeLevel` updated | — |

A pass from an earlier school year never matches a current scan, because the scan's school year
must equal the pass's.

**Sheet layout and QR size.** Nine passes per A4 portrait sheet (3 × 3, 54 × 85.6 mm, 4 mm gaps,
8 mm page margins). An 18-character code fits a version 1 QR (21 modules) at error correction M.
Printed with a 2-module quiet zone in about 19 mm, each module is about 0.76 mm, larger than on the
16 mm official card. A scan test with the gate scanner is still required before rollout.

**`glc` role:** no photo or pass access, unless that account is also the section's class adviser
(photos only).

## Data

- `students/{id}.photo = { path, updatedAt, updatedBy }`; file `student_photos/{id}.jpg`.
- `learners/{id}.photoUpdatedAt` — tells the Parent App a photo exists and when it changed.
- `temp_passes/{studentId} = { code, status, lrn, sectionId, gradeLevel, schoolYear, issuedAt,
  issuedBy, endedAt, endedReason, endedBy }`, `status` in `active | superseded | revoked`.
  Clients cannot write. Reads: administrators; `jhs_coord` / `shs_coord` for their grades; kiosks
  for `active` passes only.
- `scan_events` may add `credential: 'temp_pass'` and `passCode`, both or neither.

## Callables and triggers

| Name | Wrapper | Purpose |
|---|---|---|
| `saveStudentPhotoFn` | schoolCall | Validate and store a photo |
| `getStudentPhotoFn` | schoolCall | Return a photo to an allowed reader |
| `issueTempPassFn` | staffCall | Issue or reuse passes for up to 200 learners |
| `revokeTempPassFn` | adminCall | Revoke one learner's active pass |
| `onStudentWritten` | trigger | Reconcile the pass; delete the photo of a deleted learner |
| `onEnrollmentWritten` | trigger | Reconcile the pass |

## Known limitation

A scan made offline while a pass was active, but synced after the pass ended, is refused (rules and
server both require an active pass). The kiosk reports it as a scan that failed to sync. This
follows the approved design; accepting such scans would need a separate decision.

## Out of scope

Photo on the official card, digital passes, signatures, back side, dates on the card, photo
history, parent-submitted photos, deployment.
