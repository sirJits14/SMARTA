// Build a prepared app with the existing production VITE configuration.
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const [app, environmentDirectory, releaseDirectory = '.superpowers/releases/advisory-toggle'] = process.argv.slice(2);
if (!['sims', 'parent'].includes(app) || !environmentDirectory) {
  throw new Error('Usage: node build.mjs <sims|parent> <production-env-directory> [prepared-release-directory]');
}
const { loadEnv } = await import(pathToFileURL(join(root, 'node_modules/vite/dist/node/index.js')).href);
const env = { ...process.env, ...loadEnv('production', resolve(environmentDirectory), 'VITE_'), VITE_USE_EMULATORS: 'false' };
delete env.VITE_APPCHECK_DEBUG_TOKEN;
for (const name of ['API_KEY', 'AUTH_DOMAIN', 'PROJECT_ID', 'STORAGE_BUCKET', 'MESSAGING_SENDER_ID', 'APP_ID']) {
  if (!env[`VITE_FIREBASE_${name}`]?.trim()) throw new Error(`Missing VITE_FIREBASE_${name}.`);
}
if (env.VITE_FIREBASE_PROJECT_ID !== 'bnhs-sims') throw new Error('This release must target bnhs-sims.');
const dependencies = app === 'parent' ? join(root, 'parent/node_modules') : join(root, 'node_modules');
execFileSync(process.execPath, [join(dependencies, 'vite/bin/vite.js'), 'build'], {
  cwd: join(resolve(root, releaseDirectory), app), env, stdio: 'inherit',
});
