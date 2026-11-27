// Prepare the role-based registration release (PR #62) over the verified
// School Access adviser-sync bundle. Keeps the held coordinator rollout out of
// SIMS, ships Functions by name from the established backend preparer, and
// leaves Firestore rules untouched (advisory_slips is denied by default).
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, relative, join, dirname, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const release = dirname(fileURLToPath(import.meta.url));
const root = resolve(release, '../../..');
const out = resolve(root, process.argv[2] || '.superpowers/releases/registration/release');
const inside = relative(root, out);
if (!inside || inside.startsWith('..') || isAbsolute(inside) || existsSync(out)) throw new Error('Choose a new output directory inside this repository.');
mkdirSync(out, { recursive: true });
execFileSync(process.execPath, ['docs/releases/2026-10-19-section-adviser-sync/prepare.mjs', relative(root, join(out, 'base'))], { cwd: root, stdio: 'inherit' });

const sims = join(out, 'sims');
cpSync(join(out, 'base/sims'), sims, { recursive: true });
cpSync(join(release, 'release-source'), sims, { recursive: true });

// Rules are unchanged: the production ruleset has no catch-all, so the new
// advisory_slips collection is already closed to clients.
const rules = readFileSync(join(out, 'base/firestore.rules'), 'utf8');
if (/match \/\{document=\*\*\}/.test(rules) || rules.includes('advisory_slips')) throw new Error('Production rules changed; review advisory_slips access.');

const functions = [
  'issueAdvisorySlipsFn', 'revokeAdvisorySlipFn', 'listAdvisoryStatusFn', 'previewAdvisorySlipFn', 'redeemAdvisorySlipFn', 'migrateSubjectTeachersFn',
  'getSchoolContextFn', 'requestSchoolRoleFn', 'resolveSchoolRoleFn', 'resolveSchoolRolesFn', 'replaceAdviserFn', 'assignSchoolRoleFn', 'revokeSchoolRoleFn',
  'endSchoolYearFn',
  'getPortalAnnouncementsFn', 'getPortalAnnouncementFn', 'announcementAudienceCountFn', 'onAnnouncementWritten', 'publishAnnouncementsJob',
];
const config = JSON.parse(readFileSync(join(root, 'firebase.json'), 'utf8'));
const path = value => relative(root, join(out, value)).replaceAll('\\', '/');
const hosting = config.hosting.filter(site => site.target === 'sims').map(site => ({ ...site, public: path('sims/dist') }));
writeFileSync(join(root, 'firebase.registration-release.json'), JSON.stringify({
  hosting,
  functions: [{ source: path('base/backend/functions'), codebase: 'default', runtime: 'nodejs22', predeploy: [`node ${path('base/backend/scripts/syncShared.mjs')}`] }],
}, null, 2) + '\n');
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const walk = (dir, prefix = '') => readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap(entry => {
  const file = join(prefix, entry.name);
  return entry.isDirectory() ? walk(dir, file) : [file.replaceAll('\\', '/')];
});
writeFileSync(join(out, 'manifest.json'), JSON.stringify({
  baseline: 'docs/releases/2026-10-19-section-adviser-sync/prepare.mjs',
  overlays: Object.fromEntries(walk(join(release, 'release-source')).map(file => [file, hash(join(sims, file))])),
  rulesSha256: hash(join(out, 'base/firestore.rules')),
  functions,
}, null, 2) + '\n');
console.log(`Prepared ${relative(root, out)}. No deployed resources or school records changed.`);
