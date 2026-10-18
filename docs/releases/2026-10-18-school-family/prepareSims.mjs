// Recreate the documented production SIMS source, then apply this release's
// reviewed UI overlays. No environment, git state, or deployed resource changes.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, cpSync, renameSync, readdirSync } from 'node:fs';
import { resolve, relative, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const release = 'docs/releases/2026-10-18-school-family';
const out = resolve(root, process.argv[2] || '.superpowers/releases/school-family');
const inside = relative(root, out);
if (!inside || inside.startsWith('..') || resolve(out) === root) throw new Error('Output must be a new directory inside this repository');
if (existsSync(join(out, 'sims')) || existsSync(join(out, 'live-baseline')) || existsSync(join(out, 'preparation'))) throw new Error('Source output exists; choose another directory');
mkdirSync(out, { recursive: true });
const run = (name, args, options = {}) => execFileSync(name, args, { cwd: root, maxBuffer: 80 * 1024 * 1024, ...options });
const snapshot = join(out, 'preparation');
mkdirSync(snapshot);
run('tar', ['-xf', '-', '-C', snapshot], { input: run('git', ['archive', '670c87e']) });
const gitDir = run('git', ['rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).trim();
run(process.execPath, ['scripts/prepareTemporaryPasswordRelease.mjs', 'prepared'], {
  cwd: snapshot, stdio: 'inherit', env: { ...process.env, GIT_DIR: gitDir, GIT_WORK_TREE: snapshot },
});
const baseline = join(out, 'live-baseline');
renameSync(join(snapshot, 'prepared'), baseline);
const apply = (patch) => run('git', ['apply', '--whitespace=nowarn', '--directory=' + relative(root, baseline).replaceAll('\\', '/')], { input: patch });
const diff = (...args) => run('git', ['diff', '--binary', ...args]);
apply(diff('c1b9883^', 'c1b9883', '--', '.', ':(exclude)scripts/build-logos.py'));
apply(diff('cb1e514^', 'cb1e514'));
apply(diff('1ae23c4', 'a2db95a', '--', 'src'));
apply(diff('670c87e', '1929223', '--', 'src'));
apply(diff('f0f5b17^', 'f0f5b17'));
apply(diff('165dd5f^', '165dd5f'));
apply(readFileSync(join(root, 'docs/audits/deployments/2026-10-15-pm-session-sims/sims-pm-port.patch')));
const put = (target, path, contents) => {
  mkdirSync(dirname(join(target, path)), { recursive: true });
  writeFileSync(join(target, path), contents);
};
for (const path of ['shared/sectionEditing.js', 'src/data/coordinatorSections.js']) put(baseline, path, run('git', ['show', `e31b6b1:${path}`]));
const historical = (folder, paths) => {
  for (const path of paths) put(baseline, path, readFileSync(join(root, 'docs/audits/deployments', folder, 'release-source', path)));
};
historical('2026-10-15-glc-section-editing', ['src/pages/SectionsPage.jsx', 'src/lib/access.js']);
apply(diff('052dc02', '3c08a05', '--', 'src', 'tests', ':(exclude)src/hooks/useCollection.js', ':(exclude)src/pages/StudentsPage.jsx', ':(exclude)src/lib/staffQueries.js', ':(exclude)src/lib/staffQueries.test.js'));
historical('2026-10-15-search-optimization-sims', ['src/hooks/useCollection.js', 'src/pages/StudentsPage.jsx']);
apply(diff('5eab791^', '5eab791'));
apply(diff('ae9cece', '5fd1895', '--', 'src'));
const tree = (dir, prefix = '') => readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap(entry => {
  const path = join(prefix, entry.name);
  return entry.isDirectory() ? tree(dir, path) : [path.replaceAll('\\', '/')];
});
const hash = (dir, path) => createHash('sha256').update(readFileSync(join(dir, path))).digest('hex');
const baselineFiles = Object.fromEntries(tree(baseline).filter(path => path.startsWith('src/') || path.startsWith('shared/')).map(path => [path, hash(baseline, path)]));
const sims = join(out, 'sims');
cpSync(baseline, sims, { recursive: true });
const overlay = join(root, release, 'release-source');
for (const path of tree(overlay)) put(sims, path, readFileSync(join(overlay, path)));
const changes = tree(sims).filter(path => path.startsWith('src/') || path.startsWith('shared/') || path === 'parent/src/lib/school.js').filter(path => baselineFiles[path] !== hash(sims, path)).map(path => ({ path, before: baselineFiles[path] || null, after: hash(sims, path) }));
writeFileSync(join(out, 'sims-source-manifest.json'), JSON.stringify({ historicalPreparation: '670c87e', productionMainScript: '/assets/index-gu2n-5mj.js', changes }, null, 2) + '\n');
// A hosting-only config prevents accidentally publishing the historical backend.
const config = JSON.parse(readFileSync(join(sims, 'firebase.json'), 'utf8'));
writeFileSync(join(sims, 'firebase.school-family-release.json'), JSON.stringify({ hosting: config.hosting.filter(site => site.target === 'sims') }, null, 2) + '\n');
console.log(`Prepared baseline and Family/School SIMS source in ${relative(root, out)}. No deployment performed.`);
