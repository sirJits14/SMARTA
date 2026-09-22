import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const LIMIT = 200 * 1024;
const dir = join(process.cwd(), 'dist', 'assets');
let total = 0;
for (const f of readdirSync(dir)) {
  if (!f.endsWith('.js') && !f.endsWith('.css')) continue;
  const gz = gzipSync(readFileSync(join(dir, f))).length;
  total += gz;
  console.log(`${f}: ${(gz / 1024).toFixed(1)} KB gz`);
}
console.log(`total: ${(total / 1024).toFixed(1)} KB gz (limit ${(LIMIT / 1024).toFixed(0)} KB)`);
if (total > LIMIT) { console.error('Bundle budget exceeded'); process.exit(1); }
