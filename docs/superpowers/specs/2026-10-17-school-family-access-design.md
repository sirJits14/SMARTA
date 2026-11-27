# Family and School access

## Approved intent
One account has separate Family and School views. Family relationships have equal permissions for approved linked learners. School responsibilities are separate, school-year-scoped assignments: adviser (section), subject_teacher (section, notices only), curriculum_adviser (grade). Existing SIMS administrators retain school-wide authority; existing coordinator roles are not silently promoted to the new Curriculum Adviser role.

Administrators assign roles directly or approve requests. Curriculum Advisers may approve only adviser requests from verified @deped.gov.ph accounts within their assigned grades. Other email accounts require administrator approval. Nobody approves their own request. Requests confer no access. Only administrators assign Curriculum Advisers, subject teachers, revoke assignments, or directly assign advisers. One active adviser per section/year; replacement requires explicit revocation. Assignment is independent from family links.

Advisers see their section roster automatically and may immediately mark AM or PM absent, despite a gate scan, with a required reason. Their corrections are limited to the same Asia/Manila school day. Curriculum Advisers can correct attendance across assigned grades, including earlier dates; administrators can correct school-wide. Original scans and base marks remain intact. Reversal restores the underlying status, including late. Changes are version-checked, audited, and notify approved family links with neutral push text and authenticated details. Future dates and ended school years are not editable. AM changes cannot change PM.

Announcement authors select Families, Advisers, Subject Teachers, Curriculum Advisers independently, optionally narrowed by grades or sections. Recipient matching uses current approved assignments or active family links. Multiple qualifying roles produce one notification. Subject-teacher assignments never grant learner tracking. Existing authoring permissions stay unchanged.

## Implementation boundaries
Use existing React/Vite apps, Firebase Auth/Firestore/Functions, theme tokens and controls. School data and privileged operations use authenticated App Check callables; clients never write assignments, requests, or attendance override/audit data directly. Keep school roles separate from users/{email} SIMS account roles. All callable authorization is server-side, and mutation transactions read actor assignments and scope alongside target records. Metadata-only section options support requests without disclosing students.

school_accounts/{uid} contains an assignments array of {role, schoolYear, sectionId?, gradeLevel}; school_role_requests contain server-verified requester identity and requested assignment. Section adviser locks prevent simultaneous approvals. Audit records and permission mutations commit atomically. Revoked/old-year permissions stop working without client refresh.

Legacy adviser links must no longer confer family access or allow slip-based adviser authorization. Preserve their records for administrator verification, show migration candidates to administrators, and provide section assignments explicitly; do not infer approval from an old link. Existing family links and slot caps remain unchanged. Existing adviser-to-family corrections must not become a bypass for unapproved access.

Attendance session overrides live beside base marks on student_attendance and are projected to family-visible records. Shared effective-attendance helpers feed take-attendance, monthly summaries and SF2 output. Preserve the already-released optional PM scan behavior from PR #31 (4acf334); do not deploy the held coordinator rollout as a side effect.

## Delivery and verification
Implement locally with no live data migrations or deployment. Verify permissions, approval races, AM/PM isolation, restored lateness, repeat submissions, revocation, family-only notifications and role/section audience matching with unit, emulator and rules tests. Build both apps and check the parent bundle budget. Document any deployment prerequisite arising from the production/source divergence.
