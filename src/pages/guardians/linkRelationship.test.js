import { describe, it, expect } from 'vitest';
import { relationshipChangeNote } from './linkRelationship.js';

describe('relationshipChangeNote', () => {
  it('names the old relationship for a change made this school year', () => {
    expect(relationshipChangeNote({ schoolYear: '2026-2027', relationship: 'Adviser', previousRelationship: 'Mother', relationshipChangedFor: '2026-2027' })).toBe('changed from Mother');
  });
  it('is empty for links never changed, or changed in an earlier school year', () => {
    expect(relationshipChangeNote({ schoolYear: '2026-2027', relationship: 'Mother' })).toBeNull();
    expect(relationshipChangeNote({ schoolYear: '2026-2027', relationship: 'Adviser', previousRelationship: 'Mother', relationshipChangedFor: '2025-2026' })).toBeNull();
    expect(relationshipChangeNote({ schoolYear: '2026-2027', relationship: 'Adviser', previousRelationship: null, relationshipChangedFor: '2026-2027' })).toBeNull();
  });
});
