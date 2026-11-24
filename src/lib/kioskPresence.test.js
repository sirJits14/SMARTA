import { describe, it, expect } from 'vitest';
import { ONLINE_WINDOW_MS, formatAgo, kioskPresence, modeChangeNote, visibleKiosks } from './kioskPresence.js';

const NOW = Date.parse('2026-11-24T10:00:00+08:00');
const ts = (ms) => ({ toMillis: () => ms });

describe('formatAgo', () => {
  it('rounds into the largest unit', () => {
    expect(formatAgo(NOW - 20_000, NOW)).toBe('just now');
    expect(formatAgo(NOW - 5 * 60_000, NOW)).toBe('5m ago');
    expect(formatAgo(NOW - 2 * 3600_000, NOW)).toBe('2h ago');
    expect(formatAgo(NOW - 3 * 86400_000, NOW)).toBe('3d ago');
    expect(formatAgo(NOW + 10_000, NOW)).toBe('just now');
  });
});

describe('kioskPresence', () => {
  it('is deactivated whenever active is not true', () => {
    expect(kioskPresence({ active: false, lastSeenAt: ts(NOW) }, NOW)).toEqual({ state: 'deactivated', label: 'Deactivated' });
  });
  it('is online up to and including the 5-minute window', () => {
    expect(kioskPresence({ active: true, lastSeenAt: ts(NOW - ONLINE_WINDOW_MS) }, NOW).state).toBe('online');
    expect(kioskPresence({ active: true, lastSeenAt: new Date(NOW - 60_000) }, NOW)).toEqual({ state: 'online', label: 'Online' });
  });
  it('is offline past the window, with how long ago', () => {
    expect(kioskPresence({ active: true, lastSeenAt: ts(NOW - ONLINE_WINDOW_MS - 1000) }, NOW))
      .toEqual({ state: 'offline', label: 'Offline · last seen 5m ago' });
    expect(kioskPresence({ active: true, lastSeenAt: ts(NOW - 2 * 3600_000) }, NOW).label).toBe('Offline · last seen 2h ago');
  });
  it('is offline and never seen without lastSeenAt', () => {
    expect(kioskPresence({ active: true }, NOW)).toEqual({ state: 'offline', label: 'Offline · never seen' });
  });
});

describe('modeChangeNote', () => {
  it('says not reported yet without a valid mode', () => {
    expect(modeChangeNote({})).toBe('not reported yet');
    expect(modeChangeNote({ mode: 'sideways' })).toBe('not reported yet');
  });
  it('names the kiosk or the staff member', () => {
    expect(modeChangeNote({ mode: 'exit', modeChangedBy: 'kiosk', modeChangedAt: ts(NOW) })).toMatch(/^changed at the kiosk, /);
    expect(modeChangeNote({ mode: 'exit', modeChangedBy: 'r@bnhs.edu', modeChangedByName: 'Sir Geths', modeChangedAt: ts(NOW) }))
      .toMatch(/^changed by Sir Geths, /);
    expect(modeChangeNote({ mode: 'entrance', modeChangedBy: 'r@bnhs.edu' })).toBe('changed by r@bnhs.edu');
  });
});

describe('visibleKiosks', () => {
  it('drops deleted kiosks only', () => {
    expect(visibleKiosks([{ id: 'a' }, { id: 'b', deleted: true }, { id: 'c', active: false }]).map((k) => k.id)).toEqual(['a', 'c']);
  });
});
