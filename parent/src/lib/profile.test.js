import { describe, it, expect } from 'vitest';
import { profileFrom } from './profile.js';
import { hasUnread } from './announcements.js';

const NOW = Date.parse('2026-10-09T08:00:00+08:00');
const at = (iso) => ({ toMillis: () => Date.parse(iso) });
const post = { status: 'published', publishedAt: at('2026-10-08T09:00:00+08:00') };

// A guardians/{uid} snapshot right after opening Notices: announcementsSeenAt
// was just written with serverTimestamp() and the server hasn't confirmed it.
// Firestore's default read ('none') gives null for it; 'previous' gives the
// value from before the write.
const pendingSeenAt = (previous) => ({
  id: 'g1',
  data: (opts = {}) => ({ email: 'a@x', announcementsSeenAt: opts.serverTimestamps === 'previous' ? previous : null }),
});

describe('profileFrom', () => {
  it('keeps the previous seen-at while a new one is pending, so a viewed post stays viewed', () => {
    const profile = profileFrom(pendingSeenAt(at('2026-10-08T10:00:00+08:00')));
    expect(profile.announcementsSeenAt.toMillis()).toBe(Date.parse('2026-10-08T10:00:00+08:00'));
    expect(hasUnread(post, profile.announcementsSeenAt, NOW)).toBe(false);
  });
  it('still shows a post newer than the previous visit as unread', () => {
    const profile = profileFrom(pendingSeenAt(at('2026-10-07T10:00:00+08:00')));
    expect(hasUnread(post, profile.announcementsSeenAt, NOW)).toBe(true);
  });
  it('carries the doc id and other fields', () => {
    expect(profileFrom(pendingSeenAt(null))).toMatchObject({ id: 'g1', email: 'a@x' });
  });
});
