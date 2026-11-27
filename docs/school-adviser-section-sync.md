# School Access adviser synchronization

Approved Class Adviser assignments own `sections.adviserName`. Approval, direct
assignment, legacy conversion, and replacement write the name and the
server-owned `schoolAdviserUid` in the same transaction as School Access.
Pending requests and Curriculum Advisers do not become class
advisers. When a grant refreshes a teacher's account name, their existing
current-year adviser sections are refreshed too.

The section editor displays the assigned name read-only. Firestore rules and
the coordinator callable enforce ownership independently of the UI. Revoke the
assignment before deleting an assigned section or changing its grade/year.
Revocation and account deletion remove ownership but keep the last synced name,
so staff can edit it manually again.

## Existing assignments

The backfill reads the configured current school year and checks each section
against its adviser lock and the approved account assignment. It does not use
pending requests or change historical sections. Each section is rechecked in a
transaction so a concurrent replacement, revocation, or year change cannot
restore stale data. Repeated runs skip unchanged records. Applied changes have
`section.adviserSynced` audit entries; warnings identify inconsistent records.

With Application Default Credentials for the intended project:

```powershell
node functions/scripts/backfillSectionAdvisers.mjs bnhs-sims
node functions/scripts/backfillSectionAdvisers.mjs bnhs-sims --apply
node functions/scripts/backfillSectionAdvisers.mjs bnhs-sims
```

The first and last commands are read-only previews. The last should report no
remaining changes or warnings. A partial failure is safe to retry.

On October 19, 2026, the live preview for SY 2026-2027 identified 45 sections to
update with no warnings. No live data was changed by that preview.

## Release components

Release the coordinated change to SIMS hosting, Firestore rules, and these
existing Functions before applying the backfill:

- `resolveSchoolRoleFn`, `resolveSchoolRolesFn`, `replaceAdviserFn`
- `assignSchoolRoleFn`, `revokeSchoolRoleFn`
- `deleteGuardianAccountFn`, `updateCoordinatorSectionFn`

Use the current release source so unrelated live changes are preserved. Apply
the backfill after the new Functions are active, then verify the section list
and editor against School Access. The Parent App needs no deployment.

## Verification

Coverage includes assignment/replacement/revocation, account deletion, repeat
grants, refreshed account names, manual-edit protection, ownership forgery,
current-year backfill, inconsistent locks, ended years, and repeatable backfill.
The browser fixture at `tests/browser/section-editing.html?checks` exercises an
open editor receiving assignment and revocation updates while preserving drafts.
