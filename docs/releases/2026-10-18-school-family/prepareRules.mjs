import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Apply only Family/School authorization changes to the captured production
// rules. Coordinator grade isolation remains a separate, held deployment.
const dir = resolve('docs/releases/2026-10-18-school-family');
const read = path => readFileSync(path, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
let rules = read(resolve(dir, 'firestore.before.rules'));
const current = read('firestore.rules');
function replaceOnce(old, replacement) {
  if (rules.split(old).length !== 2) throw new Error(`Unexpected production rules at ${old.slice(0, 80)}`);
  rules = rules.replace(old, replacement);
}
replaceOnce("&& get(/databases/$(database)/documents/guardian_links/$(request.auth.uid + '_' + studentId)).data.status == 'active';", "&& familyLink(get(/databases/$(database)/documents/guardian_links/$(request.auth.uid + '_' + studentId)).data);");
replaceOnce('    function bounded(n)', "    function familyLink(link) {\n      return link.status == 'active' && link.get('slot', 'guardian') != 'adviser'\n        && link.get('relationship', '') != 'Adviser';\n    }\n    function bounded(n)");
replaceOnce('      allow write: if isAdmin() || coordinatorMayWriteAttendance();', "      allow create: if !request.resource.data.keys().hasAny(['sessionOverrides'])\n        && (isAdmin() || coordinatorMayWriteAttendance());\n      allow update: if !request.resource.data.diff(resource.data).affectedKeys().hasAny(['sessionOverrides'])\n        && (isAdmin() || coordinatorMayWriteAttendance());\n      allow delete: if isAdmin() && !resource.data.keys().hasAny(['sessionOverrides']);");
const oldStart = rules.indexOf('    function guardianSeesPost()');
const oldEnd = rules.indexOf('    // ---------- staff-only records', oldStart);
const newStart = current.indexOf('    match /announcements/{id}');
const newEnd = current.indexOf('    // ---------- staff-only records', newStart);
if ([oldStart, oldEnd, newStart, newEnd].some(x => x < 0)) throw new Error('Missing announcement rules markers');
rules = rules.slice(0, oldStart) + current.slice(newStart, newEnd) + rules.slice(oldEnd);
const denyStart = current.indexOf('    // School access and session corrections');
const denyEnd = current.indexOf('    match /access_requests/{id}', denyStart);
replaceOnce('    match /access_requests/{id}', current.slice(denyStart, denyEnd) + '    match /access_requests/{id}');
rules = rules.replace('// Staff write directly; Functions own pushedAt/pushResult and the\n    // scheduled→published→expired moves. Guardians read only published posts\n    // whose audienceKeys overlap guardians/{uid}.audienceKeys (server-written).', '// Functions authorize portal reads/writes against live family and school access.\n    // Legacy staff writes remain supported for non-role-targeted posts.');
writeFileSync(resolve(dir, 'firestore.school-family.rules'), rules);

// Preserve all existing production indexes and add only this feature's three,
// plus the School access History index (kept last in the root file).
const before = JSON.parse(read(resolve(dir, 'firestore.indexes.before.json')));
const rootIndexes = JSON.parse(read('firestore.indexes.json')).indexes;
const history = rootIndexes.filter(item => item.collectionGroup === 'audit_log');
if (history.length !== 1 || rootIndexes.at(-1) !== history[0]) throw new Error('Expected one audit_log index, last in firestore.indexes.json');
const additions = [...rootIndexes.slice(0, 3), ...history];
const indexes = [...before.indexes];
for (const item of additions) {
  if (!indexes.some(old => JSON.stringify(old) === JSON.stringify(item))) indexes.push(item);
}
writeFileSync(resolve(dir, 'firestore.indexes.json'), JSON.stringify({ ...before, indexes }, null, 2) + '\n');
console.log(`Prepared Family/School rules and ${indexes.length} indexes; production coordinator permissions preserved.`);
