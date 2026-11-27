// Prepare the bulk advisory slip release (PR #64) over the verified
// role-based registration bundle. SIMS hosting only: no Functions, rules or
// Parent App changes. Keeps the held coordinator rollout out of SIMS.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, relative, join, dirname, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const release = dirname(fileURLToPath(import.meta.url));
const root = resolve(release, '../../..');
const out = resolve(root, process.argv[2] || '.superpowers/releases/bulk-slips/release');
const inside = relative(root, out);
if (!inside || inside.startsWith('..') || isAbsolute(inside) || existsSync(out)) throw new Error('Choose a new output directory inside this repository.');
mkdirSync(out, { recursive: true });

// The registration preparer rewrites its own committed config; keep that record intact.
const registrationConfig = join(root, 'firebase.registration-release.json');
const savedConfig = existsSync(registrationConfig) ? readFileSync(registrationConfig) : null;
execFileSync(process.execPath, ['docs/releases/2026-10-19-registration/prepare.mjs', relative(root, join(out, 'reg'))], { cwd: root, stdio: 'inherit' });
if (savedConfig) writeFileSync(registrationConfig, savedConfig);

const sims = join(out, 'sims');
cpSync(join(out, 'reg/sims'), sims, { recursive: true });
cpSync(join(release, 'release-source'), sims, { recursive: true });

const config = JSON.parse(readFileSync(join(root, 'firebase.json'), 'utf8'));
const path = value => relative(root, join(out, value)).replaceAll('\\', '/');
writeFileSync(join(root, 'firebase.bulk-slips-release.json'), JSON.stringify({
  hosting: config.hosting.filter(site => site.target === 'sims').map(site => ({ ...site, public: path('sims/dist') })),
}, null, 2) + '\n');
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const walk = (dir, prefix = '') => readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap(entry => {
  const file = join(prefix, entry.name);
  return entry.isDirectory() ? walk(dir, file) : [file.replaceAll('\\', '/')];
});
writeFileSync(join(out, 'manifest.json'), JSON.stringify({
  baseline: 'docs/releases/2026-10-19-registration/prepare.mjs',
  overlays: Object.fromEntries(walk(join(release, 'release-source')).map(file => [file, hash(join(sims, file))])),
}, null, 2) + '\n');
console.log(`Prepared ${relative(root, out)}. No deployed resources or school records changed.`);
