import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

// Measures the INITIAL-LOAD bundle: only the chunk(s) dist/index.html
// actually references eagerly (a <script type="module"> entry, plus any
// <link rel="modulepreload"> the build emits for its static import graph).
// Route-level chunks loaded later via React.lazy()/dynamic import() are
// deliberately excluded — a parent never downloads the Settings screen's
// code before opening Settings, so counting it against the "first paint"
// budget would penalize the exact lazy-loading this app relies on to stay
// fast. See docs/superpowers/specs/2026-09-21-parent-guardian-portal-design.md
// §7 and docs/superpowers/plans/2026-09-21-parent-guardian-portal.md's
// Global Constraints for why this is 260 KB, not the original 200 KB
// estimate: React 19 + Firestore-with-offline-persistence + Auth +
// App Check + Functions cannot fit an eager entry chunk under 200 KB
// gzipped without dropping the offline-persistence UX goal.
const LIMIT = 260 * 1024;

const distDir = join(process.cwd(), 'dist');
const html = readFileSync(join(distDir, 'index.html'), 'utf8');

// <script type="module" src="..."> and <link rel="modulepreload" href="...">
// use different tags and different attribute names for the URL; catch both.
const eagerPaths = new Set();
for (const m of html.matchAll(/<script[^>]*\stype="module"[^>]*\ssrc="([^"]+)"/g)) eagerPaths.add(m[1]);
for (const m of html.matchAll(/<link[^>]*\srel="modulepreload"[^>]*\shref="([^"]+)"/g)) eagerPaths.add(m[1]);

if (eagerPaths.size === 0) {
  console.error('checkSize: found no eagerly-loaded <script type="module"> or modulepreload entries in dist/index.html — cannot measure.');
  process.exit(1);
}

let total = 0;
for (const p of eagerPaths) {
  const file = join(distDir, p.replace(/^\//, ''));
  const gz = gzipSync(readFileSync(file)).length;
  total += gz;
  console.log(`${p}: ${(gz / 1024).toFixed(1)} KB gz (eager)`);
}
console.log(`initial-load total: ${(total / 1024).toFixed(1)} KB gz (limit ${(LIMIT / 1024).toFixed(0)} KB)`);
if (total > LIMIT) { console.error('Initial-load bundle budget exceeded'); process.exit(1); }
