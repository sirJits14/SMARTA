import { describe, it, expect } from 'vitest';
import { PREFS, STORAGE_KEY, readPref, writePref, resolveTheme, applyTheme, stepPref, createThemeStore } from './theme.js';
import { fakeEnv } from './testEnv.js';

describe('readPref / writePref', () => {
  it('defaults to auto when nothing, junk, or blocked storage', () => {
    expect(readPref(fakeEnv().storage)).toBe('auto');
    expect(readPref(fakeEnv({ stored: 'purple' }).storage)).toBe('auto');
    expect(readPref(fakeEnv({ stored: 'light', blocked: true }).storage)).toBe('auto');
    expect(readPref(undefined)).toBe('auto');
  });
  it('reads every valid value', () => {
    for (const p of PREFS) expect(readPref(fakeEnv({ stored: p }).storage)).toBe(p);
  });
  it('writes, and swallows a blocked storage error', () => {
    const env = fakeEnv();
    writePref('dark', env.storage);
    expect(env.data.get(STORAGE_KEY)).toBe('dark');
    expect(() => writePref('dark', fakeEnv({ blocked: true }).storage)).not.toThrow();
  });
});

describe('resolveTheme', () => {
  it('follows the device only on auto', () => {
    expect(resolveTheme('auto', false)).toBe('light');
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('applyTheme', () => {
  it('sets data-theme and the theme-color meta', () => {
    const env = fakeEnv();
    applyTheme('dark', env.doc);
    expect(env.theme()).toBe('dark');
    expect(env.meta.getAttribute('content')).toBe('#0e1c1f');
    applyTheme('light', env.doc);
    expect(env.meta.getAttribute('content')).toBe('#00A79D');
  });
  it('tolerates a page without the meta', () => {
    const env = fakeEnv();
    env.doc.querySelector = () => null;
    expect(() => applyTheme('dark', env.doc)).not.toThrow();
    expect(env.theme()).toBe('dark');
  });
});

describe('stepPref', () => {
  it('moves through Auto, Light, Dark with wrap-around', () => {
    expect(stepPref('auto', 'ArrowRight')).toBe('light');
    expect(stepPref('light', 'ArrowDown')).toBe('dark');
    expect(stepPref('dark', 'ArrowRight')).toBe('auto');
    expect(stepPref('auto', 'ArrowLeft')).toBe('dark');
    expect(stepPref('light', 'ArrowUp')).toBe('auto');
    expect(stepPref('dark', 'Home')).toBe('auto');
    expect(stepPref('auto', 'End')).toBe('dark');
  });
  it('ignores other keys, including Object.prototype names', () => {
    expect(stepPref('auto', 'Enter')).toBeNull();
    expect(stepPref('auto', 'toString')).toBeNull();
  });
});

describe('createThemeStore', () => {
  it('starts from storage and the device, and applies once', () => {
    const env = fakeEnv({ stored: 'auto', dark: true });
    const store = createThemeStore({ win: env.win });
    expect(store.getPref()).toBe('auto');
    expect(store.getTheme()).toBe('dark');
    expect(env.theme()).toBe('dark');
    store.dispose();
  });
  it('setPref saves, applies, notifies, and cross-fades only on a real change', () => {
    const env = fakeEnv({ dark: false });
    const store = createThemeStore({ win: env.win });
    let calls = 0;
    store.subscribe(() => { calls += 1; });
    store.setPref('dark');
    expect(env.data.get(STORAGE_KEY)).toBe('dark');
    expect(env.theme()).toBe('dark');
    expect(calls).toBe(1);
    expect(env.classes.has('theme-switching')).toBe(true);
    env.timers.forEach((fn) => fn());
    expect(env.classes.has('theme-switching')).toBe(false);
    store.setPref('dark');
    expect(calls).toBe(1);
    store.setPref('purple');
    expect(store.getPref()).toBe('dark');
    store.dispose();
  });
  it('switching between auto and the same resolved theme does not cross-fade', () => {
    const env = fakeEnv({ stored: 'auto', dark: false });
    const store = createThemeStore({ win: env.win });
    store.setPref('light');
    expect(env.classes.has('theme-switching')).toBe(false);
    store.dispose();
  });
  it('follows the device on auto, but not on a fixed choice', () => {
    const env = fakeEnv({ stored: 'auto', dark: false });
    const store = createThemeStore({ win: env.win });
    env.flipSystem(true);
    expect(store.getTheme()).toBe('dark');
    expect(env.theme()).toBe('dark');
    store.setPref('light');
    env.flipSystem(false);
    env.flipSystem(true);
    expect(env.theme()).toBe('light');
    store.dispose();
  });
  it('syncs a change made in another tab', () => {
    const env = fakeEnv({ stored: 'light' });
    const store = createThemeStore({ win: env.win });
    env.otherTab('dark');
    expect(store.getPref()).toBe('dark');
    expect(env.theme()).toBe('dark');
    store.dispose();
  });
  it('still switches for the session when storage is blocked', () => {
    const env = fakeEnv({ blocked: true });
    const store = createThemeStore({ win: env.win });
    expect(store.getPref()).toBe('auto');
    store.setPref('dark');
    expect(store.getPref()).toBe('dark');
    expect(env.theme()).toBe('dark');
    store.dispose();
  });
  it('treats a browser without matchMedia as light on auto', () => {
    const env = fakeEnv();
    delete env.win.matchMedia;
    const store = createThemeStore({ win: env.win });
    expect(store.getTheme()).toBe('light');
    store.dispose();
  });
  it('dispose stops device and tab listeners', () => {
    const env = fakeEnv({ stored: 'auto' });
    const store = createThemeStore({ win: env.win });
    store.dispose();
    expect(env.media.handlers.size).toBe(0);
    expect(env.winHandlers.size).toBe(0);
  });
});
