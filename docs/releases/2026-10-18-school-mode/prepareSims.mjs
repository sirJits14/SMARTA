// Recreate the live Family/School SIMS source, then apply this release's
// reviewed School mode overlays. No environment, git state, or deployed resource changes.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, readdirSync } from 'node:fs';
import { resolve, relative, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const release = 'docs/releases/2026-10-18-school-mode';
const out = resolve(root, process.argv[2] || '.superpowers/releases/school-mode');
const inside = relative(root, out);
if (!inside || inside.startsWith('..') || resolve(out) === root) throw new Error('Output must be a new directory inside this repository');
if (existsSync(join(out, 'sims')) || existsSync(join(out, 'school-family'))) throw new Error('Source output exists; choose another directory');
mkdirSync(out, { recursive: true });
// The Family/School release's prepared SIMS tree is what production serves now.
execFileSync(process.execPath, ['docs/releases/2026-10-18-school-family/prepareSims.mjs', relative(root, join(out, 'school-family'))], { cwd: root, stdio: 'inherit' });
const baseline = join(out, 'school-family', 'sims');
const put = (target, path, contents) => {
  mkdirSync(dirname(join(target, path)), { recursive: true });
  writeFileSync(join(target, path), contents);
};
const tree = (dir, prefix = '') => readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap(entry => {
  const path = join(prefix, entry.name);
  return entry.isDirectory() ? tree(dir, path) : [path.replaceAll('\\', '/')];
});
const hash = (dir, path) => createHash('sha256').update(readFileSync(join(dir, path))).digest('hex');
// SIMS bundles a few Parent app helpers; record those alongside src/ and shared/.
const bundled = path => path.startsWith('src/') || path.startsWith('shared/') || ['parent/src/lib/school.js', 'parent/src/lib/classSession.js'].includes(path);
const baselineFiles = Object.fromEntries(tree(baseline).filter(bundled).map(path => [path, hash(baseline, path)]));
const sims = join(out, 'sims');
cpSync(baseline, sims, { recursive: true });
const overlay = join(root, release, 'release-source');
for (const path of tree(overlay)) put(sims, path, readFileSync(join(overlay, path)));
const changes = tree(sims).filter(bundled).filter(path => baselineFiles[path] !== hash(sims, path)).map(path => ({ path, before: baselineFiles[path] || null, after: hash(sims, path) }));
writeFileSync(join(out, 'sims-source-manifest.json'), JSON.stringify({ baseline: 'docs/releases/2026-10-18-school-family/prepareSims.mjs', productionMainScript: '/assets/index-C1ztdq4p.js', changes }, null, 2) + '\n');
// A hosting-only config prevents accidentally publishing the historical backend.
const config = JSON.parse(readFileSync(join(sims, 'firebase.json'), 'utf8'));
writeFileSync(join(sims, 'firebase.school-mode-release.json'), JSON.stringify({ hosting: config.hosting.filter(site => site.target === 'sims') }, null, 2) + '\n');
console.log(`Prepared live baseline and School mode SIMS source in ${relative(root, out)}. No deployment performed.`);
