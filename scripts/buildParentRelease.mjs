// Firebase Hosting predeploy: reject old source and rebuild instead of uploading
// an ignored dist directory left behind by a previous checkout.
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const parent = join(root, 'parent');
const uiBaseline = 'e311ee95cbfa095984721e417f0428b42953a44e'; // PR #74
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();

execFileSync('git', ['fetch', 'origin', 'master'], { cwd: root, stdio: 'inherit' });
const source = git('rev-parse', 'HEAD');
if (source !== git('rev-parse', 'origin/master')) {
  throw new Error('Parent deployment requires the latest merged origin/master. Update the checkout before deploying.');
}
try {
  git('merge-base', '--is-ancestor', uiBaseline, 'HEAD');
} catch {
  throw new Error('Parent deployment must include the UI/UX from PR #74.');
}
if (git('status', '--porcelain', '--', 'parent', 'shared')) {
  throw new Error('Commit and merge Parent/shared source changes before deploying.');
}

const { loadEnv } = await import(pathToFileURL(join(parent, 'node_modules/vite/dist/node/index.js')).href);
const envDirectory = resolve(process.env.PARENT_ENV_DIR || parent);
const env = { ...process.env, ...loadEnv('production', envDirectory, 'VITE_'),
  VITE_USE_EMULATORS: 'false', VITE_APPCHECK_DEBUG_TOKEN: '' };
for (const name of ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID']) {
  if (!env[`VITE_FIREBASE_${name}`]?.trim()) throw new Error(`Missing VITE_FIREBASE_${name}.`);
}
if (env.VITE_FIREBASE_PROJECT_ID !== 'bnhs-sims') throw new Error('Parent production builds must target bnhs-sims.');
if (!env.VITE_RECAPTCHA_SITE_KEY?.trim()) throw new Error('Parent production builds require the App Check site key.');

console.log(`Building Parent release from ${source}; includes PR #74 UI/UX.`);
execFileSync(process.execPath, [join(parent, 'node_modules/vite/bin/vite.js'), 'build'], {
  cwd: parent, env, stdio: 'inherit',
});
execFileSync(process.execPath, [join(parent, 'scripts/checkSize.mjs')], { cwd: parent, stdio: 'inherit' });
