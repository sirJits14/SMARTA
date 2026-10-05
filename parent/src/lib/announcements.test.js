import { describe, it, expect } from 'vitest';
import { linkify, audienceText, splitForList, isNewSince, hasUnread, postDateLabel } from './announcements.js';
import S from '../strings.js';

const ms = (n) => ({ toMillis: () => n });

describe('linkify', () => {
  it('links http and https URLs and keeps the rest as text', () => {
    expect(linkify('See https://deped.gov.ph/memo and http://x.ph now')).toEqual([
      { type: 'text', value: 'See ' },
      { type: 'link', href: 'https://deped.gov.ph/memo', value: 'https://deped.gov.ph/memo' },
      { type: 'text', value: ' and ' },
      { type: 'link', href: 'http://x.ph', value: 'http://x.ph' },
      { type: 'text', value: ' now' },
    ]);
  });
  it('leaves trailing punctuation out of the link', () => {
    expect(linkify('Form: https://forms.gle/abc.')).toEqual([
      { type: 'text', value: 'Form: ' },
      { type: 'link', href: 'https://forms.gle/abc', value: 'https://forms.gle/abc' },
      { type: 'text', value: '.' },
    ]);
  });
  it('never links other schemes', () => {
    for (const t of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://x.ph', 'xhttps://x.ph']) {
      expect(linkify(t).every((p) => p.type === 'text')).toBe(true);
    }
    expect(linkify('')).toEqual([]);
  });
});

describe('audienceText', () => {
  it('says who a post is for', () => {
    expect(audienceText(['all'])).toBe('For all parents');
    expect(audienceText(['g7'])).toBe('For parents in Grade 7');
    expect(audienceText(['g7', 'g8'])).toBe('For parents in Grades 7 and 8');
    expect(audienceText(['g7', 'g8', 'g11'])).toBe('For parents in Grades 7, 8 and 11');
  });
});

describe('list', () => {
  it('drops expired posts and puts pinned ones in their own group, keeping order', () => {
    const rows = [
      { id: 'a', status: 'published', pinned: false },
      { id: 'b', status: 'published', pinned: true },
      { id: 'c', status: 'published', pinned: false, expiresAt: ms(5) },
    ];
    const { pinned, rest } = splitForList(rows, 10);
    expect(pinned.map((p) => p.id)).toEqual(['b']);
    expect(rest.map((p) => p.id)).toEqual(['a']);
  });
  it('marks posts newer than the last visit', () => {
    expect(isNewSince({ publishedAt: ms(5) }, ms(4))).toBe(true);
    expect(isNewSince({ publishedAt: ms(5) }, ms(5))).toBe(false);
    expect(isNewSince({ publishedAt: ms(5) }, null)).toBe(true);
    expect(isNewSince({ publishedAt: ms(5) }, undefined)).toBe(true);
  });
  it('shows the dot only for a visible post newer than the last visit', () => {
    const newest = { status: 'published', publishedAt: ms(5), expiresAt: null };
    expect(hasUnread(newest, ms(4), 10)).toBe(true);
    expect(hasUnread(newest, ms(6), 10)).toBe(false);
    expect(hasUnread({ ...newest, expiresAt: ms(8) }, ms(4), 10)).toBe(false);
    expect(hasUnread(undefined, null, 10)).toBe(false);
  });
});

describe('postDateLabel', () => {
  const now = new Date('2026-10-05T15:00:00+08:00');
  it('says Today with the time for today', () => {
    expect(postDateLabel(new Date('2026-10-05T07:30:00+08:00'), now)).toBe(`${S.announcementsToday}, 07:30 AM`);
  });
  it('says the month and day for earlier days, adding the year when it differs', () => {
    expect(postDateLabel(ms(Date.parse('2026-10-03T09:00:00+08:00')), now)).toBe('Oct 3');
    expect(postDateLabel(new Date('2025-12-24T09:00:00+08:00'), now)).toBe('Dec 24, 2025');
  });
});
