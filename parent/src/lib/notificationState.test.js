import { describe, it, expect } from 'vitest';
import { notificationState } from './notificationState.js';
const base = { supported: true, permission: 'default', isIOS: false, isStandalone: true, registered: false, accountEnabled: true };
describe('notificationState', () => {
  it('walks the decision tree', () => {
    expect(notificationState({ ...base, supported: false })).toBe('unsupported');
    expect(notificationState({ ...base, supported: false, isIOS: true, isStandalone: false })).toBe('ios_needs_install');
    expect(notificationState({ ...base, permission: 'denied' })).toBe('blocked');
    expect(notificationState({ ...base, accountEnabled: false, permission: 'granted', registered: true })).toBe('account_off');
    expect(notificationState({ ...base, permission: 'granted', registered: false })).toBe('off');
    expect(notificationState({ ...base })).toBe('off');
    expect(notificationState({ ...base, permission: 'granted', registered: true })).toBe('on');
  });
});
