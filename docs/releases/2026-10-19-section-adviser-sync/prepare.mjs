// Prepare a narrow release over the verified School access review queue bundle.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, relative, join, dirname, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const release = dirname(fileURLToPath(import.meta.url));
const root = resolve(release, '../../..');
const out = resolve(root, process.argv[2] || '.superpowers/releases/section-adviser-sync/release');
const inside = relative(root, out);
if (!inside || inside.startsWith('..') || isAbsolute(inside) || existsSync(out)) throw new Error('Choose a new output directory inside this repository.');
mkdirSync(out, { recursive: true });
execFileSync(process.execPath, ['docs/releases/2026-10-19-school-access-review/prepareSims.mjs', relative(root, join(out, 'baseline'))], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, ['docs/releases/2026-10-18-school-family/prepareBackend.mjs', relative(root, join(out, 'backend'))], { cwd: root, stdio: 'inherit' });
const sims = join(out, 'sims');
cpSync(join(out, 'baseline/sims'), sims, { recursive: true });
cpSync(join(release, 'release-source'), sims, { recursive: true });
// Keep the tested section editor checks on the live collection hook.
const test = readFileSync(join(root, 'src/pages/SectionsPage.test.js'), 'utf8').replaceAll('useStaffCollectionResource', 'useCollectionResource');
writeFileSync(join(sims, 'src/pages/SectionsPage.test.js'), test);

const read = path => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
const baselineRules = read(join(root, 'docs/releases/2026-10-18-school-family/firestore.school-family.rules'));
const rootRules = read(join(root, 'firestore.rules'));
const start = rootRules.indexOf('    match /sections/{id}');
const end = rootRules.indexOf('    match /schedules/{id}', start);
if (start < 0 || end < start) throw new Error('Section rules markers changed.');
const old = '    match /sections/{id}    { allow read: if isStaff() || isKiosk(); allow write: if isAdmin(); }\n';
if (baselineRules.split(old).length !== 2) throw new Error('Production section rules changed.');
const replacement = rootRules.slice(start, end).replace('isAdmin() || isKiosk() || coordinatorMayReadGrade()', 'isStaff() || isKiosk()');
writeFileSync(join(out, 'firestore.rules'), baselineRules.replace(old, replacement));

const config = JSON.parse(readFileSync(join(root, 'firebase.json'), 'utf8'));
const path = value => relative(root, join(out, value)).replaceAll('\\', '/');
const hosting = config.hosting.filter(site => site.target === 'sims').map(site => ({ ...site, public: path('sims/dist') }));
writeFileSync(join(root, 'firebase.section-adviser-release.json'), JSON.stringify({
  hosting,
  firestore: { rules: path('firestore.rules'), indexes: 'docs/releases/2026-10-18-school-family/firestore.indexes.json' },
  functions: [{ source: path('backend/functions'), codebase: 'default', runtime: 'nodejs22', predeploy: [`node ${path('backend/scripts/syncShared.mjs')}`] }],
}, null, 2) + '\n');
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const walk = (dir, prefix = '') => readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap(entry => {
  const path = join(prefix, entry.name);
  return entry.isDirectory() ? walk(dir, path) : [path.replaceAll('\\', '/')];
});
writeFileSync(join(out, 'manifest.json'), JSON.stringify({
  baseline: 'docs/releases/2026-10-19-school-access-review/prepareSims.mjs',
  overlays: Object.fromEntries(walk(join(release, 'release-source')).map(path => [path, hash(join(sims, path))])),
  rulesSha256: hash(join(out, 'firestore.rules')),
  functions: ['resolveSchoolRoleFn', 'resolveSchoolRolesFn', 'replaceAdviserFn', 'assignSchoolRoleFn', 'revokeSchoolRoleFn', 'deleteGuardianAccountFn', 'updateCoordinatorSectionFn'],
}, null, 2) + '\n');
console.log(`Prepared ${relative(root, out)}. No deployed resources or school records changed.`);
