import { describe, it, expect, vi } from 'vitest';
import { createInstallPrompt } from './installPrompt.js';

function promptEvent(outcome) {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  e.prompt = vi.fn(async () => {});
  e.userChoice = Promise.resolve({ outcome });
  return e;
}
const setup = () => { const target = new EventTarget(); return { target, p: createInstallPrompt(target) }; };

describe('createInstallPrompt', () => {
  it('starts idle', () => {
    expect(setup().p.state()).toBe('idle');
  });
  it('holds the browser prompt instead of letting the browser show it', () => {
    const { target, p } = setup();
    const e = promptEvent('accepted');
    target.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(p.state()).toBe('ready');
  });
  it('shows the held prompt and reports an accepted install', async () => {
    const { target, p } = setup();
    const e = promptEvent('accepted');
    target.dispatchEvent(e);
    expect(await p.prompt()).toBe('accepted');
    expect(e.prompt).toHaveBeenCalledOnce();
    expect(p.state()).toBe('installed');
  });
  it('goes back to idle when the parent dismisses it', async () => {
    const { target, p } = setup();
    target.dispatchEvent(promptEvent('dismissed'));
    expect(await p.prompt()).toBe('dismissed');
    expect(p.state()).toBe('idle');
  });
  it('marks installed when the browser reports appinstalled', () => {
    const { target, p } = setup();
    target.dispatchEvent(promptEvent('accepted'));
    target.dispatchEvent(new Event('appinstalled'));
    expect(p.state()).toBe('installed');
  });
  it('returns unavailable when nothing is held', async () => {
    expect(await setup().p.prompt()).toBe('unavailable');
  });
  it('still notifies subscribers and goes idle when the browser prompt fails', async () => {
    const { target, p } = setup();
    const e = promptEvent('accepted');
    e.prompt = vi.fn(async () => { throw new Error('nope'); });
    target.dispatchEvent(e);
    const fn = vi.fn();
    p.subscribe(fn);
    await expect(p.prompt()).rejects.toThrow('nope');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(p.state()).toBe('idle');
  });
  it('notifies subscribers until they unsubscribe', () => {
    const { target, p } = setup();
    const fn = vi.fn();
    const off = p.subscribe(fn);
    target.dispatchEvent(promptEvent('accepted'));
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    target.dispatchEvent(new Event('appinstalled'));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
