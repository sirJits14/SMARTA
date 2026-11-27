// Compare the complete published builds, including the advisory-control chunk.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const release = resolve(root, process.argv[2] || '.superpowers/releases/advisory-toggle');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const walk = (directory, prefix = '') => readdirSync(join(directory, prefix), { withFileTypes: true }).flatMap(entry => {
  const file = join(prefix, entry.name);
  return entry.isDirectory() ? walk(directory, file) : [file.replaceAll('\\', '/')];
});
const results = [];
for (const [app, site] of [['sims', 'https://bnhs-sims.web.app'], ['parent', 'https://bnhs-parent.web.app']]) {
  const dist = join(release, app, 'dist');
  const files = walk(dist);
  const pending = [...files];
  const checked = [];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (pending.length) {
      const file = pending.shift();
      const local = readFileSync(join(dist, file));
      try {
        const response = await fetch(`${site}/${file}?release=advisory-toggle`, { signal: AbortSignal.timeout(30000) });
        const bytes = Buffer.from(await response.arrayBuffer());
        checked.push({ file, matches: response.ok && hash(bytes) === hash(local), status: response.status });
      } catch (error) {
        checked.push({ file, matches: false, error: error.message });
      }
    }
  }));
  const control = app === 'sims' ? files.find(file => /^assets\/SchoolAccessTab-.*\.js$/.test(file)) : null;
  const source = control ? readFileSync(join(dist, control), 'utf8') : '';
  results.push({ app, site, files: files.length, matched: checked.filter(file => file.matches).length,
    mismatches: checked.filter(file => !file.matches),
    ...(control ? { control, containsToggle: ['Advisory section requests', 'Enable requests', 'Disable requests', 'setAdvisoryRequestsEnabledFn'].every(text => source.includes(text)) } : {}),
  });
}
console.log(JSON.stringify(results, null, 2));
if (results.some(result => result.mismatches.length || (result.app === 'sims' && !result.containsToggle))) process.exitCode = 1;
