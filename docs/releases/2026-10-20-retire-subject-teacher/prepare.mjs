// Prepare the Subject Teacher retirement SIMS release (PR #76) over the verified
// SIMS module restyle bundle. Keeps the held coordinator rollout out of SIMS.
// shared/schoolAccess.js is the tree's own version with only the role lists
// changed (see the record README); the other overlay files are master's.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, relative, join, dirname, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const release = dirname(fileURLToPath(import.meta.url));
const root = resolve(release, '../../..');
const out = resolve(root, process.argv[2] || '.superpowers/releases/retire-subject-teacher/release');
const inside = relative(root, out);
if (!inside || inside.startsWith('..') || isAbsolute(inside) || existsSync(out)) throw new Error('Choose a new output directory inside this repository.');
mkdirSync(out, { recursive: true });

// The nested preparers rewrite committed release configs; keep those records intact.
const kept = ['firebase.ui-modules-release.json', 'firebase.ui-foundation-release.json', 'firebase.bulk-slips-release.json',
  'firebase.registration-release.json', 'firebase.section-adviser-release.json']
  .map(name => [join(root, name), existsSync(join(root, name)) ? readFileSync(join(root, name)) : null]);
execFileSync(process.execPath, ['docs/releases/2026-10-20-ui-modules/prepare.mjs', relative(root, join(out, 'u'))], { cwd: root, stdio: 'inherit' });
for (const [file, saved] of kept) if (saved) writeFileSync(file, saved);

const sims = join(out, 'sims');
cpSync(join(out, 'u/sims'), sims, { recursive: true });
cpSync(join(release, 'release-source'), sims, { recursive: true });
// Live index.html and manifest use LF; a CRLF checkout would otherwise change two unrelated files.
for (const file of ['index.html', 'public/manifest.webmanifest']) {
  writeFileSync(join(sims, file), readFileSync(join(sims, file), 'utf8').replaceAll('\r\n', '\n'));
}

const config = JSON.parse(readFileSync(join(root, 'firebase.json'), 'utf8'));
const path = value => relative(root, join(out, value)).replaceAll('\\', '/');
writeFileSync(join(root, 'firebase.retire-subject-teacher-release.json'), JSON.stringify({
  hosting: config.hosting.filter(site => site.target === 'sims').map(site => ({ ...site, public: path('sims/dist') })),
}, null, 2) + '\n');
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const walk = (dir, prefix = '') => readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap(entry => {
  const file = join(prefix, entry.name);
  return entry.isDirectory() ? walk(dir, file) : [file.replaceAll('\\', '/')];
});
writeFileSync(join(out, 'manifest.json'), JSON.stringify({
  baseline: 'docs/releases/2026-10-20-ui-modules/prepare.mjs',
  overlays: Object.fromEntries(walk(join(release, 'release-source')).map(file => [file, hash(join(sims, file))])),
}, null, 2) + '\n');
console.log(`Prepared ${relative(root, out)}. No deployed resources or school records changed.`);
