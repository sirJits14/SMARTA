// Restore the advisory request gate over the published Subject Teacher release.
// Preserve its SIMS baseline and the held coordinator rollout boundaries.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const out = resolve(root, process.argv[2] || '.superpowers/releases/advisory-toggle');
const inside = relative(root, out);
if (!inside || inside.startsWith('..') || isAbsolute(inside) || existsSync(out)) {
  throw new Error('Choose a new output directory inside this repository.');
}
mkdirSync(out, { recursive: true });
const path = value => relative(root, join(out, value)).replaceAll('\\', '/');

// Nested historical preparers write their own config files; restore those records.
const kept = readdirSync(root).filter(name => /^firebase\..+-release\.json$/.test(name))
  .map(name => [join(root, name), readFileSync(join(root, name))]);
try {
  execFileSync(process.execPath, ['docs/releases/2026-10-20-retire-subject-teacher/prepare.mjs', path('baseline')], { cwd: root, stdio: 'inherit' });
} finally {
  for (const [file, bytes] of kept) writeFileSync(file, bytes);
}

const sims = join(out, 'sims');
cpSync(join(out, 'baseline/sims'), sims, { recursive: true });
const schoolFile = 'src/pages/guardians/school/SchoolAccessTab.jsx';
const currentSchool = readFileSync(join(root, schoolFile), 'utf8');
const section = currentSchool.match(/      <section aria-labelledby="advisory-requests-heading"[\s\S]*?      <\/section>/)?.[0];
const anchor = '    {context?.isAdmin && view && <>';
let school = readFileSync(join(sims, schoolFile), 'utf8');
if (!section || school.includes('advisory-requests-heading') || school.split(anchor).length !== 2) {
  throw new Error('School access baseline changed; review the advisory control overlay.');
}
school = school.replace(anchor, `${anchor}\n${section}`);
writeFileSync(join(sims, schoolFile), school);

// This preparer preserves the live attendance adaptations. Only the three
// advisory callables are deployed; other Functions are left out of the command.
execFileSync(process.execPath, ['docs/releases/2026-10-18-school-family/prepareBackend.mjs', path('backend')], { cwd: root, stdio: 'inherit' });
const excluded = source => !relative(join(root, 'parent'), source).split(sep)
  .some(part => part === 'node_modules' || part === 'dist' || part.startsWith('.env'));
cpSync(join(root, 'parent'), join(out, 'parent'), { recursive: true, filter: excluded });
cpSync(join(root, 'shared'), join(out, 'shared'), { recursive: true });
for (const file of ['index.html', 'public/manifest.webmanifest']) {
  const target = join(out, 'parent', file);
  writeFileSync(target, readFileSync(target, 'utf8').replaceAll('\r\n', '\n'));
}

const config = JSON.parse(readFileSync(join(root, 'firebase.json'), 'utf8'));
writeFileSync(join(root, 'firebase.advisory-toggle-release.json'), JSON.stringify({
  hosting: config.hosting.map(site => ({ ...site, public: path(site.target === 'sims' ? 'sims/dist' : 'parent/dist') })),
  functions: [{ source: path('backend/functions'), codebase: 'default', runtime: 'nodejs22', predeploy: [`node "${path('backend/scripts/syncShared.mjs')}"`] }],
}, null, 2) + '\n');
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
writeFileSync(join(out, 'manifest.json'), JSON.stringify({
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  simsBaseline: 'docs/releases/2026-10-20-retire-subject-teacher/prepare.mjs',
  simsOverlay: { [schoolFile]: hash(join(sims, schoolFile)) },
  functionsToDeploy: ['getSchoolContextFn', 'requestSchoolRoleFn', 'setAdvisoryRequestsEnabledFn'],
  advisoryBackend: hash(join(out, 'backend/functions/src/handlers/schoolAccess.js')),
}, null, 2) + '\n');
console.log(`Prepared ${relative(root, out)}. No deployment performed.`);
