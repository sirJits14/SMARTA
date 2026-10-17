import { describe, it, expect } from 'vitest';
import { recallRelationship, rememberRelationship } from './lastRelationship.js';
import { RELATIONSHIPS, ADVISER } from './relationships.js';

const ALL = [...RELATIONSHIPS, ADVISER];
const fakeStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, map: m };
};
const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };

describe('lastRelationship', () => {
  it('uses the screen default when nothing was remembered', () => {
    expect(recallRelationship('u1', ALL, 'Mother', fakeStorage())).toBe('Mother');
  });
  it('preselects the last choice that was saved', () => {
    const s = fakeStorage();
    rememberRelationship('u1', 'Father', s);
    expect(recallRelationship('u1', ALL, 'Mother', s)).toBe('Father');
    rememberRelationship('u1', ADVISER, s);
    expect(recallRelationship('u1', ALL, 'Mother', s)).toBe(ADVISER);
  });
  it('stores it under a per-account key', () => {
    const s = fakeStorage();
    rememberRelationship('u1', 'Grandparent', s);
    expect(s.map.get('bnhs-parent-last-relationship:u1')).toBe('Grandparent');
  });
  it('keeps each account on a shared phone separate', () => {
    const s = fakeStorage();
    rememberRelationship('mom', 'Mother', s);
    rememberRelationship('dad', 'Father', s);
    expect(recallRelationship('mom', ALL, 'Mother', s)).toBe('Mother');
    expect(recallRelationship('dad', ALL, 'Mother', s)).toBe('Father');
    expect(recallRelationship('someone-else', ALL, 'Mother', s)).toBe('Mother');
  });
  it('ignores a remembered choice the screen does not offer', () => {
    const s = fakeStorage();
    rememberRelationship('u1', ADVISER, s);
    // Request access has no Adviser option.
    expect(recallRelationship('u1', RELATIONSHIPS, 'Guardian', s)).toBe('Guardian');
    s.map.set('bnhs-parent-last-relationship:u1', 'Uncle'); // edited by hand or from an old build
    expect(recallRelationship('u1', ALL, 'Mother', s)).toBe('Mother');
  });
  it('does nothing without a signed-in account', () => {
    const s = fakeStorage();
    rememberRelationship(undefined, 'Father', s);
    expect(s.map.size).toBe(0);
    expect(recallRelationship(undefined, ALL, 'Mother', s)).toBe('Mother');
  });
  it('falls back quietly when storage is missing or blocked', () => {
    expect(recallRelationship('u1', ALL, 'Mother', null)).toBe('Mother');
    expect(recallRelationship('u1', ALL, 'Mother', blocked)).toBe('Mother');
    expect(() => rememberRelationship('u1', 'Father', blocked)).not.toThrow();
    expect(() => rememberRelationship('u1', 'Father', null)).not.toThrow();
  });
});
