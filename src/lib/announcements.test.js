import { describe, it, expect } from 'vitest';
import { tabOf, postsForTab, audienceLabel, pushStatusText, pinnedCount, audienceOf, emptyForm, formFromPost, validateForm } from './announcements.js';

const ms = (n) => ({ toMillis: () => n, toDate: () => new Date(n) });
const admin = { role: 'admin' }, jhs = { role: 'jhs_coord' }, glc8 = { role: 'glc', gradeLevel: 8 };
const NOW = Date.parse('2026-10-05T08:00:00+08:00');
const form = (over = {}) => ({ title: 'Brigada', body: 'Bring brooms.', all: true, grades: [], when: 'now', date: '', time: '', expires: '', pinned: false, push: false, ...over });

describe('tabs', () => {
  const posts = [
    { id: 'a', status: 'published', pinned: false, publishedAt: ms(3) },
    { id: 'b', status: 'published', pinned: true, publishedAt: ms(1) },
    { id: 'c', status: 'published', pinned: false, publishedAt: ms(5) },
    { id: 'd', status: 'scheduled', publishAt: ms(9) },
    { id: 'e', status: 'scheduled', publishAt: ms(7) },
    { id: 'f', status: 'unpublished', updatedAt: ms(2) },
    { id: 'g', status: 'expired', updatedAt: ms(4) },
  ];
  it('puts each status in its tab', () => {
    expect(tabOf(posts[0])).toBe('live');
    expect(tabOf(posts[3])).toBe('scheduled');
    expect(tabOf(posts[5])).toBe('ended');
  });
  it('sorts live pinned-first then newest, scheduled soonest, ended newest', () => {
    expect(postsForTab(posts, 'live').map((p) => p.id)).toEqual(['b', 'c', 'a']);
    expect(postsForTab(posts, 'scheduled').map((p) => p.id)).toEqual(['e', 'd']);
    expect(postsForTab(posts, 'ended').map((p) => p.id)).toEqual(['g', 'f']);
  });
  it('counts pinned published and scheduled posts, except the one being edited', () => {
    const pins = [{ id: 'x', status: 'published', pinned: true }, { id: 'y', status: 'scheduled', pinned: true }, { id: 'z', status: 'expired', pinned: true }];
    expect(pinnedCount(pins)).toBe(2);
    expect(pinnedCount(pins, 'x')).toBe(1);
  });
});

describe('labels', () => {
  it('describes the audience', () => {
    expect(audienceLabel(['all'])).toBe('All parents');
    expect(audienceLabel(['g7', 'g8'])).toBe('Grade 7 · Grade 8');
  });
  it('describes the push state', () => {
    expect(pushStatusText({ push: false })).toBe('No push');
    expect(pushStatusText({ push: true })).toBe('Push pending');
    expect(pushStatusText({ push: true, pushResult: { status: 'sending' } })).toBe('Push pending');
    expect(pushStatusText({ push: true, pushResult: { status: 'sent', devices: 7000, sent: 6812 } })).toBe('Push sent to 6,812 devices');
    expect(pushStatusText({ push: true, pushResult: { status: 'sent', devices: 3, sent: 1 } })).toBe('Push sent to 1 device');
    expect(pushStatusText({ push: true, pushResult: { status: 'skipped_paused' } })).toBe('Push skipped: notifications paused');
    expect(pushStatusText({ push: true, pushResult: { status: 'interrupted' } })).toBe('Push may not have reached everyone');
    expect(pushStatusText({ push: true, pushResult: { status: 'failed' } })).toBe('Push may not have reached everyone');
  });
});

describe('form', () => {
  it('starts empty; a single-grade coordinator gets their grade', () => {
    expect(emptyForm(admin)).toMatchObject({ all: false, grades: [], when: 'now', push: false });
    expect(emptyForm(glc8).grades).toEqual([8]);
  });
  it('maps the form audience', () => {
    expect(audienceOf(form())).toEqual({ all: true });
    expect(audienceOf(form({ all: false, grades: [9, 7] }))).toEqual({ grades: [7, 9] });
  });
  it('reads a post back into the form in Philippine time', () => {
    const f = formFromPost({ title: 'T', body: 'B', audience: { grades: [7] }, status: 'scheduled', publishAt: ms(Date.parse('2026-10-06T07:30:00+08:00')), expiresAt: ms(Date.parse('2026-10-09T23:59:59.999+08:00')), pinned: true, push: true });
    expect(f).toEqual({ title: 'T', body: 'B', all: false, grades: [7], when: 'schedule', date: '2026-10-06', time: '07:30', expires: '2026-10-09', pinned: true, push: true });
  });
  it('validates content, scope, schedule, expiry and pins', () => {
    const v = (f, o = {}) => validateForm(f, { me: admin, nowMs: NOW, pinnedCount: 0, editing: null, ...o });
    expect(v(form())).toBeNull();
    expect(v(form({ title: '  ' }))).toBe('Enter a title.');
    expect(v(form({ title: 'x'.repeat(121) }))).toBe('The title can be at most 120 characters.');
    expect(v(form({ body: '' }))).toBe('Enter a message.');
    expect(v(form({ body: 'x'.repeat(5001) }))).toBe('The message can be at most 5,000 characters.');
    expect(v(form({ all: false, grades: [] }))).toBe('Choose who the announcement is for.');
    expect(v(form(), { me: jhs })).toBe('Only administrators can post to all parents.');
    expect(v(form({ all: false, grades: [11] }), { me: jhs })).toBe('You can only post to your own grades.');
    expect(v(form({ when: 'schedule', date: '', time: '' }))).toBe('Choose a date and time to publish.');
    expect(v(form({ when: 'schedule', date: '2026-10-05', time: '07:00' }))).toBe('Choose a publish time in the future.');
    expect(v(form({ when: 'schedule', date: '2026-10-05', time: '09:00' }))).toBeNull();
    expect(v(form({ expires: '2026-10-04' }))).toBe('The expiry date must be after the publish time.');
    expect(v(form({ pinned: true }), { pinnedCount: 3 })).toBe('Only 3 announcements can be pinned at once. Unpin one first.');
    expect(v(form({ pinned: true }), { pinnedCount: 3, editing: { pinned: true } })).toBeNull();
  });
  it('does not re-check the schedule of a live post being edited', () => {
    const live = { status: 'published', pinned: false };
    expect(validateForm(form({ when: 'schedule', date: '2026-01-01', time: '07:00' }), { me: admin, nowMs: NOW, pinnedCount: 0, editing: live })).toBeNull();
  });
});
