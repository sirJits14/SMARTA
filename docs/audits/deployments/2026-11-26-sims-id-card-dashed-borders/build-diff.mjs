// Hash-normalised comparison of two dist folders. Usage: node build-diff.mjs <distA> <distB>
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
const [a, b] = process.argv.slice(2);
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const norm = (n) => n.replace(/-[A-Za-z0-9_-]{8}(\.(js|css|png|svg|woff2?))$/, '-#$1');
function load(dir) {
  const files = walk(dir).map((f) => relative(dir, f).split(String.fromCharCode(92)).join('/'));
  const names = files.map((f) => f.split('/').pop()).filter((n) => norm(n) !== n);
  const m = new Map();
  for (const f of files) {
    let s = readFileSync(join(dir, f), 'latin1');
    for (const n of names) s = s.split(n).join(norm(n));
    const key = norm(f);
    m.set(key, [...(m.get(key) || []), { f, s, size: statSync(join(dir, f)).size }]);
  }
  return m;
}
const A = load(a), B = load(b);
let same = 0;
for (const k of [...new Set([...A.keys(), ...B.keys()])].sort()) {
  const x = A.get(k), y = B.get(k);
  if (!x) { console.log(`ADDED    ${y.map((e) => `${e.f} (${e.size} B)`).join(', ')}`); continue; }
  if (!y) { console.log(`REMOVED  ${x.map((e) => e.f).join(', ')}`); continue; }
  const sx = x.map((e) => e.s).sort().join('\0'), sy = y.map((e) => e.s).sort().join('\0');
  if (sx === sy) { same++; continue; }
  console.log(`CHANGED  ${x.map((e) => `${e.f} (${e.size} B)`).join(', ')} -> ${y.map((e) => `${e.f} (${e.size} B)`).join(', ')}`);
}
console.log(`identical after normalisation: ${same}`);
