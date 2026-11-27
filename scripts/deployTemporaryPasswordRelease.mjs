// Run only inside the prepared release tree. `verify` is read-only/local.
// The other phases publish to production; run them only during the approved cutover.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const [phase, ...extra] = process.argv.slice(2);
if (extra.length || !['verify', 'hosting', 'functions', 'rules'].includes(phase)) {
  throw new Error('Usage: node scripts/deployTemporaryPasswordRelease.mjs verify|hosting|functions|rules');
}
const manifest = JSON.parse(readFileSync('release-manifest.json', 'utf8'));
if (manifest.baseCommit !== '26a6ed7a1797624f614c364b4dc70e5f4778842e'
    || manifest.baseline.project !== 'bnhs-sims') throw new Error('Unexpected release baseline');
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
for (const [file, expected] of Object.entries(manifest.files)) {
  if (hash(file) !== expected) throw new Error(`Release source changed: ${file}`);
}
if (hash('firestore.rules') !== manifest.rulesSha256) throw new Error('Release rules changed');
const callables = [...readFileSync('functions/index.js', 'utf8').matchAll(/^export const (\w+Fn) =/gm)].map(match => match[1]);
const expected = [...callables.map(name => `functions:${name}`), 'firestore:rules', 'hosting:sims'];
if (callables.length !== 25 || manifest.deployOnly !== expected.join(',')) throw new Error('Invalid deployment selection');
const config = JSON.parse(readFileSync('firebase.password-release.json', 'utf8'));
if (config.firestore.rules !== 'firestore.rules' || config.firestore.indexes
    || config.functions.length !== 1 || config.functions[0].source !== 'functions'
    || config.functions[0].codebase !== 'default'
    || config.hosting.length !== 1 || config.hosting[0].target !== 'sims'
    || config.hosting[0].public !== 'dist') throw new Error('Unexpected release configuration');
const selection = phase === 'functions' ? expected.filter(item => item.startsWith('functions:')).join(',')
  : phase === 'hosting' ? 'hosting:sims' : 'firestore:rules';
if (phase === 'verify') {
  console.log('Release source and rules verified. Publication is limited to 25 callables, SIMS hosting and Firestore rules. No deployment performed.');
} else {
  const require = createRequire(import.meta.url);
  const cli = require.resolve('firebase-tools/lib/bin/firebase.js');
  execFileSync(process.execPath, [cli, 'deploy', '--project', 'bnhs-sims',
    '--config', 'firebase.password-release.json', '--only', selection], { stdio: 'inherit' });
}
