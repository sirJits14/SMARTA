import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RE2JS } from './re2jsStub.js';

const srcDir = fileURLToPath(new URL('..', import.meta.url));
const sources = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = join(dir, e.name);
  if (e.isDirectory()) return sources(p);
  return /\.jsx?$/.test(e.name) && !/\.test\.js$/.test(e.name) ? [p] : [];
});

describe('re2js stub', () => {
  it('throws, so Firestore reports a Pipeline regex as an invalid pattern', () => {
    expect(() => RE2JS.compile('a.*')).toThrow(/not bundled/);
  });
  // Pipelines are the only Firestore feature that calls into re2js. Using
  // them would need the real package back (drop the alias in vite.config.js).
  it('is safe because no Parent source uses Firestore Pipelines', () => {
    const offenders = sources(srcDir).filter((f) => /firebase\/firestore\/pipelines|\bre2js\b/.test(readFileSync(f, 'utf8')) && !f.endsWith('re2jsStub.js'));
    expect(offenders).toEqual([]);
  });
});
