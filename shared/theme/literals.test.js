import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

// Fails when a color is hard-coded where it would ignore the theme.
// JSX: hex, the word white, and white rgba are flagged. Translucent washes of a
// status or brand hue (e.g. rgba(220,38,38,0.08)) read correctly on both themes.
// Themed stylesheets: every literal must be a token, except ::backdrop rules,
// which cannot inherit custom properties in every browser.
const root = fileURLToPath(new URL('../../', import.meta.url));
const JSX_LITERAL = /(?<![&\w])#[0-9a-fA-F]{3,8}\b|rgba?\(\s*255\s*,\s*255\s*,\s*255|['"]white['"]/;
const CSS_LITERAL = /(?<![&\w-])#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/;
const JSX_ROOTS = ['src', 'parent/src'];
const THEMED_CSS = ['src/registrar.css', 'src/enrollment.css', 'parent/src/glass.css'];
// The QR camera overlay is deliberately dark in both themes.
const JSX_ALLOWED = new Set(['parent/src/components/ScanSheet.jsx']);

const walk = (dir) => readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const hits = (file, pattern, skip = () => false) => readFileSync(file, 'utf8').split(/\r?\n/)
  .map((line, i) => [line, i + 1]).filter(([line]) => !skip(line) && pattern.test(line))
  .map(([line, n]) => `${relative(root, file).replaceAll('\\', '/')}:${n}  ${line.trim().slice(0, 100)}`);

describe('theme literals', () => {
  it('JSX uses palette tokens for colors', () => {
    const files = JSX_ROOTS.flatMap((dir) => walk(join(root, dir))).filter((f) => f.endsWith('.jsx'))
      .filter((f) => !JSX_ALLOWED.has(relative(root, f).replaceAll('\\', '/')));
    expect(files.flatMap((f) => hits(f, JSX_LITERAL))).toEqual([]);
  });
  it('themed stylesheets use tokens for colors', () => {
    expect(THEMED_CSS.flatMap((f) => hits(join(root, f), CSS_LITERAL, (line) => line.includes('::backdrop')))).toEqual([]);
  });
});
