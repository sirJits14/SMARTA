import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { readPref, resolveTheme } from './theme.js';
import { fakeEnv } from './testEnv.js';

const html = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const bootOf = (source) => {
  const match = source.match(/<script id="theme-boot">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('missing <script id="theme-boot">');
  return match[1];
};
const normalize = (code) => code.replace(/\s+/g, ' ').trim();
const SIMS = html('../../index.html');
const PARENT = html('../../parent/index.html');

describe('pre-paint theme script', () => {
  it('is the same script in both apps', () => {
    expect(normalize(bootOf(SIMS))).toBe(normalize(bootOf(PARENT)));
  });
  it('comes after the theme-color meta it updates', () => {
    for (const page of [SIMS, PARENT]) {
      expect(page.indexOf('name="theme-color"')).toBeGreaterThan(-1);
      expect(page.indexOf('name="theme-color"')).toBeLessThan(page.indexOf('id="theme-boot"'));
      expect(page).toMatch(/name="theme-color"[^>]*data-light="#[0-9a-fA-F]{6}"[^>]*data-dark="#0e1c1f"/);
    }
  });
  const run = (env) => new Function('window', 'document', 'localStorage', bootOf(SIMS))(env.win, env.doc, env.storage);
  const cases = [undefined, 'auto', 'light', 'dark', 'purple'].flatMap((stored) =>
    [false, true].flatMap((dark) => [false, true].map((blocked) => ({ stored, dark, blocked }))));
  it.each(cases)('agrees with theme.js for %o', (opts) => {
    const env = fakeEnv(opts);
    run(env);
    const expected = resolveTheme(readPref(env.storage), opts.dark);
    expect(env.theme()).toBe(expected);
    expect(env.meta.getAttribute('content')).toBe(env.meta.getAttribute(`data-${expected}`));
  });
  it('falls back to light when matchMedia is missing', () => {
    const env = fakeEnv({ stored: 'auto' });
    delete env.win.matchMedia;
    run(env);
    expect(env.theme()).toBe('light');
  });
});
