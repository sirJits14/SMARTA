import { describe, it, expect } from 'vitest';
import { createInstallStore, isIos } from './install.js';

// A window that can fire the install events and report display mode and user agent.
function fakeWin({ standalone = false, iosStandalone, userAgent = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130', platform = 'Win32', maxTouchPoints = 0 } = {}) {
  const handlers = {};
  return {
    navigator: { userAgent, platform, maxTouchPoints, standalone: iosStandalone },
    matchMedia: q => ({ matches: q === '(display-mode: standalone)' && standalone }),
    addEventListener: (type, fn) => { handlers[type] = fn; },
    removeEventListener: type => { delete handlers[type]; },
    fire: (type, event = {}) => handlers[type]?.(event),
    handlers,
  };
}

// Chrome's BeforeInstallPromptEvent: prompt() once, then userChoice settles.
function promptEvent(outcome) {
  const event = { prompted: 0, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  event.prompt = async () => { if (event.prompted++) throw new DOMException('already prompted'); };
  event.userChoice = Promise.resolve({ outcome, platform: 'web' });
  return event;
}

describe('install store', () => {
  it('reports installed when SIMS is already running as an installed app', () => {
    expect(createInstallStore({ win: fakeWin({ standalone: true }) }).getStatus()).toBe('installed');
    expect(createInstallStore({ win: fakeWin({ iosStandalone: true }) }).getStatus()).toBe('installed');
  });

  it('is unavailable until the browser offers the install prompt', () => {
    const win = fakeWin();
    const store = createInstallStore({ win });
    expect(store.getStatus()).toBe('unavailable');
    win.fire('beforeinstallprompt', promptEvent('accepted'));
    expect(store.getStatus()).toBe('available');
  });

  // Not cancelling it keeps Chrome's own install prompt for staff who never open Settings.
  it('leaves the browser default prompt in place', () => {
    const win = fakeWin();
    createInstallStore({ win });
    const event = promptEvent('accepted');
    win.fire('beforeinstallprompt', event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('shows the prompt once and becomes installed when the browser confirms', async () => {
    const win = fakeWin();
    const store = createInstallStore({ win });
    const event = promptEvent('accepted');
    win.fire('beforeinstallprompt', event);
    let calls = 0;
    store.subscribe(() => { calls++; });
    expect(await store.install()).toBe('accepted');
    expect(event.prompted).toBe(1);
    expect(await store.install()).toBe('unavailable'); // a prompt event can be used only once
    win.fire('appinstalled');
    expect(store.getStatus()).toBe('installed');
    expect(calls).toBeGreaterThan(0);
  });

  it('remembers a dismissal until the browser offers again', async () => {
    const win = fakeWin();
    const store = createInstallStore({ win });
    win.fire('beforeinstallprompt', promptEvent('dismissed'));
    expect(await store.install()).toBe('dismissed');
    expect(store.getStatus()).toBe('dismissed');
    win.fire('beforeinstallprompt', promptEvent('accepted'));
    expect(store.getStatus()).toBe('available');
  });

  it('treats a prompt the browser refuses as unavailable', async () => {
    const win = fakeWin();
    const store = createInstallStore({ win });
    const event = promptEvent('accepted');
    event.prompt = async () => { throw new DOMException('not allowed'); };
    win.fire('beforeinstallprompt', event);
    expect(await store.install()).toBe('unavailable');
    expect(store.getStatus()).toBe('unavailable');
  });

  it('gives iPhone and iPad users the Add to Home Screen route', () => {
    expect(createInstallStore({ win: fakeWin({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone' }) }).getStatus()).toBe('ios');
  });

  it('works without a window and stops listening on dispose', () => {
    expect(createInstallStore({ win: undefined }).getStatus()).toBe('unavailable');
    const win = fakeWin();
    createInstallStore({ win }).dispose();
    expect(win.handlers).toEqual({});
  });
});

describe('isIos', () => {
  it('spots iPhones, iPads and iPads that report a Mac', () => {
    expect(isIos({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)' })).toBe(true);
    expect(isIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
    expect(isIos({ userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130' })).toBe(false);
    expect(isIos(undefined)).toBe(false);
  });
});
