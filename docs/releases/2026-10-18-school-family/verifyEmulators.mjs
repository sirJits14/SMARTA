import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const root = process.cwd();
const backend = resolve(root, '.superpowers/releases/school-family/backend/functions');
let failed = false;
for (const [label, cwd, cli, args, extra] of [
  ['production-compatible rules', root, 'node_modules/vitest/vitest.mjs',
    ['run', '-c', 'docs/releases/2026-10-18-school-family/vitest.rules.config.js'],
    { SIMS_RULES_PATH: 'docs/releases/2026-10-18-school-family/firestore.school-family.rules' }],
  ['production-compatible functions', backend, '.superpowers/releases/school-family/backend/functions/node_modules/vitest/vitest.mjs',
    ['run', 'test/emulator', '--no-file-parallelism', '--testTimeout=20000', '--hookTimeout=20000'], {}],
]) {
  console.log(`Verifying ${label}`);
  const result = spawnSync(process.execPath, [resolve(root, cli), ...args], { cwd, stdio: 'inherit', env: { ...process.env, ...extra } });
  if (result.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
