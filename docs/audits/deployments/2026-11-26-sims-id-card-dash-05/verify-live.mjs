// Read-only verifier (copy of the 2026-11-20 dashboard record's verify-live.mjs, plus fetch retries). Usage:
//   node verify.mjs --dist <dir> [--manifest <sims-hosting-verification.json>] [--live] [--out <file.json>]
//   node verify.mjs --manifest <file> --live            (live vs manifest only, no local dist)
// --live fetches every file from https://bnhs-sims.web.app and compares SHA-256 (content, not status:
// unknown hashed names fall back to index.html with 200).
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const dist = opt('--dist');
const manifestPath = opt('--manifest');
const live = args.includes('--live');
const out = opt('--out');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  for (let i = 1; ; i++) {
    try { return await fetch(url, { cache: 'no-store' }); }
    catch (e) { if (i >= 4) throw e; console.log(`fetch error (${e.cause?.code || e.message}), retrying in 4 s: ${url}`); await sleep(4000); }
  }
}
const sha = (b) => createHash('sha256').update(b).digest('hex');

function walk(dir) {
  const r = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) r.push(...walk(p)); else r.push(p);
  }
  return r;
}

const local = new Map();
if (dist) for (const f of walk(dist)) local.set(relative(dist, f).split('\\').join('/'), sha(readFileSync(f)));
let manifest = null;
if (manifestPath && existsSync(manifestPath)) {
  manifest = new Map(JSON.parse(readFileSync(manifestPath, 'utf8')).files.map((f) => [f.path, f.sha256]));
}

let problems = 0;
if (dist && manifest) {
  const names = new Set([...local.keys(), ...manifest.keys()]);
  let same = 0;
  for (const n of [...names].sort()) {
    if (local.get(n) === manifest.get(n)) same++;
    else { problems++; console.log(`dist vs manifest DIFF ${n} local=${local.get(n) ?? '-'} manifest=${manifest.get(n) ?? '-'}`); }
  }
  console.log(`dist vs manifest: ${same}/${names.size} identical (dist ${local.size}, manifest ${manifest.size})`);
}

const reference = dist ? local : manifest;
if (live) {
  if (!reference) throw new Error('need --dist or --manifest');
  const stamp = Date.now();
  const html = await (await get(`https://bnhs-sims.web.app/index.html?check=${stamp}`)).text();
  const main = (html.match(/assets\/index-[^"']+\.js/) || ['?'])[0];
  console.log(`live main script: ${main}`);
  const files = [];
  let mismatched = 0;
  for (const [path, want] of [...reference.entries()].sort()) {
    const url = `https://bnhs-sims.web.app/${path}${path === 'index.html' ? `?check=${stamp}` : ''}`;
    const res = await get(url);
    const got = sha(Buffer.from(await res.arrayBuffer()));
    const match = got === want;
    if (!match) { mismatched++; console.log(`live MISMATCH ${path}`); }
    files.push({ path, sha256: want, liveSha256: got, status: res.status, match });
  }
  problems += mismatched;
  console.log(`live vs ${dist ? 'dist' : 'manifest'}: ${files.length - mismatched}/${files.length} match, ${mismatched} mismatched`);
  if (out) writeFileSync(out, JSON.stringify({ checkedAt: new Date().toISOString(), liveMainScript: main, checked: files.length, mismatched, files }, null, 2) + '\n');
} else if (out && dist) {
  writeFileSync(out, JSON.stringify({ files: [...local.entries()].sort().map(([path, sha256]) => ({ path, sha256 })) }, null, 2) + '\n');
}
process.exit(problems ? 1 : 0);
