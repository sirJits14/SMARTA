// Read-only bundle check. Usage: node check-bundle.mjs <dist> <path to .env>
// Prints only whether the 40-char reCAPTCHA site key (VITE_RECAPTCHA_SITE_KEY) is found and in which files,
// and any emulator host strings. Never prints the key.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
const [dist, envPath] = process.argv.slice(2);
const line = readFileSync(envPath, 'utf8').split(/\r?\n/).find((l) => /^\s*VITE_RECAPTCHA_SITE_KEY\s*=/.test(l)) || '';
const key = line.replace(/^\s*VITE_RECAPTCHA_SITE_KEY\s*=\s*/, '').trim().replace(/^["']|["']$/g, '');
if (key.length !== 40 || !key.startsWith('6L')) { console.log('KEY NOT READABLE from .env (expected 40 chars starting 6L)'); process.exit(2); }
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const hits = []; const emu = [];
const emuPatterns = ['localhost:9099', '127.0.0.1:9099', '127.0.0.1:8080', 'localhost:8080', '127.0.0.1:5001', 'localhost:5001', 'connectFirestoreEmulator', 'connectAuthEmulator', 'connectFunctionsEmulator'];
for (const f of walk(dist)) {
  const s = readFileSync(f, 'latin1');
  if (s.includes(key)) hits.push(relative(dist, f));
  for (const p of emuPatterns) if (s.includes(p)) emu.push(`${relative(dist, f)}: ${p}`);
}
console.log(`reCAPTCHA key: ${hits.length ? 'FOUND' : 'NOT FOUND'} in ${hits.length} file(s)${hits.length ? ': ' + hits.join(', ') : ''}`);
console.log(`emulator strings: ${emu.length ? emu.join('; ') : 'none'}`);
process.exit(hits.length === 1 && !emu.length ? 0 : 1);
