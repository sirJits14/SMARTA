import { describe, it, expect } from 'vitest';
import { retentionCutoffs } from './retention.js';
const DAY = 86400_000;
describe('retentionCutoffs', () => {
  const now = Date.parse('2026-09-21T00:00:00Z');
  const c = retentionCutoffs({ currentSchoolYear: '2026-2027', nowMs: now });
  it('keeps current + previous school year of events', () => expect(c.eventsBefore).toBe('2025-06-01'));
  it('uses the spec windows', () => {
    expect(c.resolvedBeforeMs).toBe(now - 365 * DAY);
    expect(c.linksBeforeMs).toBe(now - 365 * DAY);
    expect(c.codesBeforeMs).toBe(now - 365 * DAY);
    expect(c.auditBeforeMs).toBe(now - 730 * DAY);
    expect(c.dormantBeforeMs).toBe(now - 365 * DAY);
    expect(c.devicesStaleBeforeMs).toBe(now - 60 * DAY);
    expect(c.devicesDisabledBeforeMs).toBe(now - 7 * DAY);
  });
});
