import { describe, it, expect } from 'vitest';
import { BUILD, versionLabel } from './buildInfo.js';

describe('buildInfo', () => {
  it('takes the build date from the Vite define', () => {
    expect(BUILD.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('labels the version with the date and commit', () => {
    expect(versionLabel({ date: '2026-10-07', commit: '960fb01' })).toBe('2026-10-07 (960fb01)');
  });
  it('shows only the date without a commit', () => {
    expect(versionLabel({ date: '2026-10-07', commit: 'dev' })).toBe('2026-10-07');
  });
});
