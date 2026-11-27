// Prepare the SIMS UI foundation release (PR #66) over the verified bulk
// advisory slip bundle. SIMS hosting only: no Functions, rules or Parent App
// changes. Keeps the held coordinator rollout out of SIMS.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, relative, join, dirname, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const release = dirname(fileURLToPath(import.meta.url));
const root = resolve(release, '../../..');
const out = resolve(root, process.argv[2] || '.superpowers/releases/ui-foundation/release');
const inside = relative(root, out);
if (!inside || inside.startsWith('..') || isAbsolute(inside) || existsSync(out)) throw new Error('Choose a new output directory inside this repository.');
mkdirSync(out, { recursive: true });

// The nested preparers rewrite committed release configs; keep those records intact.
const kept = ['firebase.bulk-slips-release.json', 'firebase.registration-release.json', 'firebase.section-adviser-release.json']
  .map(name => [join(root, name), existsSync(join(root, name)) ? readFileSync(join(root, name)) : null]);
execFileSync(process.execPath, ['docs/releases/2026-10-20-bulk-slips/prepare.mjs', relative(root, join(out, 'b'))], { cwd: root, stdio: 'inherit' });
for (const [file, saved] of kept) if (saved) writeFileSync(file, saved);

const sims = join(out, 'sims');
cpSync(join(out, 'b/sims'), sims, { recursive: true });
cpSync(join(release, 'release-source'), sims, { recursive: true });
// Replaced by the sidebar account menu (AccountMenu.jsx).
for (const gone of ['src/components/ThemeControl.jsx', 'src/components/ThemeMenuButton.jsx']) rmSync(join(sims, gone));
// The tree's shared boot test reads the Parents App page too; give it the new dark page color.
const parentPage = join(sims, 'parent/index.html');
writeFileSync(parentPage, readFileSync(parentPage, 'utf8').replace('data-dark="#0e1c1f"', 'data-dark="#0B0F19"'));

const config = JSON.parse(readFileSync(join(root, 'firebase.json'), 'utf8'));
const path = value => relative(root, join(out, value)).replaceAll('\\', '/');
writeFileSync(join(root, 'firebase.ui-foundation-release.json'), JSON.stringify({
  hosting: config.hosting.filter(site => site.target === 'sims').map(site => ({ ...site, public: path('sims/dist') })),
}, null, 2) + '\n');
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const walk = (dir, prefix = '') => readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap(entry => {
  const file = join(prefix, entry.name);
  return entry.isDirectory() ? walk(dir, file) : [file.replaceAll('\\', '/')];
});
writeFileSync(join(out, 'manifest.json'), JSON.stringify({
  baseline: 'docs/releases/2026-10-20-bulk-slips/prepare.mjs',
  overlays: Object.fromEntries(walk(join(release, 'release-source')).map(file => [file, hash(join(sims, file))])),
  removed: ['src/components/ThemeControl.jsx', 'src/components/ThemeMenuButton.jsx'],
}, null, 2) + '\n');
console.log(`Prepared ${relative(root, out)}. No deployed resources or school records changed.`);
