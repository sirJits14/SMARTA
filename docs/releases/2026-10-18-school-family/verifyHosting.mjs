import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
const [directory, origin, report] = process.argv.slice(2);
if (!directory || !origin || !report) throw new Error('Usage: node verifyHosting.mjs DIST HTTPS_ORIGIN REPORT.json');
if (!['https://bnhs-sims.web.app', 'https://bnhs-parent.web.app'].includes(origin)) throw new Error('Unexpected hosting origin');
const dir = resolve(directory);
const list = (prefix = '') => readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap(e => {
  const path = prefix ? `${prefix}/${e.name}` : e.name;
  return e.isDirectory() ? list(path) : [path];
});
const files = list();
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const results = [];
let next = 0;
await Promise.all(Array.from({ length: 5 }, async () => {
  while (next < files.length) {
    const path = files[next++];
    const expected = digest(readFileSync(join(dir, path)));
    const response = await fetch(`${origin}/${path}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    const actual = digest(Buffer.from(await response.arrayBuffer()));
    results.push({ path, sha256: expected, matches: actual === expected });
  }
}));
results.sort((a, b) => a.path.localeCompare(b.path));
const mismatches = results.filter(item => !item.matches);
writeFileSync(report, JSON.stringify({ origin, checkedAt: new Date().toISOString(), files: results }, null, 2) + '\n');
console.log(`${origin}: ${files.length - mismatches.length}/${files.length} files match local build`);
if (mismatches.length) throw new Error(`Hosting mismatch: ${mismatches.map(item => item.path).join(', ')}`);
