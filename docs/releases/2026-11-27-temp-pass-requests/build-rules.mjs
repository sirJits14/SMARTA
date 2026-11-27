// Adds only the Logistic Operator and temporary pass request rules to the saved LIVE ruleset.
// Production does not run master's firestore.rules: never publish that file instead of this output.
// Run from the repository root: node docs/releases/2026-11-27-temp-pass-requests/build-rules.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const live = readFileSync(new URL('../../audits/deployments/2026-11-27-temp-id-pass/firestore.rules', import.meta.url), 'utf8');
const crlf = live.includes('\r\n');
let out = live.replace(/\r\n/g, '\n');

function replace(anchor, text) {
  const parts = out.split(anchor);
  if (parts.length !== 2) throw new Error(`anchor found ${parts.length - 1} times: ${anchor}`);
  out = parts[0] + text + parts[1];
}
const insertAfter = (anchor, text) => replace(anchor, anchor + text);

insertAfter(`    function isAdmin() { return isStaff() && (role() == null || role() in ['admin', 'registrar', '']); }\n`,
  `    // Prints passes and uploads photos for every grade; no other staff access.
    function isLogistic() { return isStaff() && role() == 'logistic'; }
`);

// Pass printing moves from academic coordinators to grade level coordinators.
replace(`    // Mirrors passGrades() in shared/tempPass.js: GLCs do not handle passes.
    function coordinatorMayReadPass() {
      return isStaff() && role() in ['jhs_coord', 'shs_coord'] && coversGrade(resource.data.get('gradeLevel', null));
    }
`, `    // Mirrors passGrades() in shared/tempPass.js.
    function coordinatorMayReadPass() {
      return isStaff() && role() == 'glc' && coversGrade(resource.data.get('gradeLevel', null));
    }
`);

replace(`      allow read: if isAdmin() || coordinatorMayReadPass() || (isKiosk() && resource.data.status == 'active');\n`,
  `      allow read: if isAdmin() || isLogistic() || coordinatorMayReadPass() || (isKiosk() && resource.data.status == 'active');\n`);

// Live rules let any staff read these three. A Logistic Operator must not; kiosk branches are unchanged.
const STAFF_BUT_LOGISTIC = `(isStaff() && role() != 'logistic')`;
replace(`    match /schedules/{id}   { allow read: if isStaff() || isKiosk(); allow write: if isAdmin(); }\n`,
  `    match /schedules/{id}   { allow read: if ${STAFF_BUT_LOGISTIC} || isKiosk(); allow write: if isAdmin(); }\n`);
replace(`    match /student_attendance/{id} {\n      allow read: if isStaff() || isKiosk();\n`,
  `    match /student_attendance/{id} {\n      allow read: if ${STAFF_BUT_LOGISTIC} || isKiosk();\n`);
replace(`      allow get, list: if isStaff();\n`, `      allow get, list: if ${STAFF_BUT_LOGISTIC};\n`);

insertAfter(`    match /school_adviser_locks/{id} { allow read, write: if false; }\n`,
  `    // Adviser requests for temporary ID passes, and the locks that serialize filings. Callables only.
    match /temp_pass_requests/{id} { allow read, write: if false; }
    match /temp_pass_request_locks/{id} { allow read, write: if false; }
`);

writeFileSync(new URL('./firestore.rules', import.meta.url), crlf ? out.replace(/\n/g, '\r\n') : out);
console.log('wrote firestore.rules');
