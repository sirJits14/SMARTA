// Recreate the live relationship-correction SIMS source, then apply this release's
// reviewed School access review queue overlays. No environment, git state, or deployed resource changes.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync, readdirSync, rmSync } from 'node:fs';
import { resolve, relative, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const release = 'docs/releases/2026-10-19-school-access-review';
const out = resolve(root, process.argv[2] || '.superpowers/releases/school-access-review');
const inside = relative(root, out);
if (!inside || inside.startsWith('..') || resolve(out) === root) throw new Error('Output must be a new directory inside this repository');
if (existsSync(join(out, 'sims')) || existsSync(join(out, 'relationship-correction'))) throw new Error('Source output exists; choose another directory');
mkdirSync(out, { recursive: true });
// The relationship-correction release's prepared SIMS tree is what production serves now.
execFileSync(process.execPath, ['docs/releases/2026-10-18-relationship-correction/prepareSims.mjs', relative(root, join(out, 'relationship-correction'))], { cwd: root, stdio: 'inherit' });
const baseline = join(out, 'relationship-correction', 'sims');
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
const bundled = path => path.startsWith('src/') || path.startsWith('shared/') || ['parent/src/lib/school.js', 'parent/src/lib/classSession.js', 'parent/src/strings.js'].includes(path);
const baselineFiles = Object.fromEntries(tree(baseline).filter(bundled).map(path => [path, hash(baseline, path)]));
const sims = join(out, 'sims');
cpSync(baseline, sims, { recursive: true });
// School access moved into src/pages/guardians/school/; drop the old single-page tab.
rmSync(join(sims, 'src/pages/guardians/SchoolAccessTab.jsx'));
const overlay = join(root, release, 'release-source');
for (const path of tree(overlay)) put(sims, path, readFileSync(join(overlay, path)));
// HistoryView.test.js checks the tree's index file; use the production release indexes.
put(sims, 'firestore.indexes.json', readFileSync(join(root, 'docs/releases/2026-10-18-school-family/firestore.indexes.json')));
const changes = [...new Set([...Object.keys(baselineFiles), ...tree(sims).filter(bundled)])].sort()
  .map(path => ({ path, before: baselineFiles[path] || null, after: existsSync(join(sims, path)) ? hash(sims, path) : null }))
  .filter(change => change.before !== change.after);
writeFileSync(join(out, 'sims-source-manifest.json'), JSON.stringify({ baseline: 'docs/releases/2026-10-18-relationship-correction/prepareSims.mjs', productionMainScript: '/assets/index-BrmqHMeI.js', changes }, null, 2) + '\n');
// A hosting-only config prevents accidentally publishing the historical backend.
const config = JSON.parse(readFileSync(join(sims, 'firebase.json'), 'utf8'));
writeFileSync(join(sims, 'firebase.school-access-review-release.json'), JSON.stringify({ hosting: config.hosting.filter(site => site.target === 'sims') }, null, 2) + '\n');
console.log(`Prepared live baseline and School access review SIMS source in ${relative(root, out)}. No deployment performed.`);
