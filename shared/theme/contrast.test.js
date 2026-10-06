import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const css = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
function block(selector) {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`missing ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--t-([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
const PALETTES = { light: block(':root, .paper {'), dark: block(':root[data-theme="dark"] {') };

const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255]
    .map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
};
const ratio = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const TEXT = [
  ...['ink', 'muted', 'subtle', 'nav-ink', 'placeholder', 'primary', 'primary-deep', 'danger-text', 'warn-text']
    .flatMap((fg) => ['bg', 'surface', 'dialog'].map((bg) => [fg, bg])),
  ...['present', 'late', 'absent', 'excused'].flatMap((fg) => ['surface', 'dialog'].map((bg) => [fg, bg])),
  ['on-primary', 'primary'], ['on-primary', 'absent'],
  ...['present', 'late', 'absent', 'excused'].map((bg) => ['on-status', bg]),
  ['feedback-ink', 'feedback-bg'], ['primary-deep', 'tint'], ['primary-deep', 'tint-strong'], ['nav-ink', 'tint'],
  ['tooltip-ink', 'tooltip-bg'], ['primary-deep', 'bevel-top'], ['primary-deep', 'bevel-bottom'],
];
const NON_TEXT = [['control-border', 'surface'], ['control-border', 'dialog'], ['focus', 'bg'], ['focus', 'surface'], ['focus', 'dialog']];

describe.each(Object.entries(PALETTES))('%s palette', (name, t) => {
  it.each(TEXT)('text %s on %s is at least 4.5:1', (fg, bg) => {
    expect(t[fg], `--t-${fg}`).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(t[bg], `--t-${bg}`).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
  });
  it.each(NON_TEXT)('%s on %s is at least 3:1', (fg, bg) => {
    expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(3);
  });
  it('defines the same tokens as the other palette', () => {
    expect(Object.keys(t).sort()).toEqual(Object.keys(PALETTES.light).sort());
  });
});

describe('print is always light', () => {
  it('keeps every [data-theme="dark"] rule inside the @media screen block', () => {
    const start = css.indexOf('@media screen {');
    expect(start).toBeGreaterThanOrEqual(0);
    let depth = 0, end = -1;
    for (let i = css.indexOf('{', start); i < css.length; i++) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}' && --depth === 0) { end = i; break; }
    }
    expect(end).toBeGreaterThan(start);
    const NOT_DARK = ':not([data-theme="dark"])';
    const outside = css.slice(0, start) + css.slice(end + 1);
    expect(outside.split(NOT_DARK).join('').includes('[data-theme="dark"]')).toBe(false);
    expect(css.slice(start, end).includes('[data-theme="dark"]')).toBe(true);
  });
});
