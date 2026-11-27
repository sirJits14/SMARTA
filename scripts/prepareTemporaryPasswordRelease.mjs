// Prepare a local, independent Step 3 source tree. This never publishes anything.
// Run from the repository root. Output must be new; existing files are preserved.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';

const base = '26a6ed7'; // Source before the held coordinator rollout.
const releaseDir = 'docs/releases/2026-10-11-temporary-password';
const root = process.cwd();
const target = resolve(root, process.argv[2] || '.superpowers/releases/temporary-password');
if (!target.startsWith(root + '\\') && !target.startsWith(root + '/')) throw new Error('Output must be inside this repository');
if (existsSync(target)) throw new Error('Output already exists; choose a new directory');
const files = [
  'functions/index.js', 'functions/src/callable.js', 'functions/src/callable.test.js',
  'functions/src/handlers/users.js', 'functions/src/handlers/users.test.js',
  'functions/src/lib/staffProfileBindings.js', 'functions/src/lib/staffProfileBindings.test.js',
  'functions/scripts/backfillStaffProfileBindings.mjs',
  'functions/test/emulator/temporaryPassword.test.js', 'functions/test/emulator/staffProfileBindings.test.js',
  'src/App.jsx', 'src/components/ChangePassword.jsx',
  'src/lib/access.js', 'src/lib/access.test.js', 'src/lib/password.js', 'src/lib/password.test.js',
  'tests/rules/helpers.js', 'tests/rules/temporaryPassword.test.js',
  'tests/rules/passwordReleaseCompatibility.test.js', 'tests/rules/scanEvents.test.js',
  'scripts/deployTemporaryPasswordRelease.mjs',
];
// The base's scan handler is intentionally not published: production Step 1
// scan/recovery functions retain their deployed source. Only callables ship.
const manifest = { baseCommit: execFileSync('git', ['rev-parse', base], { encoding: 'utf8' }).trim(), files: {} };
for (const path of files) manifest.files[path] = createHash('sha256').update(readFileSync(path)).digest('hex');
const passwordRules = readFileSync(`${releaseDir}/firestore.password-only.rules`);
const callables = [...readFileSync('functions/index.js', 'utf8').matchAll(/^export const (\w+Fn) =/gm)].map(match => match[1]);
if (callables.length !== 25) throw new Error('Callable list changed; review the release selection');
manifest.rulesSha256 = createHash('sha256').update(passwordRules).digest('hex');
manifest.baseline = JSON.parse(readFileSync(`${releaseDir}/baseline.json`, 'utf8'));
mkdirSync(target, { recursive: true });
const archive = execFileSync('git', ['archive', base], { maxBuffer: 50 * 1024 * 1024 });
execFileSync('tar', ['-xf', '-', '-C', target], { input: archive });
for (const path of files) {
  mkdirSync(dirname(resolve(target, path)), { recursive: true });
  copyFileSync(path, resolve(target, path));
}
writeFileSync(resolve(target, 'firestore.rules'), passwordRules);
const config = JSON.parse(readFileSync(resolve(target, 'firebase.json'), 'utf8'));
manifest.deployOnly = [...callables.map(name => `functions:${name}`), 'firestore:rules', 'hosting:sims'].join(',');
writeFileSync(resolve(target, 'release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
// Keep the ordinary config so local emulators work. The release config limits
// hosting/index scope; the deployment wrapper enforces callable-only selection.
// Never invoke a bare Firebase deploy against this source tree.
writeFileSync(resolve(target, 'firebase.password-release.json'), JSON.stringify({
  hosting: config.hosting.filter(site => site.target === 'sims'),
  firestore: { rules: 'firestore.rules' }, functions: config.functions,
}, null, 2) + '\n');
console.log(`Prepared ${relative(root, target)}. No deployment performed.`);
