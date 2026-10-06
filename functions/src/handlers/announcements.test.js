import { describe, it, expect } from 'vitest';
import { chunk, auditActionFor } from './announcements.js';

const ts = (ms) => ({ toMillis: () => ms });
const post = (over = {}) => ({ title: 'T', body: 'B', status: 'published', pinned: false, expiresAt: null, publishAt: ts(1), audienceKeys: ['all'], push: false, updatedAt: ts(1), ...over });

describe('chunk', () => {
  it('splits into slices of at most n', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 500)).toEqual([]);
  });
});

describe('auditActionFor', () => {
  it('names creation by its status', () => {
    expect(auditActionFor(null, post())).toBe('announcement.published');
    expect(auditActionFor(null, post({ status: 'scheduled' }))).toBe('announcement.scheduled');
  });
  it('names status moves and deletion', () => {
    expect(auditActionFor(post({ status: 'scheduled' }), post())).toBe('announcement.went_out');
    expect(auditActionFor(post(), post({ status: 'unpublished', updatedAt: ts(2) }))).toBe('announcement.unpublished');
    expect(auditActionFor(post(), post({ status: 'expired' }))).toBe('announcement.expired');
    expect(auditActionFor(post({ status: 'scheduled' }), null)).toBe('announcement.deleted');
  });
  it('names a staff edit (updatedAt moved and a staff field changed)', () => {
    expect(auditActionFor(post(), post({ title: 'T2', updatedAt: ts(2) }))).toBe('announcement.edited');
    expect(auditActionFor(post(), post({ expiresAt: ts(9), updatedAt: ts(2) }))).toBe('announcement.edited');
  });
  it('ignores Functions bookkeeping (push claim/result) and no-op touches', () => {
    expect(auditActionFor(post(), post({ pushResult: { status: 'sending' } }))).toBeNull();
    expect(auditActionFor(post(), post({ updatedAt: ts(2) }))).toBeNull();
    expect(auditActionFor(null, null)).toBeNull();
  });
});
