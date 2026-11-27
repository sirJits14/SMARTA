// Prepare a by-name Family/School Functions release without changing git,
// environment configuration, deployed resources, or school records.
import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { adaptSessionAttendance } from './backend-source/adaptSessionAttendance.mjs';

const release = dirname(fileURLToPath(import.meta.url));
const root = resolve(release, '../../..');
const args = process.argv.slice(2);
const out = resolve(root, args.find(arg => !arg.startsWith('--')) || '.superpowers/releases/school-family/backend');
const inside = relative(root, out);
if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error('Output must be a new directory inside this repository.');
if (existsSync(out)) throw new Error('Backend output exists; choose a new output directory.');
const put = (path, content) => { mkdirSync(dirname(join(out, path)), { recursive: true }); writeFileSync(join(out, path), content); };
const tree = (dir, prefix = '') => readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap(entry => {
  const path = join(prefix, entry.name);
  return entry.isDirectory() ? tree(dir, path) : [path.replaceAll('\\', '/')];
});
const functions = join(out, 'functions');
cpSync(join(root, 'functions'), functions, { recursive: true, filter: path => {
  const parts = relative(join(root, 'functions'), path).split(sep);
  return !parts.some(part => part === 'node_modules' || part === 'shared' || part === '.firebase' || part.startsWith('.env') || part.endsWith('-debug.log'));
} });
cpSync(join(root, 'shared'), join(out, 'shared'), { recursive: true });
mkdirSync(join(out, 'scripts'), { recursive: true });
copyFileSync(join(root, 'scripts/syncShared.mjs'), join(out, 'scripts/syncShared.mjs'));
cpSync(join(root, 'shared'), join(functions, 'shared'), { recursive: true,
  filter: path => !path.endsWith('.test.js') && relative(join(root, 'shared'), path).split(sep)[0] !== 'theme' });
const scan = 'src/handlers/scanAttendance.js';
const liveScan = readFileSync(join(release, 'backend-source/live-scanAttendance.js'));
copyFileSync(join(release, 'backend-source/live-scanAttendance.js'), join(functions, scan));
const session = 'src/handlers/sessionAttendance.js';
writeFileSync(join(functions, session), adaptSessionAttendance(readFileSync(join(root, 'functions', session), 'utf8').replaceAll('\r\n', '\n')));
copyFileSync(join(release, 'backend-tests/legacyAttendance.emulator.test.js'), join(functions, 'test/emulator/legacyAttendanceRelease.test.js'));
// These ten assertions describe the separately held coordinator rollout.
// Keep their names visible as skips; the release suite tests live behavior.
const heldTests = [
  "it.each([null, '7', 13])('rejects malformed existing attendance grade %s rather than changing the audience'",
  "it('requires an explicit repair for legacy attendance without grade metadata'",
  "it('rejects an existing attendance record with another section identity'",
  "it('derives grade from the trusted section instead of kiosk input'",
  "it.each([null, '7', 6, 13])('rejects invalid trusted section grade %s without writing attendance'",
];
const scanTest = join(functions, 'test/emulator/scanAttendance.test.js');
let scanTestSource = readFileSync(scanTest, 'utf8');
for (const text of heldTests) {
  if (scanTestSource.split(text).length !== 2) throw new Error('Coordinator scan tests changed; review release compatibility exclusions.');
  scanTestSource = scanTestSource.replace(text, text.replace('it.', 'it.skip.').replace("it('", "it.skip('"));
}
writeFileSync(scanTest, '// Ten coordinator grade-rollout assertions remain held; see backend-source-manifest.json.\n' + scanTestSource);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const files = Object.fromEntries(tree(functions).map(path => [path, digest(readFileSync(join(functions, path)))]));
const functionsToDeploy = [
  'getSchoolContextFn', 'requestSchoolRoleFn', 'resolveSchoolRoleFn', 'assignSchoolRoleFn', 'revokeSchoolRoleFn',
  'withdrawSchoolRequestFn', 'resolveSchoolRolesFn', 'replaceAdviserFn', 'markSchoolOpenedFn', 'getSchoolPendingCountFn',
  'getSchoolRosterFn', 'setSessionAbsenceFn', 'getFamilyAttendanceFn', 'onAttendanceCorrectionCreated',
  'getPortalAnnouncementsFn', 'getPortalAnnouncementFn', 'savePortalAnnouncementFn',
  'activateCodeFn', 'changeLinkRelationshipFn', 'submitReportFn', 'deleteGuardianAccountFn',
  'announcementAudienceCountFn', 'onAnnouncementWritten', 'onGuardianLinkWritten',
  'onScanEventCreated', 'expireLinksJob', 'reconcileEventsJob', 'publishAnnouncementsJob',
  'sendAttendanceUpdatesJob',
];
if (functionsToDeploy.includes('setSessionAbsenceFn') && !functionsToDeploy.includes('sendAttendanceUpdatesJob')) {
  throw new Error('setSessionAbsenceFn needs sendAttendanceUpdatesJob in the same release.');
}
put('backend-source-manifest.json', JSON.stringify({
  liveScanRevision: 'onscaneventcreated-00019-pol',
  preservedScanSha256: digest(liveScan),
  adaptations: { [scan]: 'Byte-identical live optional-PM source; coordinator rollout remains held.',
    [session]: 'Absent stored grade uses trusted section grade; invalid explicit grade fails; valid historical grade is retained.' },
  heldEmulatorTests: heldTests,
  functionsToDeploy,
  files,
}, null, 2) + '\n');
put('package.json', JSON.stringify({ private: true, type: 'module' }) + '\n');
if (args.includes('--copy-dependencies')) {
  const dependencyPath = join(root, 'functions/node_modules');
  if (!existsSync(dependencyPath)) throw new Error('Local functions/node_modules is missing.');
  cpSync(dependencyPath, join(functions, 'node_modules'), { recursive: true });
}
console.log(`Prepared ${relative(root, out)}. Live scan SHA-256: ${digest(liveScan)}. No deployment performed.`);
